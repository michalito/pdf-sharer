"""API route definitions."""

from __future__ import annotations

import logging
from typing import Optional

from flask import Response, current_app, g, jsonify, request, send_file

from app.api import api, get_json_body
from app.api.item_presenter import present_item_for_api
from app.constants import (
    DEFAULT_NOTE_EXCERPT_LENGTH,
    DEFAULT_PAGE,
    DEFAULT_PER_PAGE,
    MAX_NOTE_EXCERPT_LENGTH,
    MAX_PER_PAGE,
    MIN_NOTE_EXCERPT_LENGTH,
)
from app.domain.item import ItemKind, ItemState
from app.error_handlers import register_error_handlers
from app.exceptions import AuthenticationError, ValidationError
from app.services.item_access import is_item_unlocked, mark_item_unlocked
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


def _get_json_password_field(data: dict) -> Optional[str]:
    raw_password = data.get("password")
    if raw_password is None:
        return None
    if not isinstance(raw_password, str):
        raise ValidationError("Field 'password' must be a string")
    return raw_password


def _parse_optional_int_form_field(field: str) -> Optional[int]:
    raw = request.form.get(field)
    if raw is None or raw.strip() == "":
        return None
    try:
        parsed = int(raw)
    except ValueError:
        raise ValidationError(f"Field '{field}' must be an integer")
    if parsed <= 0:
        raise ValidationError(f"Field '{field}' must be a positive integer")
    return parsed


def _parse_optional_int_json_field(data: dict, field: str) -> Optional[int]:
    raw = data.get(field)
    if raw is None:
        return None
    if isinstance(raw, bool) or isinstance(raw, float):
        raise ValidationError(f"Field '{field}' must be an integer or null")
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        raise ValidationError(f"Field '{field}' must be an integer or null")
    if parsed <= 0:
        raise ValidationError(f"Field '{field}' must be a positive integer")
    return parsed


def _validate_space_id(space_id: Optional[int]) -> None:
    """Validate that a space_id refers to an existing space. No-op if None."""
    if space_id is not None:
        g.space_service.get_space(space_id)


def _parse_space_query_param(raw: Optional[str]) -> tuple[Optional[int], Optional[bool]]:
    """Parse ``space`` query parameter into ``(space_id, unspaced)``."""
    if raw is None:
        return None, None
    if raw.lower() == "none":
        return None, True
    try:
        space_id = int(raw)
    except ValueError:
        raise ValidationError("Invalid 'space' value. Use an integer ID or 'none'.")
    if space_id <= 0:
        raise ValidationError("Invalid 'space' value. Use a positive integer ID.")
    return space_id, None


_VALID_SORT_FIELDS = {"name", "size", "created", "modified"}
_VALID_SORT_ORDERS = {"asc", "desc"}


def _parse_sort_params() -> tuple[str, str]:
    """Parse and validate sort and order query params."""
    sort = (request.args.get("sort") or "created").lower()
    order = (request.args.get("order") or "desc").lower()

    if sort not in _VALID_SORT_FIELDS:
        raise ValidationError(
            f"Invalid 'sort' value. Valid values: {', '.join(sorted(_VALID_SORT_FIELDS))}"
        )
    if order not in _VALID_SORT_ORDERS:
        raise ValidationError("Invalid 'order' value. Use 'asc' or 'desc'.")

    return sort, order


def _parse_pagination_params() -> tuple[int, int]:
    """Parse and validate ``page`` and ``per_page`` query params."""
    try:
        page = int(request.args.get("page", DEFAULT_PAGE))
    except (TypeError, ValueError):
        raise ValidationError("Invalid 'page' value. Must be an integer.")
    try:
        per_page = int(request.args.get("per_page", DEFAULT_PER_PAGE))
    except (TypeError, ValueError):
        raise ValidationError("Invalid 'per_page' value. Must be an integer.")

    if page < 1:
        raise ValidationError("'page' must be at least 1")
    if per_page < 1 or per_page > MAX_PER_PAGE:
        raise ValidationError(f"'per_page' must be between 1 and {MAX_PER_PAGE}")

    return page, per_page


def _parse_bool_query_param(raw: Optional[str], *, field: str) -> Optional[bool]:
    if raw is None or raw == "":
        return None

    value = raw.strip().lower()
    if value in {"1", "true", "yes"}:
        return True
    if value in {"0", "false", "no"}:
        return False

    raise ValidationError(f"Invalid '{field}' value. Use true or false.")


def _is_item_unlocked_for_session(service: ItemService, item) -> bool:
    if not service.item_requires_password(item):
        return True
    return is_item_unlocked(item.id)


def _remember_item_unlock_if_protected(service: ItemService, item) -> None:
    if service.item_requires_password(item):
        mark_item_unlocked(item.id)


def _present_item(
    service: ItemService,
    item,
    *,
    include_note_text: bool = True,
    note_excerpt_chars: int | None = None,
) -> dict:
    excerpt_chars = note_excerpt_chars if note_excerpt_chars is not None else _get_note_excerpt_length()
    unlocked = _is_item_unlocked_for_session(service, item)
    return present_item_for_api(
        item,
        is_password_unlocked=unlocked,
        include_note_text=include_note_text,
        note_excerpt_chars=excerpt_chars,
    )


@api.route("/health", methods=["GET"])
def health() -> Response:
    return jsonify({"ok": True, "version": current_app.config["APP_VERSION"]})


@api.route("/storage", methods=["GET"])
def storage_overview() -> Response:
    service = _get_service()
    overview = service.get_storage_overview()

    disk_dto = None
    if overview.disk is not None:
        disk_dto = {
            "totalBytes": overview.disk.total_bytes,
            "usedBytes": overview.disk.used_bytes,
            "freeBytes": overview.disk.free_bytes,
        }

    stats = overview.stats
    count_by_kind = {k.value: stats.count_by_kind.get(k.value, 0) for k in ItemKind}
    size_by_kind = {k.value: stats.size_by_kind.get(k.value, 0) for k in ItemKind}
    count_by_state = {s.value: stats.count_by_state.get(s.value, 0) for s in ItemState}
    size_by_state = {s.value: stats.size_by_state.get(s.value, 0) for s in ItemState}

    space_stats = [
        {
            "spaceId": ss.space_id,
            "spaceName": ss.space_name,
            "itemCount": ss.item_count,
            "sizeBytes": ss.size_bytes,
        }
        for ss in stats.space_stats
    ]

    largest_items = [
        {
            "id": item.id,
            "name": item.display_name,
            "kind": item.kind,
            "state": item.state,
            "sizeBytes": item.size_bytes,
            "createdAt": item.created_at.isoformat(),
            "spaceName": item.space.name if item.space else None,
        }
        for item in stats.largest_items
    ]

    return jsonify({
        "disk": disk_dto,
        "items": {
            "totalCount": stats.total_count,
            "totalSizeBytes": stats.total_size_bytes,
            "countByKind": count_by_kind,
            "sizeByKind": size_by_kind,
            "countByState": count_by_state,
            "sizeByState": size_by_state,
        },
        "spaceStats": space_stats,
        "largestItems": largest_items,
    })


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
    protected = _parse_bool_query_param(request.args.get("protected"), field="protected")

    space_id, unspaced = _parse_space_query_param(request.args.get("space"))
    sort, order = _parse_sort_params()
    page, per_page = _parse_pagination_params()

    note_excerpt_chars = _get_note_excerpt_length()
    result = service.list_items(
        q=q,
        kind=kind,
        state=state,
        protected=protected,
        space_id=space_id,
        unspaced=unspaced,
        page=page,
        per_page=per_page,
        sort=sort,
        order=order,
    )
    return jsonify(
        {
            "items": [
                _present_item(
                    service,
                    item,
                    include_note_text=False,
                    note_excerpt_chars=note_excerpt_chars,
                )
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

    password = request.form.get("password")
    space_id = _parse_optional_int_form_field("space_id")
    _validate_space_id(space_id)
    ttl = request.form.get("ttl")
    items = service.upload_files(files, password=password, space_id=space_id, ttl=ttl)
    for item in items:
        _remember_item_unlock_if_protected(service, item)
    return jsonify([_present_item(service, item) for item in items]), 201


@api.route("/items/folder", methods=["POST"])
def upload_folder() -> tuple[Response, int]:
    service = _get_service()

    files = request.files.getlist("files")
    paths = request.form.getlist("paths")
    password = request.form.get("password")
    space_id = _parse_optional_int_form_field("space_id")
    _validate_space_id(space_id)
    ttl = request.form.get("ttl")

    item = service.upload_folder(files, paths, password=password, space_id=space_id, ttl=ttl)
    _remember_item_unlock_if_protected(service, item)
    return jsonify(_present_item(service, item)), 201


@api.route("/items/link", methods=["POST"])
def create_link() -> tuple[Response, int]:
    service = _get_service()

    data = get_json_body()
    url_raw = data.get("url")
    if not isinstance(url_raw, str):
        raise ValidationError("Missing 'url' field in request body")

    name_raw = data.get("name")
    name = str(name_raw) if name_raw is not None else None
    password = _get_json_password_field(data)

    space_id = _parse_optional_int_json_field(data, "spaceId")
    _validate_space_id(space_id)
    ttl = data["ttl"] if "ttl" in data else None
    item = service.create_link(url=url_raw, name=name, password=password, space_id=space_id, ttl=ttl)
    _remember_item_unlock_if_protected(service, item)
    return jsonify(_present_item(service, item)), 201


@api.route("/items/note", methods=["POST"])
def create_note() -> tuple[Response, int]:
    service = _get_service()

    data = get_json_body()
    text_raw = data.get("text")
    if not isinstance(text_raw, str):
        raise ValidationError("Missing 'text' field in request body")

    title_raw = data.get("title")
    title = str(title_raw) if title_raw is not None else None
    password = _get_json_password_field(data)

    space_id = _parse_optional_int_json_field(data, "spaceId")
    _validate_space_id(space_id)
    ttl = data["ttl"] if "ttl" in data else None
    item = service.create_note(text=text_raw, title=title, password=password, space_id=space_id, ttl=ttl)
    _remember_item_unlock_if_protected(service, item)
    return jsonify(_present_item(service, item)), 201


@api.route("/items/<int:item_id>", methods=["GET"])
def get_item(item_id: int) -> Response:
    service = _get_service()
    item = service.get_item(item_id)
    return jsonify(_present_item(service, item))


@api.route("/items/<int:item_id>/download", methods=["GET"])
def download_item(item_id: int) -> Response:
    service = _get_service()
    item = service.get_item(item_id)
    if service.item_requires_password(item) and not is_item_unlocked(item.id):
        raise AuthenticationError("Password required for this item")

    file_path = service.get_item_path(item)
    download_name = service.get_download_name(item)

    return send_file(
        file_path,
        as_attachment=True,
        download_name=download_name,
        mimetype=item.mime_type or None,
    )


@api.route("/items/<int:item_id>/unlock", methods=["POST"])
def unlock_item(item_id: int) -> tuple[str, int]:
    service = _get_service()
    item = service.get_item(item_id)

    if not service.item_requires_password(item) or is_item_unlocked(item.id):
        return "", 204

    data = get_json_body()
    password_raw = data.get("password")
    if not isinstance(password_raw, str):
        raise ValidationError("Missing 'password' field in request body")

    if not service.verify_item_password(item, password_raw):
        raise AuthenticationError("Invalid password")

    mark_item_unlocked(item.id)
    return "", 204


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
    protected = _parse_bool_query_param(request.args.get("protected"), field="protected")
    space_id, unspaced = _parse_space_query_param(request.args.get("space"))

    deleted = service.delete_ready_to_delete(
        q=q, kind=kind, protected=protected, space_id=space_id, unspaced=unspaced,
    )
    return jsonify({"deleted": deleted})


@api.route("/items/<int:item_id>", methods=["PATCH"])
def update_item(item_id: int) -> Response:
    service = _get_service()

    data = get_json_body()
    state_raw = data.get("state")
    has_space_id = "spaceId" in data
    has_pinned = "pinned" in data

    if state_raw is None and not has_space_id and not has_pinned:
        raise ValidationError("Provide 'state', 'spaceId', and/or 'pinned' field in request body")

    # Phase 1: Validate all inputs before any writes
    new_state = None
    if state_raw is not None:
        try:
            new_state = ItemState.from_string(str(state_raw))
        except ValueError as e:
            raise ValidationError(str(e))

    update_space = False
    new_space_id = None
    if has_space_id:
        update_space = True
        new_space_id = _parse_optional_int_json_field(data, "spaceId")
        _validate_space_id(new_space_id)

    pinned = None
    if has_pinned:
        pinned_raw = data["pinned"]
        if not isinstance(pinned_raw, bool):
            raise ValidationError("Field 'pinned' must be a boolean")
        pinned = pinned_raw

    # Phase 2: Apply changes atomically
    item = service.update_item(
        item_id, new_state=new_state, new_space_id=new_space_id,
        update_space=update_space, pinned=pinned,
    )
    return jsonify(_present_item(service, item))
