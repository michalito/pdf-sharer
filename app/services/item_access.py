"""Session-backed helpers for per-item password unlock state."""

from __future__ import annotations

from datetime import datetime, timezone

from flask import session

from app.domain.item import Item


UNLOCKED_ITEMS_SESSION_KEY = "unlocked_item_ids"
UNLOCKED_ITEMS_MAX = 100
_UNLOCK_TOKEN_VERSION = "v2"


def _normalize_utc_iso(value: datetime) -> str:
    dt = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _unlock_token_for_item(item: Item) -> str:
    return f"{_UNLOCK_TOKEN_VERSION}:{item.id}:{_normalize_utc_iso(item.created_at)}"


def _normalize_unlock_token(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    version, sep, remainder = value.partition(":")
    if version != _UNLOCK_TOKEN_VERSION or not sep:
        return None

    item_id_raw, sep, created_at_raw = remainder.partition(":")
    if not sep:
        return None

    try:
        item_id = int(item_id_raw)
    except ValueError:
        return None
    if item_id <= 0:
        return None

    try:
        datetime.fromisoformat(created_at_raw)
    except ValueError:
        return None

    return value


def clear_stale_unlocks_if_needed() -> None:
    """Normalize unlock list in session and enforce bounded size."""
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    if not isinstance(raw, list):
        session[UNLOCKED_ITEMS_SESSION_KEY] = []
        session.modified = True
        return

    cleaned: list[str] = []
    for value in raw:
        token = _normalize_unlock_token(value)
        if token is not None:
            cleaned.append(token)

    # Preserve insertion order while deduplicating.
    deduped = list(dict.fromkeys(cleaned))
    bounded = deduped[-UNLOCKED_ITEMS_MAX:]

    if bounded != raw:
        session[UNLOCKED_ITEMS_SESSION_KEY] = bounded
        session.modified = True


def is_item_unlocked(item: Item) -> bool:
    """Return True if this session has already unlocked the item."""
    clear_stale_unlocks_if_needed()
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    return _unlock_token_for_item(item) in raw if isinstance(raw, list) else False


def mark_item_unlocked(item: Item) -> None:
    """Remember successful unlock for this item in current session."""
    clear_stale_unlocks_if_needed()
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    unlocked = list(raw) if isinstance(raw, list) else []
    token = _unlock_token_for_item(item)

    if token in unlocked:
        return

    unlocked.append(token)
    session[UNLOCKED_ITEMS_SESSION_KEY] = unlocked[-UNLOCKED_ITEMS_MAX:]
    session.modified = True
