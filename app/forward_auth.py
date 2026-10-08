"""Verify the signed identity supplied by the dedicated Authentik proxy provider."""

import math
import re
from ipaddress import IPv6Address
from pathlib import Path
from urllib.parse import urlsplit

import jwt
from flask import Flask, g, jsonify, render_template, request, session


_SHARE_PATH = re.compile(r"/d/[1-9][0-9]*\Z")
_ASSET_PATH = re.compile(
    r"/(?:static/)?(?:logo\.png|apple-touch-icon\.png|manifest\.webmanifest|"
    r"public-pages\.css|icons/icon-(?:192|512|512-maskable)\.png|sw\.js|"
    r"workbox-[A-Za-z0-9_-]+\.js|assets/[A-Za-z0-9_.-]+\.(?:js|css|woff2|png))\Z"
)
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _https_url(value: str, *, origin: bool = False) -> bool:
    try:
        parsed = urlsplit(value)
        valid = bool(
            parsed.scheme == "https" and parsed.hostname and parsed.port != 0
            and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment
        )
        if not valid:
            return False
        hostname = parsed.hostname.encode("idna").decode("ascii").lower()
        if ":" in hostname:
            hostname = f"[{IPv6Address(hostname).compressed}]"
        elif len(hostname) > 253 or not all(
            re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
            for label in hostname.split(".")
        ):
            return False
        if not origin:
            return True
        port = f":{parsed.port}" if parsed.port and parsed.port != 443 else ""
        return value == f"https://{hostname}{port}"
    except (ValueError, UnicodeError):
        return False


def _load_client_secret(app: Flask) -> str:
    for name in (
        "APP_ORIGIN", "AUTHENTIK_PROXY_ISSUER", "AUTHENTIK_PROXY_CLIENT_ID",
        "AUTHENTIK_REQUIRED_GROUP", "AUTHENTIK_PROXY_CLIENT_SECRET_FILE",
    ):
        if not app.config.get(name):
            raise ValueError(f"{name} is required when AUTH_MODE=forward")
    if not _https_url(app.config["APP_ORIGIN"], origin=True):
        raise ValueError("APP_ORIGIN must be a canonical HTTPS origin (lowercase host, no default port or path)")
    if not _https_url(app.config["AUTHENTIK_PROXY_ISSUER"]):
        raise ValueError("AUTHENTIK_PROXY_ISSUER must be an HTTPS URL")
    if not app.config["SESSION_COOKIE_SECURE"]:
        raise ValueError("SESSION_COOKIE_SECURE must be true when AUTH_MODE=forward")
    if len(app.config["SECRET_KEY"].encode()) < 32:
        raise ValueError("SECRET_KEY must contain at least 32 bytes when AUTH_MODE=forward")
    try:
        secret = Path(app.config["AUTHENTIK_PROXY_CLIENT_SECRET_FILE"]).read_text().strip()
    except (OSError, UnicodeError) as exc:
        raise ValueError(
            "AUTHENTIK_PROXY_CLIENT_SECRET_FILE must contain the dedicated proxy client secret"
        ) from exc
    if not 32 <= len(secret.encode()) <= 4096 or secret.startswith("-----BEGIN") or any(c.isspace() for c in secret):
        raise ValueError(
            "AUTHENTIK_PROXY_CLIENT_SECRET_FILE must contain a proxy secret of at least 32 bytes"
        )
    return secret


def is_public_request(app: Flask) -> bool:
    """Keep the public bypass limited to existing assets and canonical share URLs."""
    if _SHARE_PATH.fullmatch(request.path):
        return request.method in {"GET", "HEAD", "POST"} and request.endpoint in {
            "web.public_download", "web.unlock_public_item",
        }
    if request.method not in {"GET", "HEAD"}:
        return False
    if (request.path, request.endpoint) in {
        ("/api/health", "api.health"), ("/api/auth-required", "api.auth_required"),
    }:
        return True
    if _ASSET_PATH.fullmatch(request.path):
        filename = request.path.removeprefix("/").removeprefix("static/")
        return (Path(app.static_folder) / filename).is_file()
    return False


def _identity(app: Flask, client_secret: str) -> dict | None:
    token = request.headers.get("X-authentik-jwt", "")
    if not token or len(token) > 32768:
        app.logger.debug("Forward authentication rejected: missing or oversized identity token")
        return None
    try:
        claims = jwt.decode(
            token, client_secret, algorithms=["HS256"],
            issuer=app.config["AUTHENTIK_PROXY_ISSUER"],
            audience=app.config["AUTHENTIK_PROXY_CLIENT_ID"],
            options={"require": ["exp", "iss", "aud", "sub"], "strict_aud": True, "verify_iat": False},
        )
        expires = claims["exp"]
        groups = claims.get("groups")
        issued_at = claims.get("iat")
        if (
            not isinstance(claims["sub"], str) or not claims["sub"].strip()
            or isinstance(expires, bool) or not isinstance(expires, (int, float))
            or not math.isfinite(expires)
            or not isinstance(groups, list) or any(not isinstance(group, str) for group in groups)
            or app.config["AUTHENTIK_REQUIRED_GROUP"] not in groups
            or ("iat" in claims and (
                isinstance(issued_at, bool) or not isinstance(issued_at, (int, float))
                or not math.isfinite(issued_at)
            ))
        ):
            app.logger.info("Forward authentication rejected: invalid subject, expiry, issued-at, or access group")
            return None
        return {"sub": claims["sub"]}
    except (jwt.PyJWTError, ValueError, TypeError, OverflowError, RecursionError) as exc:
        # Exception class is useful for clock/key/provider diagnosis; never log token/claims.
        app.logger.info("Forward authentication rejected: %s", type(exc).__name__)
        return None


def configure_forward_auth(app: Flask) -> None:
    mode = app.config["AUTH_MODE"]
    if mode not in {"forward", "development"}:
        raise ValueError("AUTH_MODE must be forward or development")
    # The supported proxy-provider contract signs with its dedicated client secret.
    # Cache it once; verification makes no IdP/network calls during an outage.
    client_secret = _load_client_secret(app) if mode == "forward" else None
    if mode == "development":
        app.logger.warning("AUTH_MODE=development: workspace authentication is disabled; use only a local development server")
    else:
        app.logger.info("Authentication mode: forward (local HS256 verification)")

    def valid_origin() -> bool:
        return (
            request.headers.get("Origin") == app.config["APP_ORIGIN"]
            and request.headers.get("X-Saita-CSRF") == "1"
            and request.headers.get("Sec-Fetch-Site") not in {"cross-site", "same-site"}
        )

    def origin_error():
        return jsonify(error="Request origin could not be verified.", code="INVALID_ORIGIN"), 403

    @app.before_request
    def authenticate_request():
        g.forward_identity = None
        if request.path == "/outpost.goauthentik.io" or request.path.startswith("/outpost.goauthentik.io/"):
            return jsonify(error="Outpost routes must be served by the authentication proxy."), 404
        if mode == "development":
            return None
        # Clearing this browser's unlock cookie must still work after identity expiry.
        if request.path == "/api/auth/logout" and request.endpoint == "logout" and request.method == "POST":
            return None if valid_origin() else origin_error()
        if is_public_request(app):
            return None
        g.forward_identity = _identity(app, client_secret)
        if g.forward_identity is None:
            if request.path == "/api" or request.path.startswith("/api/"):
                return jsonify(error="Sign in to continue.", code="AUTH_REQUIRED", loginUrl="/"), 401
            return render_template("auth_required.html"), 401
        from app.services.item_access import bind_authenticated_unlocks
        bind_authenticated_unlocks(g.forward_identity["sub"])
        if request.method not in _SAFE_METHODS and not valid_origin():
            return origin_error()
        return None

    @app.after_request
    def prevent_private_caching(response):
        from app.services.item_access import enforce_unlock_cookie_budget
        enforce_unlock_cookie_budget(app)
        # Public assets contain no identity/data; all other responses may be private.
        if not (_ASSET_PATH.fullmatch(request.path) and is_public_request(app)):
            response.headers["Cache-Control"] = "no-store, private"
            response.headers["Pragma"] = "no-cache"
        if request.path in {"/sw.js", "/static/sw.js"}:
            response.headers["Cache-Control"] = "no-cache"
            response.headers["Service-Worker-Allowed"] = "/"
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify(logoutUrl="/outpost.goauthentik.io/sign_out" if mode == "forward" else "/")
