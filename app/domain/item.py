"""Item domain model.

An Item represents a shareable resource stored on disk. Items may be regular
files or folders (stored as a zip archive created by the server).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from app import db


class ItemKind(str, Enum):
    """Kinds of items supported by the application."""

    FILE = "file"
    FOLDER = "folder"

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

    def to_dto(self) -> dict[str, Any]:
        """Serialize the item for API responses."""
        return {
            "id": self.id,
            "name": self.display_name,
            "kind": self.kind,
            "state": self.state,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "createdAt": self.created_at.isoformat(),
        }
