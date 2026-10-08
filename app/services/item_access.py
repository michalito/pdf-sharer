"""Session-backed helpers for per-item password unlock state."""

from __future__ import annotations

from datetime import datetime, timezone

from flask import Flask, g, session
from werkzeug.http import dump_cookie

from app.domain.item import Item


UNLOCKED_ITEMS_SESSION_KEY = "unlocked_item_ids"
AUTHENTICATED_UNLOCKS_SESSION_KEY = "authenticated_item_unlocks"
UNLOCKED_ITEMS_MAX = 100
UNLOCK_COOKIE_MAX_BYTES = 3800
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


def _clean_tokens(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []

    cleaned: list[str] = []
    for value in raw:
        token = _normalize_unlock_token(value)
        if token is not None:
            cleaned.append(token)

    # Preserve insertion order while deduplicating.
    deduped = list(dict.fromkeys(cleaned))
    return deduped[-UNLOCKED_ITEMS_MAX:]


def clear_stale_unlocks_if_needed() -> None:
    """Normalize anonymous browser unlocks and enforce bounded size."""
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    bounded = _clean_tokens(raw)

    if bounded != raw:
        session[UNLOCKED_ITEMS_SESSION_KEY] = bounded
        session.modified = True


def bind_authenticated_unlocks(subject: str) -> None:
    """Discard a previous member's API grants without discarding anonymous share grants."""
    raw = session.get(AUTHENTICATED_UNLOCKS_SESSION_KEY)
    tokens = _clean_tokens(raw.get("tokens")) if isinstance(raw, dict) and raw.get("sub") == subject else []
    grants = {"sub": subject, "tokens": tokens}
    if raw != grants:
        session[AUTHENTICATED_UNLOCKS_SESSION_KEY] = grants
        session.modified = True


def _authenticated_subject() -> str | None:
    identity = getattr(g, "forward_identity", None)
    return identity["sub"] if identity else None


def is_item_unlocked(item: Item) -> bool:
    """Return True if this session has already unlocked the item."""
    clear_stale_unlocks_if_needed()
    raw = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
    token = _unlock_token_for_item(item)
    if token in raw:
        return True
    subject = _authenticated_subject()
    if subject:
        bind_authenticated_unlocks(subject)
        return token in session[AUTHENTICATED_UNLOCKS_SESSION_KEY]["tokens"]
    return False


def mark_item_unlocked(item: Item) -> None:
    """Remember successful unlock for this item in current session."""
    clear_stale_unlocks_if_needed()
    subject = _authenticated_subject()
    if subject:
        bind_authenticated_unlocks(subject)
        unlocked = list(session[AUTHENTICATED_UNLOCKS_SESSION_KEY]["tokens"])
    else:
        unlocked = list(session.get(UNLOCKED_ITEMS_SESSION_KEY, []))
    token = _unlock_token_for_item(item)

    if token in unlocked:
        return

    unlocked.append(token)
    if subject:
        session[AUTHENTICATED_UNLOCKS_SESSION_KEY] = {
            "sub": subject, "tokens": unlocked[-UNLOCKED_ITEMS_MAX:],
        }
    else:
        session[UNLOCKED_ITEMS_SESSION_KEY] = unlocked[-UNLOCKED_ITEMS_MAX:]
    session.modified = True


def enforce_unlock_cookie_budget(app: Flask) -> None:
    """Trim old grants against the actual signed cookie, shared by both scopes."""
    interface = app.session_interface
    if not session or not interface.should_set_cookie(app, session):
        return
    serializer = interface.get_signing_serializer(app)

    def cookie_size() -> int:
        header = dump_cookie(
            interface.get_cookie_name(app), serializer.dumps(dict(session)),
            expires=interface.get_expiration_time(app, session),
            path=interface.get_cookie_path(app), domain=interface.get_cookie_domain(app),
            secure=interface.get_cookie_secure(app), httponly=interface.get_cookie_httponly(app),
            samesite=interface.get_cookie_samesite(app), partitioned=interface.get_cookie_partitioned(app),
            max_size=0,
        )
        return len(header.encode("latin-1"))

    while cookie_size() > UNLOCK_COOKIE_MAX_BYTES:
        anonymous = session.get(UNLOCKED_ITEMS_SESSION_KEY, [])
        authenticated = session.get(AUTHENTICATED_UNLOCKS_SESSION_KEY, {})
        member_tokens = authenticated.get("tokens", []) if isinstance(authenticated, dict) else []
        anonymous = anonymous if isinstance(anonymous, list) else []
        member_tokens = member_tokens if isinstance(member_tokens, list) else []
        if anonymous and len(anonymous) >= len(member_tokens):
            session[UNLOCKED_ITEMS_SESSION_KEY] = anonymous[1:]
        elif member_tokens:
            session[AUTHENTICATED_UNLOCKS_SESSION_KEY] = {**authenticated, "tokens": member_tokens[1:]}
        elif AUTHENTICATED_UNLOCKS_SESSION_KEY in session:
            session.pop(AUTHENTICATED_UNLOCKS_SESSION_KEY)
        else:
            # Oversized legacy/malformed state must not make the browser discard
            # the entire unlock cookie. Empty state fails closed.
            session.clear()
        session.modified = True
