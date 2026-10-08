"""Verify the signed identity supplied by the dedicated Authentik proxy provider."""

import math
import re
from pathlib import Path
from urllib.parse import urlsplit

import jwt
from flask import Flask, g, jsonify, request, session


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
        return bool(
            parsed.scheme == "https" and parsed.hostname and parsed.port != 0
            and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment
            and (not origin or value == f"https://{parsed.netloc}")
        )
    except ValueError:
        return False


def _load_client_secret(app: Flask) -> str:
    for name in (
        "APP_ORIGIN", "AUTHENTIK_PROXY_ISSUER", "AUTHENTIK_PROXY_CLIENT_ID",
        "AUTHENTIK_REQUIRED_GROUP", "AUTHENTIK_PROXY_CLIENT_SECRET_FILE",
    ):
        if not app.config.get(name):
            raise ValueError(f"{name} is required when AUTH_MODE=forward")
    if not _https_url(app.config["APP_ORIGIN"], origin=True):
        raise ValueError("APP_ORIGIN must be an HTTPS origin without a path")
    if not _https_url(app.config["AUTHENTIK_PROXY_ISSUER"]):
        raise ValueError("AUTHENTIK_PROXY_ISSUER must be an HTTPS URL")
    if not app.config["SESSION_COOKIE_SECURE"]:
        raise ValueError("SESSION_COOKIE_SECURE must be true when AUTH_MODE=forward")
    try:
        secret = Path(app.config["AUTHENTIK_PROXY_CLIENT_SECRET_FILE"]).read_text().strip()
    except (OSError, UnicodeError) as exc:
        raise ValueError(
            "AUTHENTIK_PROXY_CLIENT_SECRET_FILE must contain the dedicated proxy client secret"
        ) from exc
    if len(secret.encode()) < 32 or secret.startswith("-----BEGIN"):
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
        return None
    try:
        claims = jwt.decode(
            token, client_secret, algorithms=["HS256"],
            issuer=app.config["AUTHENTIK_PROXY_ISSUER"],
            audience=app.config["AUTHENTIK_PROXY_CLIENT_ID"],
            options={"require": ["exp", "iss", "aud", "sub"], "strict_aud": True},
        )
        expires = claims["exp"]
        groups = claims.get("groups")
        if (
            not isinstance(claims["sub"], str) or not claims["sub"].strip()
            or isinstance(expires, bool) or not isinstance(expires, (int, float))
            or not math.isfinite(expires)
            or not isinstance(groups, list) or any(not isinstance(group, str) for group in groups)
            or app.config["AUTHENTIK_REQUIRED_GROUP"] not in groups
        ):
            return None
        return {"sub": claims["sub"]}
    except (jwt.InvalidTokenError, ValueError, TypeError, OverflowError):
        return None


def configure_forward_auth(app: Flask) -> None:
    mode = app.config["AUTH_MODE"]
    if mode not in {"forward", "development"}:
        raise ValueError("AUTH_MODE must be forward or development")
    # The supported proxy-provider contract signs with its dedicated client secret.
    # Cache it once; verification makes no IdP/network calls during an outage.
    client_secret = _load_client_secret(app) if mode == "forward" else None

    @app.before_request
    def authenticate_request():
        g.forward_identity = None
        if mode == "development" or is_public_request(app):
            return None
        g.forward_identity = _identity(app, client_secret)
        if g.forward_identity is None:
            return jsonify(error="Sign in to continue.", code="AUTH_REQUIRED", loginUrl="/"), 401
        if request.method not in _SAFE_METHODS and (
            request.headers.get("Origin") != app.config["APP_ORIGIN"]
            or request.headers.get("X-Saita-CSRF") != "1"
            or request.headers.get("Sec-Fetch-Site") in {"cross-site", "same-site"}
        ):
            return jsonify(error="Request origin could not be verified.", code="INVALID_ORIGIN"), 403
        return None

    @app.after_request
    def prevent_private_caching(response):
        # Public assets contain no identity/data; all other responses may be private.
        if not (_ASSET_PATH.fullmatch(request.path) and is_public_request(app)):
            response.headers["Cache-Control"] = "no-store, private"
            response.headers["Pragma"] = "no-cache"
        if request.path in {"/sw.js", "/static/sw.js"}:
            response.headers["Cache-Control"] = "no-cache"
            response.headers["Service-Worker-Allowed"] = "/"
        return response

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify(logoutUrl="/outpost.goauthentik.io/sign_out" if mode == "forward" else "/")
