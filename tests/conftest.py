"""Pytest configuration and fixtures for saíta tests."""

import tempfile
from pathlib import Path
from typing import Generator

import pytest
from flask import Flask
from flask.testing import FlaskClient

from app import create_app, db
from app.config import Config


@pytest.fixture(scope="function")
def temp_upload_dir() -> Generator[Path, None, None]:
    """Create a temporary upload directory for tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture(scope="function")
def test_config(temp_upload_dir: Path) -> Config:
    """Create a test configuration with in-memory SQLite."""
    return Config(
        SECRET_KEY="test-secret-key",
        DATABASE_URI="sqlite:///:memory:",
        UPLOAD_FOLDER=temp_upload_dir,
        MAX_CONTENT_LENGTH=2 * 1024 * 1024 * 1024,
        SESSION_COOKIE_SECURE=False,
    )


@pytest.fixture(scope="function")
def app(test_config: Config) -> Generator[Flask, None, None]:
    """Create and configure a test Flask application."""
    flask_app = create_app(test_config)
    flask_app.config["TESTING"] = True

    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.drop_all()


@pytest.fixture(scope="function")
def client(app: Flask) -> FlaskClient:
    """Create a test client."""
    return app.test_client()
