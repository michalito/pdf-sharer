"""Unit tests for configuration."""

import os
from pathlib import Path

import pytest

from app.config import Config, get_config


class TestConfig:
    """Tests for Config class."""

    def test_create_config(self, temp_upload_dir):
        """Test creating a config instance."""
        config = Config(
            SECRET_KEY="test-secret",
            DATABASE_URI="sqlite:///test.db",
            UPLOAD_FOLDER=temp_upload_dir,
            MAX_CONTENT_LENGTH=1024,
        )

        assert config.SECRET_KEY == "test-secret"
        assert config.DATABASE_URI == "sqlite:///test.db"
        assert config.UPLOAD_FOLDER == temp_upload_dir
        assert config.MAX_CONTENT_LENGTH == 1024
        assert config.SQLALCHEMY_TRACK_MODIFICATIONS is False

    def test_to_flask_config(self, temp_upload_dir):
        """Test conversion to Flask config dict."""
        config = Config(
            SECRET_KEY="test-secret",
            DATABASE_URI="sqlite:///test.db",
            UPLOAD_FOLDER=temp_upload_dir,
            MAX_CONTENT_LENGTH=1024,
        )

        flask_config = config.to_flask_config()

        assert flask_config["SECRET_KEY"] == "test-secret"
        assert flask_config["SQLALCHEMY_DATABASE_URI"] == "sqlite:///test.db"
        assert flask_config["UPLOAD_FOLDER"] == str(temp_upload_dir)
        assert flask_config["MAX_CONTENT_LENGTH"] == 1024
        assert flask_config["SQLALCHEMY_TRACK_MODIFICATIONS"] is False


class TestConfigFactoryMethods:
    """Tests for Config factory methods."""

    def test_for_development(self):
        """Test development config creation."""
        config = Config.for_development()

        assert config.SECRET_KEY == "dev-only-not-for-production"
        assert "sqlite" in config.DATABASE_URI
        assert config.UPLOAD_FOLDER is not None
        # Dev default is 64MB
        assert config.MAX_CONTENT_LENGTH == 64 * 1024 * 1024

    def test_from_env_requires_secret_key(self, monkeypatch):
        """Test that from_env requires SECRET_KEY."""
        monkeypatch.delenv("SECRET_KEY", raising=False)

        with pytest.raises(ValueError) as exc_info:
            Config.from_env()

        assert "SECRET_KEY" in str(exc_info.value)

    def test_from_env_with_secret_key(self, monkeypatch):
        """Test from_env with SECRET_KEY set."""
        monkeypatch.setenv("SECRET_KEY", "production-secret-key")

        config = Config.from_env()

        assert config.SECRET_KEY == "production-secret-key"
        assert config.MAX_CONTENT_LENGTH == 16 * 1024 * 1024  # Prod default

    def test_from_env_with_custom_values(self, monkeypatch):
        """Test from_env with custom environment values."""
        monkeypatch.setenv("SECRET_KEY", "my-secret")
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")
        monkeypatch.setenv("MAX_CONTENT_LENGTH", "32000000")

        config = Config.from_env()

        assert config.SECRET_KEY == "my-secret"
        assert config.DATABASE_URI == "postgresql://localhost/db"
        assert config.MAX_CONTENT_LENGTH == 32000000


class TestGetConfig:
    """Tests for get_config function."""

    def test_development_mode(self, monkeypatch):
        """Test that development mode is default."""
        monkeypatch.delenv("FLASK_ENV", raising=False)

        config = get_config()

        # Dev config doesn't require SECRET_KEY
        assert config.SECRET_KEY == "dev-only-not-for-production"

    def test_production_mode_requires_secret(self, monkeypatch):
        """Test that production mode requires SECRET_KEY."""
        monkeypatch.setenv("FLASK_ENV", "production")
        monkeypatch.delenv("SECRET_KEY", raising=False)

        with pytest.raises(ValueError):
            get_config()

    def test_production_mode_with_secret(self, monkeypatch):
        """Test production mode with SECRET_KEY."""
        monkeypatch.setenv("FLASK_ENV", "production")
        monkeypatch.setenv("SECRET_KEY", "prod-secret")

        config = get_config()

        assert config.SECRET_KEY == "prod-secret"
