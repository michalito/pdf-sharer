"""Application configuration with validation and environment support."""

import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional


def _get_base_dir() -> Path:
    """Get the base directory of the application."""
    return Path(__file__).parent.parent.resolve()


@dataclass(frozen=True)
class Config:
    """Application configuration."""

    SECRET_KEY: str
    DATABASE_URI: str
    UPLOAD_FOLDER: Path
    MAX_CONTENT_LENGTH: int
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    @classmethod
    def from_env(cls) -> "Config":
        """Create configuration from environment variables."""
        base_dir = _get_base_dir()

        secret_key = os.environ.get("SECRET_KEY")
        if not secret_key:
            raise ValueError(
                "SECRET_KEY environment variable is required. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )

        database_uri = os.environ.get("DATABASE_URL") or \
            f"sqlite:///{base_dir / 'instance' / 'pdfs.db'}"

        upload_folder = Path(
            os.environ.get("UPLOAD_FOLDER") or base_dir / "uploads"
        )

        max_content_length = int(
            os.environ.get("MAX_CONTENT_LENGTH", 16 * 1024 * 1024)
        )

        return cls(
            SECRET_KEY=secret_key,
            DATABASE_URI=database_uri,
            UPLOAD_FOLDER=upload_folder,
            MAX_CONTENT_LENGTH=max_content_length,
        )

    @classmethod
    def for_development(cls) -> "Config":
        """Create configuration for development."""
        base_dir = _get_base_dir()

        return cls(
            SECRET_KEY=os.environ.get("SECRET_KEY", "dev-only-not-for-production"),
            DATABASE_URI=f"sqlite:///{base_dir / 'instance' / 'pdfs.db'}",
            UPLOAD_FOLDER=base_dir / "uploads",
            MAX_CONTENT_LENGTH=16 * 1024 * 1024,
        )

    def to_flask_config(self) -> dict:
        """Convert to Flask configuration dictionary."""
        return {
            "SECRET_KEY": self.SECRET_KEY,
            "SQLALCHEMY_DATABASE_URI": self.DATABASE_URI,
            "SQLALCHEMY_TRACK_MODIFICATIONS": self.SQLALCHEMY_TRACK_MODIFICATIONS,
            "UPLOAD_FOLDER": str(self.UPLOAD_FOLDER),
            "MAX_CONTENT_LENGTH": self.MAX_CONTENT_LENGTH,
        }


def get_config() -> Config:
    """Get the appropriate configuration based on environment."""
    env = os.environ.get("FLASK_ENV", "development")

    if env == "production":
        return Config.from_env()
    return Config.for_development()
