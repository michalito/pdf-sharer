"""Space repository for data access operations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, case, func, or_

from app import db
from app.domain.item import Item
from app.domain.space import Space
from app.exceptions import NotFoundError


class SpaceRepository:
    """Repository for Space data access operations."""

    def _active_item_join_condition(self):
        now = datetime.now(timezone.utc)
        return and_(
            Item.space_id == Space.id,
            or_(Item.expires_at.is_(None), Item.expires_at > now),
        )

    def get_all(self) -> list[tuple[Space, int]]:
        """Return all spaces ordered by position (then name as tiebreaker) with item counts."""
        results = (
            db.session.query(Space, func.count(Item.id))
            .outerjoin(Item, self._active_item_join_condition())
            .group_by(Space.id)
            .order_by(Space.position.asc(), Space.normalized_name)
            .all()
        )
        return results

    def count_active_items(self, space_id: int) -> int:
        result = (
            db.session.query(func.count(Item.id))
            .filter(
                Item.space_id == space_id,
                or_(Item.expires_at.is_(None), Item.expires_at > datetime.now(timezone.utc)),
            )
            .scalar()
        )
        return int(result or 0)

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
        if not ordered_ids:
            return
        position_by_id = {space_id: position for position, space_id in enumerate(ordered_ids)}
        db.session.query(Space).filter(Space.id.in_(ordered_ids)).update(
            {
                "position": case(
                    *((Space.id == space_id, position) for space_id, position in position_by_id.items()),
                    else_=Space.position,
                )
            },
            synchronize_session=False,
        )
        db.session.commit()

    def delete(self, space: Space) -> None:
        db.session.delete(space)
        db.session.commit()
