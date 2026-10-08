"""Application-side Authentik trust boundary, independent of ingress headers."""

import time
import secrets
import base64
import json
from dataclasses import replace

import jwt
import pytest

from app import create_app, db


ORIGIN = "https://saita.home.theforceiswith.me"
ISSUER = "https://auth.theforceiswith.me/application/o/saita/"


@pytest.fixture(scope="module")
def signing_key():
    return secrets.token_urlsafe(64)


@pytest.fixture
def forward_config(test_config, tmp_path, signing_key):
    key_file = tmp_path / "provider-client-secret.txt"
    key_file.write_text(signing_key)
    return replace(
        test_config, SECRET_KEY="forward-test-cookie-secret-with-32-bytes", AUTH_MODE="forward", SESSION_COOKIE_SECURE=True,
        APP_ORIGIN=ORIGIN, AUTHENTIK_PROXY_ISSUER=ISSUER,
        AUTHENTIK_PROXY_CLIENT_ID="saita-provider-client", AUTHENTIK_REQUIRED_GROUP="app-saita",
        AUTHENTIK_PROXY_CLIENT_SECRET_FILE=str(key_file),
    )


@pytest.fixture
def forward_app(forward_config):
    application = create_app(forward_config)
    application.config["TESTING"] = True
    with application.app_context():
        db.create_all()
        yield application
        db.drop_all()


@pytest.fixture
def forward_client(forward_app):
    return forward_app.test_client()


@pytest.fixture
def token(signing_key):
    def make_token(**changes):
        claims = {
            "iss": ISSUER, "aud": "saita-provider-client", "sub": "user-123",
            "exp": int(time.time()) + 3600, "iat": int(time.time()), "groups": ["app-saita"],
        }
        claims.update(changes)
        return jwt.encode(claims, signing_key, algorithm="HS256")
    return make_token


@pytest.fixture
def authenticated_headers(token):
    return {"X-authentik-jwt": token(), "Origin": ORIGIN, "X-Saita-CSRF": "1"}


@pytest.mark.parametrize("path", [
    "/", "/api", "/api/app-info", "/api/items", "/api/items/1", "/api/items/1/download",
    "/api/items/order", "/api/spaces", "/api/storage", "/api/health/",
    "/static/index.html", "/index.html", "/d", "/d/0", "/d/01", "/d/1/",
    "/d/1/download", "/d/1/../api/items", "/static/assets/missing.js",
])
def test_protected_paths_fail_closed_with_spoofed_headers(forward_client, path):
    response = forward_client.get(path, headers={
        "X-authentik-username": "michael", "X-authentik-groups": "app-saita|family",
        "X-authentik-email": "michael@example.test", "X-authentik-uid": "user-123",
        "X-authentik-meta-jwks": "https://attacker.test/keys", "Authorization": "Bearer fake",
    })
    assert response.status_code == 401
    if path == "/api" or path.startswith("/api/"):
        assert response.get_json()["code"] == "AUTH_REQUIRED"
    else:
        assert b"Sign in to sa" in response.data and b"Sign out" in response.data
    assert "Location" not in response.headers


@pytest.mark.parametrize("claims", [
    {"iss": "https://attacker.test/"}, {"iss": ISSUER.rstrip("/")},
    {"aud": "another-provider"}, {"aud": ["saita-provider-client", "another-provider"]},
    {"groups": ["family"]}, {"groups": "app-saita"}, {"groups": ["app-saita", 7]},
    {"groups": None}, {"sub": ""}, {"sub": 123}, {"exp": 0}, {"exp": True},
    {"exp": "9999999999"}, {"exp": float("inf")}, {"exp": float("nan")},
    {"nbf": 9999999999}, {"iat": True}, {"iat": "9999999999"}, {"iat": None},
])
def test_wrong_provider_claims_are_rejected(forward_client, token, claims):
    response = forward_client.get("/api/items", headers={"X-authentik-jwt": token(**claims)})
    assert response.status_code == 401


@pytest.mark.parametrize("claim", ["exp", "iss", "aud", "sub"])
def test_required_claims_must_exist(forward_client, token, signing_key, claim):
    claims = jwt.decode(token(), options={"verify_signature": False})
    del claims[claim]
    raw = jwt.encode(claims, signing_key, algorithm="HS256")
    assert forward_client.get("/api/items", headers={"X-authentik-jwt": raw}).status_code == 401


def test_expiry_is_enforced_without_outage_grace(forward_client, token):
    assert forward_client.get("/api/items", headers={
        "X-authentik-jwt": token(exp=int(time.time()) - 1),
    }).status_code == 401


def test_issued_at_clock_skew_does_not_extend_expiry_or_bypass_not_before(forward_client, token):
    future = int(time.time()) + 60
    assert forward_client.get("/api/items", headers={"X-authentik-jwt": token(iat=future)}).status_code == 200
    assert forward_client.get("/api/items", headers={
        "X-authentik-jwt": token(iat=future, exp=int(time.time()) - 1),
    }).status_code == 401
    assert forward_client.get("/api/items", headers={
        "X-authentik-jwt": token(iat=future, nbf=future),
    }).status_code == 401


def test_unsigned_wrong_secret_rsa_and_malformed_tokens_rejected(forward_client, token, signing_key):
    claims = jwt.decode(token(), options={"verify_signature": False})
    rsa_header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    for raw in [
        jwt.encode(claims, key="", algorithm="none"),
        jwt.encode(claims, "untrusted-secret" * 3, algorithm="HS256"),
        jwt.encode(claims, signing_key, algorithm="HS384"),
        rsa_header + "." + ".".join(token().split(".")[1:]),
        "invalid.jwt.token", "x" * 32769,
    ]:
        assert forward_client.get("/api/items", headers={"X-authentik-jwt": raw}).status_code == 401


def test_valid_identity_uses_cached_secret_even_after_secret_file_disappears(
    forward_client, forward_config, authenticated_headers,
):
    from pathlib import Path
    Path(forward_config.AUTHENTIK_PROXY_CLIENT_SECRET_FILE).unlink()
    response = forward_client.get("/api/items", headers=authenticated_headers)
    assert response.status_code == 200
    assert response.get_json()["items"] == []
    assert response.headers["Cache-Control"] == "no-store, private"


@pytest.mark.parametrize("headers", [
    {}, {"Origin": "https://attacker.test", "X-Saita-CSRF": "1"},
    {"Origin": "https://saita.home.theforceiswith.me.attacker.test", "X-Saita-CSRF": "1"},
    {"Origin": "null", "X-Saita-CSRF": "1"}, {"Origin": ORIGIN},
    {"Origin": ORIGIN, "X-Saita-CSRF": "0"},
    {"Origin": ORIGIN, "X-Saita-CSRF": "1", "Sec-Fetch-Site": "cross-site"},
    {"Origin": ORIGIN, "X-Saita-CSRF": "1", "Sec-Fetch-Site": "same-site"},
    {"Referer": ORIGIN + "/", "X-Saita-CSRF": "1"},
])
def test_authenticated_mutations_require_origin_and_custom_header(forward_client, token, headers):
    response = forward_client.post("/api/items/note", json={"text": "note"}, headers={
        "X-authentik-jwt": token(), **headers,
    })
    assert response.status_code == 403
    assert response.get_json()["code"] == "INVALID_ORIGIN"
    assert forward_client.get("/api/items", headers={"X-authentik-jwt": token()}).get_json()["items"] == []


def test_authenticated_creation_keeps_shared_dataset(forward_client, authenticated_headers, token):
    created = forward_client.post("/api/items/note", json={"text": "shared"}, headers=authenticated_headers)
    assert created.status_code == 201
    other = forward_client.get("/api/items", headers={"X-authentik-jwt": token(sub="other-user")})
    assert other.get_json()["items"][0]["id"] == created.get_json()["id"]


@pytest.mark.parametrize("path", ["/api/items/files", "/api/items/folder", "/api/items/note",
                                      "/api/spaces"])
def test_post_endpoints_never_bypass_auth(forward_client, path):
    assert forward_client.post(path, json={}).status_code == 401


@pytest.mark.parametrize("method,path", [("PATCH", "/api/items/1"), ("DELETE", "/api/items/1"),
                                              ("PUT", "/api/items/reorder"), ("PUT", "/api/spaces/reorder")])
def test_all_mutating_methods_have_origin_protection(forward_client, token, method, path):
    response = forward_client.open(path, method=method, headers={"X-authentik-jwt": token()})
    assert response.status_code == 403


def test_public_health_is_minimal_and_app_info_is_protected(forward_client, authenticated_headers):
    health = forward_client.get("/api/health")
    assert health.get_json() == {"ok": True}
    assert forward_client.head("/api/health").status_code == 200
    assert forward_client.post("/api/health").status_code == 401
    assert forward_client.get("/api/app-info").status_code == 401
    info = forward_client.get("/api/app-info", headers=authenticated_headers).get_json()
    assert info["authMode"] == "forward"
    assert info["limits"]["noteTextMaxChars"] == 100000
    required = forward_client.get("/api/auth-required")
    assert required.status_code == 401
    assert required.get_json() == {"error": "Sign in to continue.", "code": "AUTH_REQUIRED", "loginUrl": "/"}
    assert "no-store" in required.headers["Cache-Control"]
    assert forward_client.head("/api/auth-required").status_code == 401
    assert forward_client.post("/api/auth-required").status_code == 401


def test_anonymous_share_notes_and_password_unlock_are_preserved(forward_app, forward_client, authenticated_headers):
    item = forward_client.post("/api/items/note", json={
        "text": "private note", "title": "Protected note", "password": "share-password",
    }, headers=authenticated_headers).get_json()
    forward_client = forward_app.test_client()  # A recipient has none of the creator's unlock cookies.
    path = f"/d/{item['id']}"
    prompt = forward_client.get(path)
    assert prompt.status_code == 200
    assert b"private note" not in prompt.data
    assert forward_client.post(path, data={"password": "incorrect"}).status_code == 401
    assert forward_client.post(path, data={"password": "share-password"}).status_code == 302
    assert b"private note" in forward_client.get(path).data
    assert forward_client.head(path).status_code == 200
    assert forward_client.get(f"/api/items/{item['id']}/download").status_code == 401
    for method in ["PUT", "PATCH", "DELETE", "OPTIONS"]:
        assert forward_client.open(path, method=method).status_code == 401


def test_public_assets_are_exact_existing_files_with_read_only_bypass(forward_app, forward_client, tmp_path):
    (tmp_path / "assets").mkdir()
    for name in ["sw.js", "workbox-abc123.js", "manifest.webmanifest", "logo.png",
                 "public-pages.css", "assets/index-abc123.js", "index.html", "assets/index.js.map"]:
        (tmp_path / name).write_text("public asset")
    forward_app.static_folder = str(tmp_path)
    for path in ["/sw.js", "/static/sw.js", "/workbox-abc123.js", "/manifest.webmanifest",
                 "/logo.png", "/static/public-pages.css", "/static/assets/index-abc123.js"]:
        assert forward_client.get(path).status_code == 200
        assert forward_client.head(path).status_code == 200
        assert forward_client.post(path).status_code == 401
    for path in ["/static/index.html", "/index.html", "/static/assets/index.js.map",
                 "/static/assets/not-existing.js", "/static/../index.html", "/sw.js/extra"]:
        assert forward_client.get(path).status_code == 401
    assert forward_client.get("/sw.js").headers["Service-Worker-Allowed"] == "/"
    assert forward_client.get("/sw.js").headers["Cache-Control"] == "no-cache"


def test_logout_clears_share_unlocks_and_never_accepts_external_redirect(
    forward_client, authenticated_headers,
):
    item = forward_client.post("/api/items/note", json={
        "text": "secret", "title": "Protected note", "password": "share-password",
    }, headers=authenticated_headers).get_json()
    path = f"/d/{item['id']}"
    forward_client.post(path, data={"password": "share-password"})
    assert b"secret" in forward_client.get(path).data
    assert forward_client.get("/api/auth/logout").status_code == 401
    assert forward_client.post("/api/auth/logout").status_code == 403
    response = forward_client.post("/api/auth/logout?next=https://attacker.test", headers=authenticated_headers)
    assert response.get_json() == {"logoutUrl": "/outpost.goauthentik.io/sign_out"}
    assert "no-store" in response.headers["Cache-Control"]
    assert b"secret" not in forward_client.get(path).data


def test_logout_remains_available_after_identity_expiry_with_valid_csrf(forward_client, authenticated_headers, token):
    item = forward_client.post("/api/items/note", json={
        "text": "secret", "title": "Protected note", "password": "share-password",
    }, headers=authenticated_headers).get_json()
    path = f"/d/{item['id']}"
    forward_client.post(path, data={"password": "share-password"})
    response = forward_client.post("/api/auth/logout", headers={
        "Origin": ORIGIN, "X-Saita-CSRF": "1",
        "X-authentik-jwt": token(exp=int(time.time()) - 1),
    })
    assert response.status_code == 200
    assert b"secret" not in forward_client.get(path).data
    assert forward_client.post("/api/auth/logout", headers={"Origin": ORIGIN, "X-Saita-CSRF": "1"}).status_code == 200
    for headers in [{"Origin": ORIGIN}, {"X-Saita-CSRF": "1"}, {"Origin": "https://attacker.test", "X-Saita-CSRF": "1"}]:
        assert forward_client.post("/api/auth/logout", headers=headers).status_code == 403


def test_api_unlock_grants_follow_subject_and_do_not_grant_anonymous_share_access(forward_client, token):
    headers_a = {"X-authentik-jwt": token(sub="user-a"), "Origin": ORIGIN, "X-Saita-CSRF": "1"}
    headers_b = {"X-authentik-jwt": token(sub="user-b"), "Origin": ORIGIN, "X-Saita-CSRF": "1"}
    item = forward_client.post("/api/items/note", json={
        "text": "subject-bound secret", "title": "Protected title", "password": "share-password",
    }, headers=headers_a).get_json()
    detail = f"/api/items/{item['id']}"
    share = f"/d/{item['id']}"
    assert forward_client.get(detail, headers=headers_a).get_json()["isPasswordUnlocked"] is True
    prompt = forward_client.get(share)
    assert b"subject-bound secret" not in prompt.data
    assert b"Protected title" not in prompt.data
    assert forward_client.get(detail, headers=headers_b).get_json()["isPasswordUnlocked"] is False
    assert forward_client.get(detail, headers=headers_a).get_json()["isPasswordUnlocked"] is False
    assert forward_client.post(detail + "/unlock", json={"password": "share-password"}, headers=headers_a).status_code == 204
    assert forward_client.get(detail, headers=headers_a).get_json()["isPasswordUnlocked"] is True
    assert b"subject-bound secret" not in forward_client.get(share).data


def test_anonymous_password_grants_stay_browser_scoped_across_subject_changes(forward_client, authenticated_headers, token):
    item = forward_client.post("/api/items/note", json={
        "text": "browser-granted secret", "password": "share-password",
    }, headers=authenticated_headers).get_json()
    share = f"/d/{item['id']}"
    assert forward_client.post(share, data={"password": "share-password"}).status_code == 302
    for subject in ["user-a", "user-b"]:
        detail = forward_client.get(f"/api/items/{item['id']}", headers={"X-authentik-jwt": token(sub=subject)})
        assert detail.get_json()["isPasswordUnlocked"] is True
        assert b"browser-granted secret" in forward_client.get(share).data


def test_protected_link_target_is_available_after_api_unlock_without_public_grant(forward_client, token):
    creator = {"X-authentik-jwt": token(sub="creator"), "Origin": ORIGIN, "X-Saita-CSRF": "1"}
    recipient = {"X-authentik-jwt": token(sub="recipient"), "Origin": ORIGIN, "X-Saita-CSRF": "1"}
    target = "https://example.test/protected-target"
    item = forward_client.post("/api/items/link", json={
        "url": target, "name": "Protected link", "password": "link-password",
    }, headers=creator).get_json()
    detail = f"/api/items/{item['id']}"
    assert forward_client.get(detail, headers=recipient).get_json()["linkUrl"] is None
    assert forward_client.post(detail + "/unlock", json={"password": "link-password"}, headers=recipient).status_code == 204
    unlocked = forward_client.get(detail, headers=recipient).get_json()
    assert unlocked["linkUrl"] == target and unlocked["isPasswordUnlocked"] is True
    public_share = forward_client.get(f"/d/{item['id']}")
    assert public_share.status_code == 200 and "Location" not in public_share.headers
    assert target.encode() not in public_share.data


def test_security_headers_and_misrouted_outpost_are_explicit(forward_client, authenticated_headers):
    response = forward_client.get("/api/health")
    assert response.headers["Content-Security-Policy"] == "frame-ancestors 'none'"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    for path in ["/outpost.goauthentik.io", "/outpost.goauthentik.io/sign_out", "/outpost.goauthentik.io/callback"]:
        assert forward_client.get(path).status_code == 404
        assert forward_client.get(path, headers=authenticated_headers).status_code == 404


def test_deeply_nested_jwt_is_rejected_without_internal_error(forward_client):
    header = base64.urlsafe_b64encode(('[' * 2000 + '0' + ']' * 2000).encode()).decode().rstrip("=")
    assert forward_client.get("/api/items", headers={"X-authentik-jwt": header + ".e30.signature"}).status_code == 401


def test_auth_rejection_logs_only_safe_diagnostic_class(forward_client, token, caplog):
    import logging
    with caplog.at_level(logging.INFO):
        forward_client.get("/api/items", headers={"X-authentik-jwt": token(iss="https://untrusted.test")})
    assert "InvalidIssuerError" in caplog.text
    assert "https://untrusted.test" not in caplog.text
    assert "eyJ" not in caplog.text


def test_development_startup_warns_that_workspace_authentication_is_disabled(test_config, capsys):
    create_app(test_config)
    # The app replaces logging handlers during startup; verify the emitted log.
    startup_logs = capsys.readouterr().err
    assert "AUTH_MODE=development" in startup_logs
    assert "authentication is disabled" in startup_logs


@pytest.mark.parametrize("field,value", [
    ("AUTH_MODE", "disabled"), ("APP_ORIGIN", ""), ("APP_ORIGIN", "http://saita.test"),
    ("APP_ORIGIN", ORIGIN + "/"), ("APP_ORIGIN", "https://user:password@saita.test"),
    ("APP_ORIGIN", "https://SAITA.home.theforceiswith.me"), ("APP_ORIGIN", ORIGIN + ":443"),
    ("APP_ORIGIN", "https://bad host.test"), ("APP_ORIGIN", "https://-bad.test"),
    ("APP_ORIGIN", "https://bad.test."), ("APP_ORIGIN", "https://bad\\host.test"),
    ("APP_ORIGIN", "https://saita.test:bad"), ("AUTHENTIK_PROXY_ISSUER", "http://auth.test"),
    ("AUTHENTIK_PROXY_CLIENT_ID", ""), ("AUTHENTIK_REQUIRED_GROUP", ""),
    ("AUTHENTIK_PROXY_CLIENT_SECRET_FILE", ""), ("AUTHENTIK_PROXY_CLIENT_SECRET_FILE", "/nonexistent"),
    ("SESSION_COOKIE_SECURE", False),
    ("SECRET_KEY", "short"),
])
def test_invalid_secure_configuration_fails_at_startup(forward_config, field, value):
    with pytest.raises(ValueError):
        create_app(replace(forward_config, **{field: value}))


def test_empty_short_or_pem_secrets_are_rejected(forward_config, tmp_path):
    for key_bytes in [b"", b"short-secret", b"-----BEGIN PUBLIC KEY-----\nnot a client secret",
                      b"invalid secret with internal whitespace" * 2, b"x" * 4097]:
        path = tmp_path / "invalid-secret.txt"
        path.write_bytes(key_bytes)
        with pytest.raises(ValueError, match="proxy secret"):
            create_app(replace(forward_config, AUTHENTIK_PROXY_CLIENT_SECRET_FILE=str(path)))
