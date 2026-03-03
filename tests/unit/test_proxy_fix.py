"""Tests for proxy-aware client IP handling."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from flask import Flask, request

from app import create_app, db
from app.config import Config


def _make_test_app(tmp_path: Path, *, trust_proxy_hops: int) -> Flask:
    config = Config(
        SECRET_KEY="test-secret",
        DATABASE_URI="sqlite:///:memory:",
        UPLOAD_FOLDER=tmp_path / "uploads",
        MAX_CONTENT_LENGTH=2 * 1024 * 1024 * 1024,
        TRUST_PROXY_HOPS=trust_proxy_hops,
        SESSION_COOKIE_SECURE=False,
    )
    app = create_app(config)
    app.config["TESTING"] = True

    @app.get("/__test/client-ip")
    def client_ip():
        return {"clientIp": request.remote_addr}

    return app


@contextmanager
def _app_with_db(tmp_path: Path, *, trust_proxy_hops: int) -> Generator[Flask, None, None]:
    app = _make_test_app(tmp_path, trust_proxy_hops=trust_proxy_hops)
    with app.app_context():
        db.create_all()
    try:
        yield app
    finally:
        with app.app_context():
            db.drop_all()


def test_remote_addr_uses_socket_ip_when_proxy_trust_disabled(tmp_path: Path):
    with _app_with_db(tmp_path, trust_proxy_hops=0) as app:
        client = app.test_client()
        res = client.get(
            "/__test/client-ip",
            headers={"X-Forwarded-For": "203.0.113.10"},
            environ_overrides={"REMOTE_ADDR": "10.0.0.2"},
        )
        assert res.status_code == 200
        assert res.get_json()["clientIp"] == "10.0.0.2"


def test_remote_addr_uses_forwarded_for_when_proxy_trust_enabled(tmp_path: Path):
    with _app_with_db(tmp_path, trust_proxy_hops=1) as app:
        client = app.test_client()
        res = client.get(
            "/__test/client-ip",
            headers={"X-Forwarded-For": "203.0.113.10"},
            environ_overrides={"REMOTE_ADDR": "10.0.0.2"},
        )
        assert res.status_code == 200
        assert res.get_json()["clientIp"] == "203.0.113.10"
