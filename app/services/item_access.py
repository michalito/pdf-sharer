"""Session-backed helpers for per-item password unlock state."""

from __future__ import annotations

from flask import session


UNLOCKED_ITEMS_SESSION_KEY = "unlocked_item_ids"
UNLOCKED_ITEMS_MAX = 100


def clear_stale_unlocks_if_needed() -> None:
    """Normalize unlock list in session and enforce bounded size."""
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    if not isinstance(raw, list):
        session[UNLOCKED_ITEMS_SESSION_KEY] = []
        session.modified = True
        return

    cleaned: list[int] = []
    for value in raw:
        if isinstance(value, int):
            cleaned.append(value)
        elif isinstance(value, str) and value.isdigit():
            cleaned.append(int(value))

    # Preserve insertion order while deduplicating.
    deduped = list(dict.fromkeys(cleaned))
    bounded = deduped[-UNLOCKED_ITEMS_MAX:]

    if bounded != raw:
        session[UNLOCKED_ITEMS_SESSION_KEY] = bounded
        session.modified = True


def is_item_unlocked(item_id: int) -> bool:
    """Return True if this session has already unlocked the item."""
    clear_stale_unlocks_if_needed()
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    return item_id in raw if isinstance(raw, list) else False


def mark_item_unlocked(item_id: int) -> None:
    """Remember successful unlock for this item in current session."""
    clear_stale_unlocks_if_needed()
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    unlocked = list(raw) if isinstance(raw, list) else []

    if item_id in unlocked:
        return

    unlocked.append(item_id)
    session[UNLOCKED_ITEMS_SESSION_KEY] = unlocked[-UNLOCKED_ITEMS_MAX:]
    session.modified = True
