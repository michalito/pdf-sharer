"""API route definitions."""

from __future__ import annotations

import logging
from typing import Optional

from flask import Response, current_app, g, jsonify, request, send_file

from app.api import api
from app.constants import (
    DEFAULT_NOTE_EXCERPT_LENGTH,
    MAX_NOTE_EXCERPT_LENGTH,
    MIN_NOTE_EXCERPT_LENGTH,
)
from app.domain.item import ItemKind, ItemState
from app.error_handlers import register_error_handlers
from app.exceptions import ValidationError
from app.services.item_service import ItemService


logger = logging.getLogger(__name__)

# Register all error handlers for this blueprint
register_error_handlers(api)


def _get_service() -> ItemService:
    return g.item_service


def _get_note_excerpt_length() -> int:
    raw_value = current_app.config.get("NOTE_EXCERPT_LENGTH", DEFAULT_NOTE_EXCERPT_LENGTH)
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = DEFAULT_NOTE_EXCERPT_LENGTH

    return max(MIN_NOTE_EXCERPT_LENGTH, min(MAX_NOTE_EXCERPT_LENGTH, value))


def _serialize_item(item, *, include_note_text: bool = True, note_excerpt_chars: int | None = None) -> dict:
    excerpt_chars = note_excerpt_chars if note_excerpt_chars is not None else _get_note_excerpt_length()
    return item.to_dto(include_note_text=include_note_text, note_excerpt_chars=excerpt_chars)


@api.route("/health", methods=["GET"])
def health() -> Response:
    return jsonify({"ok": True})


@api.route("/items", methods=["GET"])
def list_items() -> Response:
    service = _get_service()

    q = request.args.get("q")
    kind_filter = request.args.get("kind")
    kind: Optional[ItemKind] = None
    if kind_filter:
        try:
            kind = ItemKind.from_string(kind_filter)
        except ValueError as e:
            raise ValidationError(str(e))

    state_filter = request.args.get("state")
    state: Optional[ItemState] = None
    if state_filter:
        try:
            state = ItemState.from_string(state_filter)
        except ValueError as e:
            raise ValidationError(str(e))

    try:
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 50))
    except ValueError:
        raise ValidationError("Invalid pagination parameters")

    note_excerpt_chars = _get_note_excerpt_length()
    result = service.list_items(q=q, kind=kind, state=state, page=page, per_page=per_page)
    return jsonify(
        {
            "items": [
                _serialize_item(item, include_note_text=False, note_excerpt_chars=note_excerpt_chars)
                for item in result.items
            ],
            "pagination": result.to_dict(),
        }
    )


@api.route("/items/files", methods=["POST"])
def upload_files() -> tuple[Response, int]:
    service = _get_service()

    files = request.files.getlist("files")
    if not files:
        raise ValidationError("No files provided")

    items = service.upload_files(files)
    return jsonify([_serialize_item(item) for item in items]), 201


@api.route("/items/folder", methods=["POST"])
def upload_folder() -> tuple[Response, int]:
    service = _get_service()

    files = request.files.getlist("files")
    paths = request.form.getlist("paths")

    item = service.upload_folder(files, paths)
    return jsonify(_serialize_item(item)), 201


@api.route("/items/link", methods=["POST"])
def create_link() -> tuple[Response, int]:
    service = _get_service()

    data = request.get_json(silent=True) or {}
    url_raw = data.get("url")
    if not isinstance(url_raw, str):
        raise ValidationError("Missing 'url' field in request body")

    name_raw = data.get("name")
    name = str(name_raw) if name_raw is not None else None

    item = service.create_link(url=url_raw, name=name)
    return jsonify(_serialize_item(item)), 201


@api.route("/items/note", methods=["POST"])
def create_note() -> tuple[Response, int]:
    service = _get_service()

    data = request.get_json(silent=True) or {}
    text_raw = data.get("text")
    if not isinstance(text_raw, str):
        raise ValidationError("Missing 'text' field in request body")

    title_raw = data.get("title")
    title = str(title_raw) if title_raw is not None else None

    item = service.create_note(text=text_raw, title=title)
    return jsonify(_serialize_item(item)), 201


@api.route("/items/<int:item_id>", methods=["GET"])
def get_item(item_id: int) -> Response:
    service = _get_service()
    item = service.get_item(item_id)
    return jsonify(_serialize_item(item))


@api.route("/items/<int:item_id>/download", methods=["GET"])
def download_item(item_id: int) -> Response:
    service = _get_service()
    item = service.get_item(item_id)
    file_path = service.get_item_path(item)
    download_name = service.get_download_name(item)

    return send_file(
        file_path,
        as_attachment=True,
        download_name=download_name,
        mimetype=item.mime_type or None,
    )


@api.route("/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id: int) -> tuple[str, int]:
    service = _get_service()
    service.delete_item(item_id)
    return "", 204


@api.route("/items/ready-to-delete", methods=["DELETE"])
def delete_ready_to_delete() -> Response:
    service = _get_service()

    q = request.args.get("q")
    kind_filter = request.args.get("kind")
    kind: Optional[ItemKind] = None
    if kind_filter:
        try:
            kind = ItemKind.from_string(kind_filter)
        except ValueError as e:
            raise ValidationError(str(e))

    deleted = service.delete_ready_to_delete(q=q, kind=kind)
    return jsonify({"deleted": deleted})


@api.route("/items/<int:item_id>", methods=["PATCH"])
def update_item(item_id: int) -> Response:
    service = _get_service()

    data = request.get_json(silent=True) or {}
    state_raw = data.get("state")
    if not state_raw:
        raise ValidationError("Missing 'state' field in request body")

    try:
        state = ItemState.from_string(str(state_raw))
    except ValueError as e:
        raise ValidationError(str(e))

    item = service.update_state(item_id, state)
    return jsonify(_serialize_item(item))
