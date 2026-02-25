"""Web routes for serving the frontend and public download links."""

from __future__ import annotations

import os

from flask import Response, current_app, g, render_template, send_file, send_from_directory

from app.exceptions import AppError
from app.services.item_service import ItemService
from app.web import web


def _get_service() -> ItemService:
    return g.item_service


@web.route("/")
def index() -> str:
    """Serve the React application (built during Docker production build)."""
    return render_template("index.html")


@web.route("/<path:filename>")
def serve_public(filename: str):
    """Serve public files (logo, etc.) at root path, falling back to SPA."""
    static_folder = current_app.static_folder
    file_path = os.path.join(static_folder, filename)
    if os.path.isfile(file_path):
        return send_from_directory(static_folder, filename)
    return render_template("index.html")


@web.route("/d/<int:item_id>")
def public_download(item_id: int) -> Response:
    """Public, stable download link for sharing inside the network."""
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
