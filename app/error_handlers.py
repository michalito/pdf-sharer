"""Centralized error handlers for Flask blueprints.

This module provides specific error handlers for known exception types,
ensuring proper HTTP status codes, meaningful error messages, and
appropriate logging levels.

Handler registration order matters - more specific exceptions must be
registered before more general ones.
"""

import json
import logging
from functools import wraps
from typing import Callable

from flask import Blueprint, Response, jsonify
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError

from app.exceptions import AppError


logger = logging.getLogger(__name__)


def _create_error_response(
    message: str,
    status_code: int,
    error_code: str | None = None,
) -> tuple[Response, int]:
    """Create a standardized error response.

    Args:
        message: User-facing error message
        status_code: HTTP status code
        error_code: Optional machine-readable error code

    Returns:
        Tuple of (JSON response, status code)
    """
    response = {"error": message}
    if error_code:
        response["code"] = error_code
    return jsonify(response), status_code


def handle_app_error(error: AppError) -> tuple[Response, int]:
    """Handle application-defined errors.

    These are expected errors with proper status codes and messages.
    """
    logger.warning(f"Application error: {error.message}")
    return _create_error_response(error.message, error.status_code)


def handle_value_error(error: ValueError) -> tuple[Response, int]:
    """Handle value errors as validation errors."""
    logger.warning(f"Value error: {error}")
    return _create_error_response(str(error), 400, "VALIDATION_ERROR")


def handle_bad_request(error) -> tuple[Response, int]:
    """Handle HTTP 400 bad request errors."""
    logger.warning(f"Bad request: {error}")
    return _create_error_response("Invalid request", 400, "BAD_REQUEST")


# Database error handlers

def handle_operational_error(error: OperationalError) -> tuple[Response, int]:
    """Handle database connection/availability errors.

    OperationalError typically indicates:
    - Database server is down
    - Connection pool exhausted
    - Network issues
    - Query timeout
    """
    logger.error(f"Database operational error: {error}", exc_info=True)
    return _create_error_response(
        "Database temporarily unavailable. Please try again later.",
        503,
        "DATABASE_UNAVAILABLE",
    )


def handle_integrity_error(error: IntegrityError) -> tuple[Response, int]:
    """Handle database constraint violations.

    IntegrityError typically indicates:
    - Unique constraint violation (duplicate entry)
    - Foreign key constraint violation
    - NOT NULL constraint violation
    - Check constraint violation
    """
    logger.warning(f"Database integrity error: {error}")

    # Try to provide a more specific message based on the error
    error_str = str(error.orig) if error.orig else str(error)

    if "UNIQUE constraint" in error_str or "duplicate key" in error_str.lower():
        message = "A record with this value already exists"
    elif "FOREIGN KEY constraint" in error_str or "foreign key" in error_str.lower():
        message = "Referenced record does not exist"
    elif "NOT NULL constraint" in error_str or "not null" in error_str.lower():
        message = "Required field is missing"
    else:
        message = "Operation conflicts with existing data"

    return _create_error_response(message, 409, "CONFLICT")


def handle_sqlalchemy_error(error: SQLAlchemyError) -> tuple[Response, int]:
    """Handle other SQLAlchemy database errors.

    This catches any SQLAlchemy error not handled by more specific handlers.
    """
    logger.error(f"Database error: {error}", exc_info=True)
    return _create_error_response(
        "A database error occurred",
        500,
        "DATABASE_ERROR",
    )


# Request parsing error handlers

def handle_json_decode_error(error: json.JSONDecodeError) -> tuple[Response, int]:
    """Handle malformed JSON in request body."""
    logger.warning(f"JSON decode error at position {error.pos}: {error.msg}")
    return _create_error_response(
        "Invalid JSON in request body",
        400,
        "INVALID_JSON",
    )


def handle_unicode_decode_error(error: UnicodeDecodeError) -> tuple[Response, int]:
    """Handle invalid unicode in request."""
    logger.warning(f"Unicode decode error: {error}")
    return _create_error_response(
        "Invalid character encoding in request",
        400,
        "INVALID_ENCODING",
    )


# Filesystem error handlers

def handle_permission_error(error: PermissionError) -> tuple[Response, int]:
    """Handle file permission errors.

    This typically indicates a server configuration issue.
    """
    logger.error(f"Permission error: {error}", exc_info=True)
    return _create_error_response(
        "File operation not permitted",
        500,
        "PERMISSION_ERROR",
    )


def handle_file_not_found_error(error: FileNotFoundError) -> tuple[Response, int]:
    """Handle missing file errors.

    When a database record exists but the file is missing, this indicates
    a data inconsistency that should be investigated.
    """
    logger.error(f"File not found: {error}", exc_info=True)
    return _create_error_response(
        "Requested file not found on server",
        500,
        "FILE_NOT_FOUND",
    )


def handle_os_error(error: OSError) -> tuple[Response, int]:
    """Handle other operating system errors.

    This catches filesystem errors not handled by more specific handlers.
    Includes: disk full, too many open files, I/O errors, etc.
    """
    logger.error(f"OS error: {error}", exc_info=True)
    return _create_error_response(
        "A file operation failed",
        500,
        "FILE_OPERATION_ERROR",
    )


# Resource error handlers

def handle_memory_error(error: MemoryError) -> tuple[Response, int]:
    """Handle memory exhaustion errors."""
    logger.critical(f"Memory error: {error}", exc_info=True)
    return _create_error_response(
        "Server resources exhausted. Please try again later.",
        503,
        "RESOURCE_EXHAUSTED",
    )


# Programming error handlers (should not happen in production)

def handle_type_error(error: TypeError) -> tuple[Response, int]:
    """Handle type errors.

    In production, this typically indicates a programming bug.
    """
    logger.error(f"Type error (possible bug): {error}", exc_info=True)
    return _create_error_response(
        "An unexpected error occurred",
        500,
        "INTERNAL_ERROR",
    )


def handle_attribute_error(error: AttributeError) -> tuple[Response, int]:
    """Handle attribute errors.

    In production, this typically indicates a programming bug.
    """
    logger.error(f"Attribute error (possible bug): {error}", exc_info=True)
    return _create_error_response(
        "An unexpected error occurred",
        500,
        "INTERNAL_ERROR",
    )


# Catch-all handler (must be registered last)

def handle_generic_error(error: Exception) -> tuple[Response, int]:
    """Handle any unhandled exceptions.

    This is the last resort handler. If we reach here, it means we haven't
    anticipated this error type. Log extensively for investigation.
    """
    logger.exception(f"Unhandled exception ({type(error).__name__}): {error}")
    return _create_error_response(
        "An unexpected error occurred",
        500,
        "INTERNAL_ERROR",
    )


def register_error_handlers(blueprint: Blueprint) -> None:
    """Register all error handlers on a blueprint.

    Handlers are registered in order from most specific to most general.
    This ensures that specific exception types are caught before their
    parent classes.

    Args:
        blueprint: The Flask blueprint to register handlers on
    """
    # Application errors (most specific - our own exceptions)
    blueprint.register_error_handler(AppError, handle_app_error)
    blueprint.register_error_handler(ValueError, handle_value_error)
    blueprint.register_error_handler(400, handle_bad_request)

    # Database errors (specific to general)
    blueprint.register_error_handler(OperationalError, handle_operational_error)
    blueprint.register_error_handler(IntegrityError, handle_integrity_error)
    blueprint.register_error_handler(SQLAlchemyError, handle_sqlalchemy_error)

    # Request parsing errors
    blueprint.register_error_handler(json.JSONDecodeError, handle_json_decode_error)
    blueprint.register_error_handler(UnicodeDecodeError, handle_unicode_decode_error)

    # Filesystem errors (specific to general)
    blueprint.register_error_handler(PermissionError, handle_permission_error)
    blueprint.register_error_handler(FileNotFoundError, handle_file_not_found_error)
    blueprint.register_error_handler(OSError, handle_os_error)

    # Resource errors
    blueprint.register_error_handler(MemoryError, handle_memory_error)

    # Programming errors (should be caught during development)
    blueprint.register_error_handler(TypeError, handle_type_error)
    blueprint.register_error_handler(AttributeError, handle_attribute_error)

    # Generic catch-all (must be last)
    blueprint.register_error_handler(Exception, handle_generic_error)
