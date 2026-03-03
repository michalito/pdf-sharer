"""Space domain model.

A Space is a named grouping for items. Items can optionally belong to
one Space (one-to-many). Spaces are purely organizational — they do not
affect sharing, passwords, or download behaviour.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app import db


class Space(db.Model):
    """Named grouping for items."""

    __tablename__ = "spaces"

    id: int = db.Column(db.Integer, primary_key=True)
    name: str = db.Column(db.String(120), nullable=False)
    normalized_name: str = db.Column(
        db.String(120), nullable=False, unique=True, index=True
    )
    position: int = db.Column(db.Integer, nullable=True)
    created_at: datetime = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    items = db.relationship("Item", back_populates="space", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Space {self.id}: {self.name}>"

    def to_dto(self, *, item_count: int | None = None) -> dict[str, Any]:
        count = item_count if item_count is not None else self.items.count()
        return {
            "id": self.id,
            "name": self.name,
            "position": self.position,
            "createdAt": self.created_at.isoformat(),
            "itemCount": count,
        }
