"""Unit tests for error handlers module."""

import json
import pytest
from unittest.mock import MagicMock

from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError

from app.error_handlers import (
    _create_error_response,
    handle_app_error,
    handle_integrity_error,
    handle_json_decode_error,
    handle_operational_error,
    handle_sqlalchemy_error,
    handle_os_error,
    handle_permission_error,
    handle_file_not_found_error,
    handle_memory_error,
    handle_type_error,
    handle_attribute_error,
    handle_generic_error,
)
from app.exceptions import (
    AppError,
    NotFoundError,
    ValidationError,
    FileOperationError,
    AuthenticationError,
    AuthorizationError,
)


class TestCreateErrorResponse:
    """Tests for _create_error_response helper."""

    def test_basic_error_response(self, app):
        """Test creating a basic error response."""
        with app.app_context():
            response, status_code = _create_error_response("Test error", 400)

            assert status_code == 400
            data = response.get_json()
            assert data["error"] == "Test error"
            assert "code" not in data

    def test_error_response_with_code(self, app):
        """Test creating an error response with error code."""
        with app.app_context():
            response, status_code = _create_error_response(
                "Test error", 500, "INTERNAL_ERROR"
            )

            assert status_code == 500
            data = response.get_json()
            assert data["error"] == "Test error"
            assert data["code"] == "INTERNAL_ERROR"


class TestAppErrorHandler:
    """Tests for AppError handler."""

    def test_handles_not_found_error(self, app):
        """Test handling NotFoundError."""
        with app.app_context():
            error = NotFoundError("PDF not found")
            response, status_code = handle_app_error(error)

            assert status_code == 404
            data = response.get_json()
            assert data["error"] == "PDF not found"

    def test_handles_validation_error(self, app):
        """Test handling ValidationError."""
        with app.app_context():
            error = ValidationError("Invalid file type")
            response, status_code = handle_app_error(error)

            assert status_code == 400
            data = response.get_json()
            assert data["error"] == "Invalid file type"

    def test_handles_file_operation_error(self, app):
        """Test handling FileOperationError."""
        with app.app_context():
            error = FileOperationError("Cannot save file")
            response, status_code = handle_app_error(error)

            assert status_code == 500
            data = response.get_json()
            assert data["error"] == "Cannot save file"

    def test_handles_authentication_error(self, app):
        """Test handling AuthenticationError."""
        with app.app_context():
            error = AuthenticationError("Invalid credentials")
            response, status_code = handle_app_error(error)

            assert status_code == 401
            data = response.get_json()
            assert data["error"] == "Invalid credentials"

    def test_handles_authorization_error(self, app):
        """Test handling AuthorizationError."""
        with app.app_context():
            error = AuthorizationError("Access denied")
            response, status_code = handle_app_error(error)

            assert status_code == 403
            data = response.get_json()
            assert data["error"] == "Access denied"


class TestDatabaseErrorHandlers:
    """Tests for database error handlers."""

    def test_operational_error_returns_503(self, app):
        """Test that OperationalError returns 503."""
        with app.app_context():
            error = OperationalError("statement", {}, Exception("connection refused"))
            response, status_code = handle_operational_error(error)

            assert status_code == 503
            data = response.get_json()
            assert "unavailable" in data["error"].lower()
            assert data["code"] == "DATABASE_UNAVAILABLE"

    def test_integrity_error_unique_constraint(self, app):
        """Test IntegrityError with unique constraint."""
        with app.app_context():
            orig = Exception("UNIQUE constraint failed")
            error = IntegrityError("statement", {}, orig)
            response, status_code = handle_integrity_error(error)

            assert status_code == 409
            data = response.get_json()
            assert "already exists" in data["error"].lower()
            assert data["code"] == "CONFLICT"

    def test_integrity_error_foreign_key_constraint(self, app):
        """Test IntegrityError with foreign key constraint."""
        with app.app_context():
            orig = Exception("FOREIGN KEY constraint failed")
            error = IntegrityError("statement", {}, orig)
            response, status_code = handle_integrity_error(error)

            assert status_code == 409
            data = response.get_json()
            assert "does not exist" in data["error"].lower()

    def test_integrity_error_not_null_constraint(self, app):
        """Test IntegrityError with NOT NULL constraint."""
        with app.app_context():
            orig = Exception("NOT NULL constraint failed")
            error = IntegrityError("statement", {}, orig)
            response, status_code = handle_integrity_error(error)

            assert status_code == 409
            data = response.get_json()
            assert "required" in data["error"].lower() or "missing" in data["error"].lower()

    def test_integrity_error_generic(self, app):
        """Test IntegrityError with unknown constraint type."""
        with app.app_context():
            orig = Exception("some other constraint")
            error = IntegrityError("statement", {}, orig)
            response, status_code = handle_integrity_error(error)

            assert status_code == 409
            data = response.get_json()
            assert "conflict" in data["error"].lower()

    def test_sqlalchemy_error_returns_500(self, app):
        """Test that generic SQLAlchemyError returns 500."""
        with app.app_context():
            error = SQLAlchemyError("database error")
            response, status_code = handle_sqlalchemy_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "database error" in data["error"].lower()
            assert data["code"] == "DATABASE_ERROR"


class TestRequestParsingErrorHandlers:
    """Tests for request parsing error handlers."""

    def test_json_decode_error(self, app):
        """Test handling JSONDecodeError."""
        with app.app_context():
            try:
                json.loads("{invalid json}")
            except json.JSONDecodeError as error:
                response, status_code = handle_json_decode_error(error)

                assert status_code == 400
                data = response.get_json()
                assert "json" in data["error"].lower()
                assert data["code"] == "INVALID_JSON"


class TestFilesystemErrorHandlers:
    """Tests for filesystem error handlers."""

    def test_permission_error_returns_500(self, app):
        """Test that PermissionError returns 500."""
        with app.app_context():
            error = PermissionError("Permission denied: /path/to/file")
            response, status_code = handle_permission_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "not permitted" in data["error"].lower()
            assert data["code"] == "PERMISSION_ERROR"

    def test_file_not_found_error_returns_500(self, app):
        """Test that FileNotFoundError returns 500 (data inconsistency)."""
        with app.app_context():
            error = FileNotFoundError("File not found: /path/to/file")
            response, status_code = handle_file_not_found_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "not found" in data["error"].lower()
            assert data["code"] == "FILE_NOT_FOUND"

    def test_os_error_returns_500(self, app):
        """Test that generic OSError returns 500."""
        with app.app_context():
            error = OSError("Disk full")
            response, status_code = handle_os_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "file operation" in data["error"].lower()
            assert data["code"] == "FILE_OPERATION_ERROR"


class TestResourceErrorHandlers:
    """Tests for resource error handlers."""

    def test_memory_error_returns_503(self, app):
        """Test that MemoryError returns 503."""
        with app.app_context():
            error = MemoryError("out of memory")
            response, status_code = handle_memory_error(error)

            assert status_code == 503
            data = response.get_json()
            assert "exhausted" in data["error"].lower()
            assert data["code"] == "RESOURCE_EXHAUSTED"


class TestProgrammingErrorHandlers:
    """Tests for programming error handlers (bugs)."""

    def test_type_error_returns_500(self, app):
        """Test that TypeError returns 500."""
        with app.app_context():
            error = TypeError("unsupported operand type")
            response, status_code = handle_type_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "unexpected error" in data["error"].lower()
            assert data["code"] == "INTERNAL_ERROR"

    def test_attribute_error_returns_500(self, app):
        """Test that AttributeError returns 500."""
        with app.app_context():
            error = AttributeError("'NoneType' has no attribute 'foo'")
            response, status_code = handle_attribute_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "unexpected error" in data["error"].lower()
            assert data["code"] == "INTERNAL_ERROR"


class TestGenericErrorHandler:
    """Tests for generic catch-all error handler."""

    def test_unknown_exception_returns_500(self, app):
        """Test that unknown exceptions return 500."""
        with app.app_context():
            error = RuntimeError("something unexpected")
            response, status_code = handle_generic_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "unexpected error" in data["error"].lower()
            assert data["code"] == "INTERNAL_ERROR"

    def test_custom_exception_returns_500(self, app):
        """Test that custom unhandled exceptions return 500."""
        with app.app_context():

            class CustomError(Exception):
                pass

            error = CustomError("custom error")
            response, status_code = handle_generic_error(error)

            assert status_code == 500
            data = response.get_json()
            assert "unexpected error" in data["error"].lower()
