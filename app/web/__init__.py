"""Web layer - HTML page serving."""

from flask import Blueprint

web = Blueprint("web", __name__)

from app.web import routes  # noqa: E402, F401
