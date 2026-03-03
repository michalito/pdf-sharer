"""Presentation helpers for API item DTOs."""

from __future__ import annotations

from typing import Any

from app.constants import DEFAULT_NOTE_EXCERPT_LENGTH
from app.domain.item import Item


def present_item_for_api(
    item: Item,
    *,
    is_password_unlocked: bool,
    include_note_text: bool = True,
    note_excerpt_chars: int = DEFAULT_NOTE_EXCERPT_LENGTH,
) -> dict[str, Any]:
    """Render an item DTO and apply access-policy masking for API consumers."""
    dto = item.to_dto(
        include_note_text=include_note_text,
        note_excerpt_chars=note_excerpt_chars,
    )

    is_protected = bool(dto.get("isPasswordProtected"))
    resolved_unlocked = is_password_unlocked if is_protected else True
    dto["isPasswordUnlocked"] = resolved_unlocked

    if is_protected and not resolved_unlocked:
        dto["linkUrl"] = None
        dto["noteText"] = None
        dto["noteExcerpt"] = None
        dto["contentHash"] = None

    return dto
