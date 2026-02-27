"""Item domain model.

An Item represents a shareable resource. Items may be:
- regular files
- folders (stored as a zip archive created by the server)
- external links
- text notes
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from app import db
from app.constants import DEFAULT_NOTE_EXCERPT_LENGTH


class ItemKind(str, Enum):
    """Kinds of items supported by the application."""

    FILE = "file"
    FOLDER = "folder"
    LINK = "link"
    NOTE = "note"

    @classmethod
    def from_string(cls, value: str) -> "ItemKind":
        try:
            return cls(value.lower())
        except ValueError:
            valid = ", ".join(k.value for k in cls)
            raise ValueError(f"Invalid kind '{value}'. Valid values: {valid}")


class ItemState(str, Enum):
    """Workflow state for items."""

    ACTIVE = "active"
    DONE = "done"
    ARCHIVED = "archived"
    READY_TO_DELETE = "ready_to_delete"

    @classmethod
    def from_string(cls, value: str) -> "ItemState":
        try:
            return cls(value.lower())
        except ValueError:
            valid = ", ".join(s.value for s in cls)
            raise ValueError(f"Invalid state '{value}'. Valid values: {valid}")


class Item(db.Model):
    """Shareable item model."""

    __tablename__ = "items"

    id: int = db.Column(db.Integer, primary_key=True)
    stored_name: str = db.Column(db.String(255), nullable=False, unique=True, index=True)
    display_name: str = db.Column(db.String(255), nullable=False, index=True)
    kind: str = db.Column(db.String(20), nullable=False, index=True)
    state: str = db.Column(
        db.String(20),
        nullable=False,
        default=ItemState.ACTIVE.value,
        index=True,
    )
    mime_type: Optional[str] = db.Column(db.String(255), nullable=True)
    size_bytes: int = db.Column(db.Integer, nullable=False, default=0)
    password_hash: Optional[str] = db.Column(db.String(255), nullable=True)
    created_at: datetime = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    meta_json: Optional[str] = db.Column(db.Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Item {self.id}: {self.display_name} ({self.kind}, {self.state})>"

    @property
    def kind_enum(self) -> ItemKind:
        return ItemKind(self.kind)

    @property
    def is_password_protected(self) -> bool:
        return bool(self.password_hash)

    def to_dto(
        self,
        *,
        include_note_text: bool = True,
        note_excerpt_chars: int = DEFAULT_NOTE_EXCERPT_LENGTH,
    ) -> dict[str, Any]:
        """Serialize the item for API responses."""
        meta = self._meta_dict()
        link_url = meta.get("url") if self.kind == ItemKind.LINK.value else None
        note_raw_text = meta.get("text") if self.kind == ItemKind.NOTE.value else None
        note_excerpt = self._note_excerpt(note_raw_text, max_chars=note_excerpt_chars)
        note_text = note_raw_text if include_note_text else None

        return {
            "id": self.id,
            "name": self.display_name,
            "kind": self.kind,
            "state": self.state,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "createdAt": self.created_at.isoformat(),
            "linkUrl": link_url if isinstance(link_url, str) else None,
            "noteText": note_text if isinstance(note_text, str) else None,
            "noteExcerpt": note_excerpt,
            "isPasswordProtected": self.is_password_protected,
        }

    def _meta_dict(self) -> dict[str, Any]:
        if not self.meta_json:
            return {}

        try:
            parsed = json.loads(self.meta_json)
        except json.JSONDecodeError:
            return {}

        return parsed if isinstance(parsed, dict) else {}

    def _note_excerpt(self, note_text: Any, *, max_chars: int) -> Optional[str]:
        if not isinstance(note_text, str):
            return None

        compact = " ".join(note_text.split()).strip()
        if not compact:
            return None

        if len(compact) <= max_chars:
            return compact

        return f"{compact[: max_chars - 3].rstrip()}..."
