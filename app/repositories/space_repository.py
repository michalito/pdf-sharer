"""Space repository for data access operations."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func

from app import db
from app.domain.item import Item
from app.domain.space import Space
from app.exceptions import NotFoundError


class SpaceRepository:
    """Repository for Space data access operations."""

    def get_all(self) -> list[tuple[Space, int]]:
        """Return all spaces ordered by position (then name as tiebreaker) with item counts."""
        results = (
            db.session.query(Space, func.count(Item.id))
            .outerjoin(Item, Item.space_id == Space.id)
            .group_by(Space.id)
            .order_by(Space.position.asc(), Space.normalized_name)
            .all()
        )
        return results

    def get_by_id(self, space_id: int) -> Optional[Space]:
        return db.session.get(Space, space_id)

    def get_by_id_or_raise(self, space_id: int) -> Space:
        space = self.get_by_id(space_id)
        if space is None:
            raise NotFoundError(f"Space with ID {space_id} not found")
        return space

    def get_by_normalized_name(self, normalized_name: str) -> Optional[Space]:
        return Space.query.filter(
            Space.normalized_name == normalized_name
        ).first()

    def get_all_ids(self) -> set[int]:
        """Return the set of all space IDs."""
        rows = db.session.query(Space.id).all()
        return {row[0] for row in rows}

    def get_max_position(self) -> int:
        """Return the highest position value, or -1 if no spaces exist."""
        result = db.session.query(func.max(Space.position)).scalar()
        return result if result is not None else -1

    def create(self, *, name: str, normalized_name: str, position: int) -> Space:
        space = Space(name=name, normalized_name=normalized_name, position=position)
        db.session.add(space)
        db.session.commit()
        return space

    def rename(self, space: Space, *, name: str, normalized_name: str) -> Space:
        space.name = name
        space.normalized_name = normalized_name
        db.session.commit()
        return space

    def reorder(self, ordered_ids: list[int]) -> None:
        """Set positions based on the order of IDs in the list."""
        for position, space_id in enumerate(ordered_ids):
            db.session.query(Space).filter(Space.id == space_id).update(
                {"position": position}
            )
        db.session.commit()

    def delete(self, space: Space) -> None:
        db.session.delete(space)
        db.session.commit()
