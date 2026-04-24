"""Space service for business logic operations."""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError

from app.domain.space import Space
from app.exceptions import FileOperationError, ValidationError
from app.repositories.space_repository import SpaceRepository
from app.utils.validation import validate_reorder_ids


logger = logging.getLogger(__name__)


class SpaceService:
    """Service for Space operations."""

    MAX_SPACE_NAME_LENGTH = 120

    def __init__(self, repository: Optional[SpaceRepository] = None):
        self.repository = repository or SpaceRepository()

    def list_spaces(self) -> list[dict]:
        """Return all spaces as DTOs with item counts."""
        rows = self.repository.get_all()
        return [space.to_dto(item_count=count) for space, count in rows]

    def get_space(self, space_id: int) -> Space:
        return self.repository.get_by_id_or_raise(space_id)

    def get_active_item_count(self, space_id: int) -> int:
        return self.repository.count_active_items(space_id)

    def create_space(self, name: str) -> Space:
        normalized, display = self._normalize_name(name)
        existing = self.repository.get_by_normalized_name(normalized)
        if existing is not None:
            raise ValidationError(f"A space named '{existing.name}' already exists")

        try:
            position = self.repository.get_max_position() + 1
            return self.repository.create(
                name=display, normalized_name=normalized, position=position
            )
        except SQLAlchemyError as e:
            logger.error("Failed to create space: %s", e, exc_info=True)
            raise FileOperationError("Failed to create space")

    def rename_space(self, space_id: int, name: str) -> Space:
        normalized, display = self._normalize_name(name)
        space = self.repository.get_by_id_or_raise(space_id)

        existing = self.repository.get_by_normalized_name(normalized)
        if existing is not None and existing.id != space.id:
            raise ValidationError(f"A space named '{existing.name}' already exists")

        try:
            return self.repository.rename(
                space, name=display, normalized_name=normalized
            )
        except SQLAlchemyError as e:
            logger.error("Failed to rename space %s: %s", space_id, e, exc_info=True)
            raise FileOperationError("Failed to rename space")

    def delete_space(self, space_id: int) -> int:
        """Delete a space and return the visible item count that was unassigned."""
        space = self.repository.get_by_id_or_raise(space_id)
        count = self.repository.count_active_items(space.id)
        try:
            self.repository.delete(space)
        except SQLAlchemyError as e:
            logger.error("Failed to delete space %s: %s", space_id, e, exc_info=True)
            raise FileOperationError("Failed to delete space")
        return count

    def reorder_spaces(self, ordered_ids: list[int]) -> None:
        """Reorder spaces by setting positions based on the given ID order.

        ``ordered_ids`` must be an exact permutation of all existing space IDs
        (no duplicates, no missing, no extras).
        """
        existing_ids = self.repository.get_all_ids()
        validate_reorder_ids(ordered_ids, existing_ids, "space IDs")

        try:
            self.repository.reorder(ordered_ids)
        except SQLAlchemyError as e:
            logger.error("Failed to reorder spaces: %s", e, exc_info=True)
            raise FileOperationError("Failed to reorder spaces")

    def _normalize_name(self, raw: str) -> tuple[str, str]:
        """Validate and normalize a space name.

        Returns ``(normalized, display)`` where *display* has collapsed
        whitespace and *normalized* is the case-folded form used for
        uniqueness checks.
        """
        display = " ".join((raw or "").split())
        if not display:
            raise ValidationError("Space name cannot be empty")
        if len(display) > self.MAX_SPACE_NAME_LENGTH:
            raise ValidationError(
                f"Space name is too long (max {self.MAX_SPACE_NAME_LENGTH} characters)"
            )
        return display.casefold(), display
