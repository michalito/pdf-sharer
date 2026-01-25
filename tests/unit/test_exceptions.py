"""Unit tests for custom exceptions."""

import pytest

from app.exceptions import (
    AppError,
    AuthenticationError,
    AuthorizationError,
    FileOperationError,
    NotFoundError,
    ValidationError,
)


class TestAppError:
    """Tests for AppError base class."""

    def test_default_status_code(self):
        """Test default status code is 500."""
        error = AppError("Something went wrong")
        assert error.status_code == 500
        assert error.message == "Something went wrong"

    def test_custom_status_code(self):
        """Test custom status code."""
        error = AppError("Custom error", status_code=418)
        assert error.status_code == 418

    def test_str_representation(self):
        """Test string representation."""
        error = AppError("Test message")
        assert str(error) == "Test message"


class TestNotFoundError:
    """Tests for NotFoundError."""

    def test_default_message(self):
        """Test default message."""
        error = NotFoundError()
        assert error.message == "Resource not found"
        assert error.status_code == 404

    def test_custom_message(self):
        """Test custom message."""
        error = NotFoundError("PDF not found")
        assert error.message == "PDF not found"
        assert error.status_code == 404


class TestValidationError:
    """Tests for ValidationError."""

    def test_status_code(self):
        """Test status code is 400."""
        error = ValidationError("Invalid input")
        assert error.status_code == 400
        assert error.message == "Invalid input"


class TestFileOperationError:
    """Tests for FileOperationError."""

    def test_status_code(self):
        """Test status code is 500."""
        error = FileOperationError("Could not save file")
        assert error.status_code == 500
        assert error.message == "Could not save file"


class TestAuthenticationError:
    """Tests for AuthenticationError."""

    def test_default_message(self):
        """Test default message."""
        error = AuthenticationError()
        assert error.message == "Authentication failed"
        assert error.status_code == 401

    def test_custom_message(self):
        """Test custom message."""
        error = AuthenticationError("Invalid token")
        assert error.message == "Invalid token"
        assert error.status_code == 401


class TestAuthorizationError:
    """Tests for AuthorizationError."""

    def test_default_message(self):
        """Test default message."""
        error = AuthorizationError()
        assert error.message == "Access denied"
        assert error.status_code == 403

    def test_custom_message(self):
        """Test custom message."""
        error = AuthorizationError("Not allowed to delete")
        assert error.message == "Not allowed to delete"
        assert error.status_code == 403
