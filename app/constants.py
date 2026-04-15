"""Application-wide constants."""

from datetime import timedelta

DEFAULT_MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024  # 2GB
DEFAULT_MAX_NOTE_TEXT_LENGTH = 100_000
DEFAULT_NOTE_EXCERPT_LENGTH = 180
MIN_NOTE_EXCERPT_LENGTH = 40
MAX_NOTE_EXCERPT_LENGTH = 1000

DEFAULT_PAGE = 1
DEFAULT_PER_PAGE = 50
MAX_PER_PAGE = 200

UNLOCK_THROTTLE_MAX_ATTEMPTS = 5
UNLOCK_THROTTLE_WINDOW_SECONDS = 60
UNLOCK_THROTTLE_COOLDOWN_SECONDS = 60

ALLOWED_TTL_PRESETS: dict[str, timedelta] = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "3d": timedelta(days=3),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}
