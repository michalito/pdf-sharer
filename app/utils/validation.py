"""Shared validation utilities."""

from __future__ import annotations

from app.exceptions import ValidationError


def validate_reorder_ids(
    ordered_ids: list[int],
    existing_ids: set[int],
    label: str,
) -> None:
    """Validate that ordered_ids is an exact permutation of existing_ids.

    Raises ValidationError if the list is empty, has duplicates,
    or doesn't match existing_ids exactly.
    """
    if not ordered_ids:
        raise ValidationError("orderedIds must be a non-empty list")

    if len(ordered_ids) != len(set(ordered_ids)):
        raise ValidationError("orderedIds must not contain duplicates")

    given_ids = set(ordered_ids)
    if given_ids != existing_ids:
        missing = existing_ids - given_ids
        extra = given_ids - existing_ids
        parts = []
        if missing:
            parts.append(f"missing IDs: {sorted(missing)}")
        if extra:
            parts.append(f"unknown IDs: {sorted(extra)}")
        raise ValidationError(
            f"orderedIds must be an exact permutation of all {label} ({', '.join(parts)})"
        )
