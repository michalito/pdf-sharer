"""Authentication route definitions."""

import logging

from flask import g, jsonify, request, Response
from flask_login import current_user, login_required, login_user, logout_user

from app import limiter
from app.auth import auth
from app.error_handlers import register_error_handlers
from app.exceptions import AuthenticationError, ValidationError
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService


logger = logging.getLogger(__name__)

# Register all error handlers for this blueprint
register_error_handlers(auth)


def _get_auth_service() -> AuthService:
    """Get the auth service from the request context."""
    return g.auth_service


def _get_audit_service() -> AuditService:
    """Get the audit service from the request context."""
    return g.audit_service


@auth.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login() -> Response:
    """
    Authenticate a user.

    Request Body:
        JSON with 'username' and 'password' fields

    Returns:
        User object on success
    """
    service = _get_auth_service()
    audit = _get_audit_service()

    data = request.get_json()
    if not data:
        raise ValidationError("Request body is required")

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        raise AuthenticationError("Username and password are required")

    try:
        user = service.authenticate(username, password)
        login_user(user)
        audit.log_login_success(user.id)
        return jsonify(user.to_dict())
    except AuthenticationError:
        audit.log_login_failure(username)
        raise


@auth.route("/logout", methods=["POST"])
@login_required
def logout() -> Response:
    """
    Log out the current user.

    Returns:
        Success message
    """
    audit = _get_audit_service()
    user_id = current_user.id

    logout_user()
    audit.log_logout(user_id)

    return jsonify({"message": "Logged out successfully"})


@auth.route("/me", methods=["GET"])
@login_required
def me() -> Response:
    """
    Get the current authenticated user.

    Returns:
        Current user object
    """
    return jsonify(current_user.to_dict())
