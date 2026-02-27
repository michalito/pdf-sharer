from datetime import datetime, timezone

from app.api.item_presenter import present_item_for_api
from app.domain.item import Item, ItemKind, ItemState


def _make_item(*, kind: ItemKind, meta_json: str, password_hash: str | None) -> Item:
    return Item(
        id=1,
        stored_name="x",
        display_name="Example",
        kind=kind.value,
        state=ItemState.ACTIVE.value,
        mime_type="text/plain",
        size_bytes=1,
        created_at=datetime.now(timezone.utc),
        meta_json=meta_json,
        password_hash=password_hash,
    )


def test_present_item_for_api_masks_sensitive_fields_when_locked():
    item = _make_item(
        kind=ItemKind.LINK,
        meta_json='{"url":"https://example.com/secret"}',
        password_hash="hashed",
    )

    dto = present_item_for_api(item, is_password_unlocked=False)

    assert dto["isPasswordProtected"] is True
    assert dto["isPasswordUnlocked"] is False
    assert dto["linkUrl"] is None
    assert dto["noteText"] is None
    assert dto["noteExcerpt"] is None


def test_present_item_for_api_keeps_sensitive_fields_when_unlocked():
    item = _make_item(
        kind=ItemKind.NOTE,
        meta_json='{"text":"Top secret note text."}',
        password_hash="hashed",
    )

    dto = present_item_for_api(item, is_password_unlocked=True)

    assert dto["isPasswordProtected"] is True
    assert dto["isPasswordUnlocked"] is True
    assert dto["noteText"] == "Top secret note text."
    assert isinstance(dto["noteExcerpt"], str)


def test_present_item_for_api_marks_unprotected_items_as_unlocked():
    item = _make_item(
        kind=ItemKind.LINK,
        meta_json='{"url":"https://example.com/public"}',
        password_hash=None,
    )

    dto = present_item_for_api(item, is_password_unlocked=False)

    assert dto["isPasswordProtected"] is False
    assert dto["isPasswordUnlocked"] is True
    assert dto["linkUrl"] == "https://example.com/public"
