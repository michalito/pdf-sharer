"""API layer - HTTP endpoints."""

from werkzeug.exceptions import BadRequest
from flask import Blueprint, request

from app.exceptions import InvalidJSONError, ValidationError

api = Blueprint("api", __name__, url_prefix="/api")


def get_json_body() -> dict:
    """Parse and validate the request body as a JSON object."""
    if not request.is_json:
        raise ValidationError("Request body must be a JSON object")
    try:
        data = request.get_json(silent=False)
    except BadRequest as exc:
        raise InvalidJSONError() from exc
    if not isinstance(data, dict):
        raise ValidationError("Request body must be a JSON object")
    return data


from app.api import routes  # noqa: E402, F401
from app.api import space_routes  # noqa: E402, F401
