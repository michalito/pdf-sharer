"""API layer - HTTP endpoints."""

from flask import Blueprint

api = Blueprint("api", __name__, url_prefix="/api")

from app.api import routes  # noqa: E402, F401
