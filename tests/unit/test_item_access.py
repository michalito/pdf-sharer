from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from flask import g, session

from app.services.item_access import (
    AUTHENTICATED_UNLOCKS_SESSION_KEY,
    UNLOCKED_ITEMS_MAX,
    UNLOCKED_ITEMS_SESSION_KEY,
    bind_authenticated_unlocks,
    clear_stale_unlocks_if_needed,
    is_item_unlocked,
    mark_item_unlocked,
)


def _make_item(item_id: int, created_at: datetime | None = None):
    return SimpleNamespace(
        id=item_id,
        created_at=created_at or datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


def _token_for_item(item) -> str:
    created_at = item.created_at if item.created_at.tzinfo is not None else item.created_at.replace(tzinfo=timezone.utc)
    return f"v2:{item.id}:{created_at.astimezone(timezone.utc).isoformat()}"


def test_legacy_integer_session_entries_are_dropped(app):
    with app.test_request_context("/"):
        item = _make_item(1)
        session[UNLOCKED_ITEMS_SESSION_KEY] = [1, "1", "invalid", "v1:1:2026-01-01T00:00:00+00:00"]

        clear_stale_unlocks_if_needed()

        assert session[UNLOCKED_ITEMS_SESSION_KEY] == []
        assert is_item_unlocked(item) is False


def test_valid_v2_tokens_are_preserved(app):
    with app.test_request_context("/"):
        item = _make_item(7, datetime(2026, 2, 3, 4, 5, tzinfo=timezone.utc))

        mark_item_unlocked(item)
        stored = list(session[UNLOCKED_ITEMS_SESSION_KEY])

        clear_stale_unlocks_if_needed()

        assert session[UNLOCKED_ITEMS_SESSION_KEY] == stored
        assert session[UNLOCKED_ITEMS_SESSION_KEY] == [_token_for_item(item)]
        assert is_item_unlocked(item) is True


def test_unlock_entries_deduplicate_preserve_order_and_enforce_bound(app):
    base = datetime(2026, 3, 1, tzinfo=timezone.utc)
    items = [
        _make_item(item_id=index, created_at=base + timedelta(minutes=index))
        for index in range(1, UNLOCKED_ITEMS_MAX + 6)
    ]

    with app.test_request_context("/"):
        for item in items:
            mark_item_unlocked(item)

        session[UNLOCKED_ITEMS_SESSION_KEY].append(_token_for_item(items[-1]))
        session[UNLOCKED_ITEMS_SESSION_KEY].append("bogus")

        clear_stale_unlocks_if_needed()

        expected = [_token_for_item(item) for item in items[-UNLOCKED_ITEMS_MAX:]]
        assert session[UNLOCKED_ITEMS_SESSION_KEY] == expected
        assert len(session[UNLOCKED_ITEMS_SESSION_KEY]) == UNLOCKED_ITEMS_MAX
        assert is_item_unlocked(items[0]) is False
        assert is_item_unlocked(items[-1]) is True


def test_authenticated_grants_have_separate_bounds_and_drop_on_subject_change(app):
    with app.test_request_context("/"):
        anonymous_item = _make_item(999)
        mark_item_unlocked(anonymous_item)
        anonymous_grants = list(session[UNLOCKED_ITEMS_SESSION_KEY])

        g.forward_identity = {"sub": "member-a"}
        for item_id in range(1, UNLOCKED_ITEMS_MAX + 6):
            mark_item_unlocked(_make_item(item_id))
        mark_item_unlocked(_make_item(UNLOCKED_ITEMS_MAX + 5))
        assert len(session[AUTHENTICATED_UNLOCKS_SESSION_KEY]["tokens"]) == UNLOCKED_ITEMS_MAX
        assert is_item_unlocked(_make_item(1)) is False
        assert is_item_unlocked(_make_item(UNLOCKED_ITEMS_MAX + 5)) is True
        assert session[UNLOCKED_ITEMS_SESSION_KEY] == anonymous_grants

        g.forward_identity = {"sub": "member-b"}
        bind_authenticated_unlocks("member-b")
        assert is_item_unlocked(_make_item(UNLOCKED_ITEMS_MAX + 5)) is False
        assert is_item_unlocked(anonymous_item) is True


def test_malformed_authenticated_grants_cannot_preserve_access(app):
    with app.test_request_context("/"):
        g.forward_identity = {"sub": "member-a"}
        item = _make_item(1)
        for malformed in ["invalid", {"sub": "member-a", "tokens": "invalid"},
                          {"sub": "member-b", "tokens": [_token_for_item(item)]}]:
            session[AUTHENTICATED_UNLOCKS_SESSION_KEY] = malformed
            assert is_item_unlocked(item) is False
            assert session[AUTHENTICATED_UNLOCKS_SESSION_KEY] == {"sub": "member-a", "tokens": []}
