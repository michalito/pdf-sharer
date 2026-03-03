"""Web routes for serving the frontend and public share links."""

from __future__ import annotations

import os

from flask import (
    Response,
    current_app,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    send_from_directory,
    url_for,
)

from app.domain.item import ItemKind
from app.exceptions import AppError, ValidationError
from app.services.item_access import is_item_unlocked, mark_item_unlocked
from app.services.item_service import ItemService
from app.services.unlock_throttle import UnlockThrottle
from app.utils.markdown import render_markdown
from app.web import web


def _get_service() -> ItemService:
    return g.item_service


def _get_throttle() -> UnlockThrottle:
    return current_app.config["UNLOCK_THROTTLE"]


def _get_client_ip() -> str:
    return request.remote_addr or "unknown"


@web.route("/")
def index() -> str:
    """Serve the React application (built during Docker production build)."""
    return render_template("index.html")


@web.route("/<path:filename>")
def serve_public(filename: str):
    """Serve public files (logo, etc.) at root path, falling back to SPA."""
    if filename == "api" or filename.startswith("api/"):
        return jsonify({"error": "Not found"}), 404

    static_folder = current_app.static_folder
    file_path = os.path.join(static_folder, filename)
    if os.path.isfile(file_path):
        return send_from_directory(static_folder, filename)
    return render_template("index.html")


@web.route("/d/<int:item_id>")
def public_download(item_id: int) -> Response:
    """Public, stable share link for sharing inside the network."""
    service = _get_service()
    item = service.get_item(item_id)

    if service.item_requires_password(item) and not is_item_unlocked(item.id):
        return _render_password_prompt(item)

    return _serve_public_item(service, item)


@web.route("/d/<int:item_id>", methods=["POST"])
def unlock_public_item(item_id: int) -> Response:
    """Unlock a protected public item for the current browser session."""
    service = _get_service()
    item = service.get_item(item_id)

    if not service.item_requires_password(item):
        return redirect(url_for("web.public_download", item_id=item_id), code=302)

    throttle = _get_throttle()
    client_ip = _get_client_ip()
    allowed, retry_after = throttle.check(client_ip, item.id)
    if not allowed:
        return _render_password_prompt(
            item,
            error_message=f"Too many attempts. Please wait {int(retry_after)} seconds before trying again.",
            status_code=429,
        )

    password = request.form.get("password")
    try:
        is_valid = service.verify_item_password(item, password)
    except ValidationError:
        is_valid = False

    if not is_valid:
        throttle.record_failure(client_ip, item.id)
        return _render_password_prompt(
            item,
            error_message="Invalid password. Please try again.",
            status_code=401,
        )

    throttle.record_success(client_ip, item.id)
    mark_item_unlocked(item.id)
    return redirect(url_for("web.public_download", item_id=item_id), code=302)


def _render_password_prompt(
    item,
    *,
    error_message: str | None = None,
    status_code: int = 200,
) -> tuple[str, int]:
    return (
        render_template(
            "password_prompt.html",
            item_id=item.id,
            item_name=item.display_name,
            item_kind=item.kind,
            error_message=error_message,
        ),
        status_code,
    )


def _serve_public_item(service: ItemService, item) -> Response:
    if item.kind in {ItemKind.FILE.value, ItemKind.FOLDER.value}:
        file_path = service.get_item_path(item)
        download_name = service.get_download_name(item)

        return send_file(
            file_path,
            as_attachment=True,
            download_name=download_name,
            mimetype=item.mime_type or None,
        )

    if item.kind == ItemKind.LINK.value:
        return redirect(service.get_link_url(item), code=302)

    if item.kind == ItemKind.NOTE.value:
        raw_text = service.get_note_text(item)
        return render_template(
            "note.html",
            note_title=item.display_name,
            note_html=render_markdown(raw_text),
            created_at=item.created_at,
            item_id=item.id,
        )

    return render_template(
        "error.html",
        error_code=400,
        error_message=f"Unsupported item kind '{item.kind}'",
    ), 400


@web.errorhandler(AppError)
def handle_app_error(error: AppError):
    """Handle application errors."""
    return (
        render_template(
            "error.html",
            error_code=error.status_code,
            error_message=error.message,
        ),
        error.status_code,
    )


@web.errorhandler(404)
def handle_not_found(error):
    """Handle 404 errors."""
    return (
        render_template(
            "error.html",
            error_code=404,
            error_message="The page you're looking for doesn't exist.",
        ),
        404,
    )


@web.errorhandler(500)
def handle_server_error(error):
    """Handle 500 errors."""
    return (
        render_template(
            "error.html",
            error_code=500,
            error_message="Something went wrong on our end. Please try again later.",
        ),
        500,
    )
