"""Application-wide constants."""

from datetime import timedelta

DEFAULT_MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024  # 2GB
DEFAULT_NOTE_EXCERPT_LENGTH = 180
MIN_NOTE_EXCERPT_LENGTH = 40
MAX_NOTE_EXCERPT_LENGTH = 1000

ALLOWED_TTL_PRESETS: dict[str, timedelta] = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "3d": timedelta(days=3),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}
