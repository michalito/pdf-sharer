"""Space API route definitions."""

from __future__ import annotations

import logging

from flask import Response, g, jsonify

from app.api import api, get_json_body
from app.exceptions import ValidationError
from app.services.space_service import SpaceService


logger = logging.getLogger(__name__)


def _get_space_service() -> SpaceService:
    return g.space_service


@api.route("/spaces", methods=["GET"])
def list_spaces() -> Response:
    service = _get_space_service()
    spaces = service.list_spaces()
    return jsonify(spaces)


@api.route("/spaces", methods=["POST"])
def create_space() -> tuple[Response, int]:
    service = _get_space_service()
    data = get_json_body()
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValidationError("Missing 'name' field in request body")

    space = service.create_space(name)
    return jsonify(space.to_dto()), 201


@api.route("/spaces/reorder", methods=["PUT"])
def reorder_spaces() -> Response:
    service = _get_space_service()
    data = get_json_body()
    ordered_ids = data.get("orderedIds")
    if not isinstance(ordered_ids, list) or not all(
        type(i) is int for i in ordered_ids
    ):
        raise ValidationError("'orderedIds' must be an array of integers")

    service.reorder_spaces(ordered_ids)
    return jsonify({"ok": True})


@api.route("/spaces/<int:space_id>", methods=["PATCH"])
def rename_space(space_id: int) -> Response:
    service = _get_space_service()
    data = get_json_body()
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValidationError("Missing 'name' field in request body")

    space = service.rename_space(space_id, name)
    return jsonify(space.to_dto())


@api.route("/spaces/<int:space_id>", methods=["DELETE"])
def delete_space(space_id: int) -> Response:
    service = _get_space_service()
    unassigned = service.delete_space(space_id)
    return jsonify({"unassigned": unassigned})
