"""Application configuration with validation and environment support."""

import os
from pathlib import Path
from dataclasses import dataclass
from urllib.parse import urlparse

from app.constants import (
    DEFAULT_MAX_CONTENT_LENGTH,
    DEFAULT_MAX_NOTE_TEXT_LENGTH,
    DEFAULT_NOTE_EXCERPT_LENGTH,
    MAX_NOTE_EXCERPT_LENGTH,
    MIN_NOTE_EXCERPT_LENGTH,
)


def _get_base_dir() -> Path:
    """Get the base directory of the application."""
    return Path(__file__).parent.parent.resolve()


def _parse_note_excerpt_length(raw: str | None) -> int:
    """Parse note excerpt length from env and enforce safe bounds."""
    if raw is None:
        return DEFAULT_NOTE_EXCERPT_LENGTH

    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_NOTE_EXCERPT_LENGTH

    return max(MIN_NOTE_EXCERPT_LENGTH, min(MAX_NOTE_EXCERPT_LENGTH, value))


def _parse_max_note_text_length(raw: str | None) -> int:
    """Parse note length limit from env and require a positive integer."""
    if raw is None or raw.strip() == "":
        return DEFAULT_MAX_NOTE_TEXT_LENGTH

    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_NOTE_TEXT_LENGTH

    if value <= 0:
        return DEFAULT_MAX_NOTE_TEXT_LENGTH
    return value


def _validate_database_uri(database_uri: str) -> str:
    """Validate supported database backends."""
    if urlparse(database_uri).scheme != "sqlite":
        raise ValueError(
            "Only SQLite is supported right now. "
            "Set DATABASE_URL to a sqlite URI (for example: sqlite:///instance/saita.db)."
        )
    return database_uri


def _parse_trust_proxy_hops(raw: str | None) -> int:
    """Parse trusted reverse-proxy hop count for forwarded headers."""
    if raw is None or raw.strip() == "":
        return 0

    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError("TRUST_PROXY_HOPS must be a non-negative integer") from exc

    if value < 0:
        raise ValueError("TRUST_PROXY_HOPS must be a non-negative integer")
    return value


def _parse_bool_env(raw: str | None, *, default: bool) -> bool:
    if raw is None or raw.strip() == "":
        return default
    value = raw.strip().lower()
    if value in ("true", "1", "yes"):
        return True
    if value in ("false", "0", "no"):
        return False
    raise ValueError("Boolean environment values must be one of: true, false, 1, 0, yes, no")


@dataclass(frozen=True)
class Config:
    """Application configuration."""

    SECRET_KEY: str
    DATABASE_URI: str
    UPLOAD_FOLDER: Path
    MAX_CONTENT_LENGTH: int
    APP_VERSION: str = "dev"
    TRUST_PROXY_HOPS: int = 0
    MAX_NOTE_TEXT_LENGTH: int = DEFAULT_MAX_NOTE_TEXT_LENGTH
    NOTE_EXCERPT_LENGTH: int = DEFAULT_NOTE_EXCERPT_LENGTH
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    # Session security settings
    SESSION_COOKIE_SECURE: bool = False
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "Lax"
    PERMANENT_SESSION_LIFETIME: int = 3600  # 1 hour

    @classmethod
    def from_env(cls) -> "Config":
        """Create configuration from environment variables."""
        base_dir = _get_base_dir()

        # Production must use a stable key because session cookies now carry
        # unlock state for password-protected items.
        secret_key = (os.environ.get("SECRET_KEY") or "").strip()
        if not secret_key:
            raise ValueError("SECRET_KEY environment variable is required in production")

        database_uri = os.environ.get("DATABASE_URL") or \
            f"sqlite:///{base_dir / 'instance' / 'saita.db'}"
        database_uri = _validate_database_uri(database_uri)

        upload_folder = Path(
            os.environ.get("UPLOAD_FOLDER") or base_dir / "uploads"
        )

        max_content_length = int(os.environ.get("MAX_CONTENT_LENGTH", DEFAULT_MAX_CONTENT_LENGTH))
        max_note_text_length = _parse_max_note_text_length(os.environ.get("MAX_NOTE_TEXT_LENGTH"))
        note_excerpt_length = _parse_note_excerpt_length(os.environ.get("NOTE_EXCERPT_LENGTH"))
        trust_proxy_hops = _parse_trust_proxy_hops(os.environ.get("TRUST_PROXY_HOPS"))
        session_cookie_secure = _parse_bool_env(
            os.environ.get("SESSION_COOKIE_SECURE"),
            default=False,
        )

        return cls(
            SECRET_KEY=secret_key,
            DATABASE_URI=database_uri,
            UPLOAD_FOLDER=upload_folder,
            MAX_CONTENT_LENGTH=max_content_length,
            MAX_NOTE_TEXT_LENGTH=max_note_text_length,
            NOTE_EXCERPT_LENGTH=note_excerpt_length,
            APP_VERSION=os.environ.get("APP_VERSION", "dev"),
            TRUST_PROXY_HOPS=trust_proxy_hops,
            SESSION_COOKIE_SECURE=session_cookie_secure,
        )

    @classmethod
    def for_development(cls) -> "Config":
        """Create configuration for development."""
        base_dir = _get_base_dir()

        max_content_length = int(os.environ.get("MAX_CONTENT_LENGTH", DEFAULT_MAX_CONTENT_LENGTH))
        max_note_text_length = _parse_max_note_text_length(os.environ.get("MAX_NOTE_TEXT_LENGTH"))
        note_excerpt_length = _parse_note_excerpt_length(os.environ.get("NOTE_EXCERPT_LENGTH"))
        trust_proxy_hops = _parse_trust_proxy_hops(os.environ.get("TRUST_PROXY_HOPS"))

        return cls(
            SECRET_KEY=os.environ.get("SECRET_KEY", "dev-only-not-for-production"),
            DATABASE_URI=f"sqlite:///{base_dir / 'instance' / 'saita.db'}",
            UPLOAD_FOLDER=base_dir / "uploads",
            MAX_CONTENT_LENGTH=max_content_length,
            MAX_NOTE_TEXT_LENGTH=max_note_text_length,
            NOTE_EXCERPT_LENGTH=note_excerpt_length,
            APP_VERSION=os.environ.get("APP_VERSION", "dev"),
            TRUST_PROXY_HOPS=trust_proxy_hops,
            # Disable secure cookies for development (HTTP)
            SESSION_COOKIE_SECURE=_parse_bool_env(
                os.environ.get("SESSION_COOKIE_SECURE"),
                default=False,
            ),
        )

    def to_flask_config(self) -> dict:
        """Convert to Flask configuration dictionary."""
        return {
            "SECRET_KEY": self.SECRET_KEY,
            "SQLALCHEMY_DATABASE_URI": self.DATABASE_URI,
            "SQLALCHEMY_TRACK_MODIFICATIONS": self.SQLALCHEMY_TRACK_MODIFICATIONS,
            "UPLOAD_FOLDER": str(self.UPLOAD_FOLDER),
            "MAX_CONTENT_LENGTH": self.MAX_CONTENT_LENGTH,
            "MAX_NOTE_TEXT_LENGTH": self.MAX_NOTE_TEXT_LENGTH,
            "NOTE_EXCERPT_LENGTH": self.NOTE_EXCERPT_LENGTH,
            "TRUST_PROXY_HOPS": self.TRUST_PROXY_HOPS,
            "SESSION_COOKIE_SECURE": self.SESSION_COOKIE_SECURE,
            "SESSION_COOKIE_HTTPONLY": self.SESSION_COOKIE_HTTPONLY,
            "SESSION_COOKIE_SAMESITE": self.SESSION_COOKIE_SAMESITE,
            "PERMANENT_SESSION_LIFETIME": self.PERMANENT_SESSION_LIFETIME,
            "APP_VERSION": self.APP_VERSION,
        }


def get_config() -> Config:
    """Get the appropriate configuration based on environment."""
    env = os.environ.get("FLASK_ENV", "development")

    if env == "production":
        return Config.from_env()
    return Config.for_development()
