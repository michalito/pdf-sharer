"""Unit tests for domain models."""

import pytest
from datetime import datetime, timezone

from app import db
from app.domain.models import PDF, PDFStatus
from app.domain.user import User


class TestPDFStatus:
    """Tests for PDFStatus enum."""

    def test_values(self):
        """Test that enum has expected values."""
        assert PDFStatus.UNPROCESSED.value == "unprocessed"
        assert PDFStatus.PROCESSED.value == "processed"

    def test_from_string_valid(self):
        """Test parsing valid status strings."""
        assert PDFStatus.from_string("unprocessed") == PDFStatus.UNPROCESSED
        assert PDFStatus.from_string("processed") == PDFStatus.PROCESSED

    def test_from_string_case_insensitive(self):
        """Test that parsing is case-insensitive."""
        assert PDFStatus.from_string("UNPROCESSED") == PDFStatus.UNPROCESSED
        assert PDFStatus.from_string("Processed") == PDFStatus.PROCESSED

    def test_from_string_invalid(self):
        """Test that invalid status raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            PDFStatus.from_string("invalid")
        assert "Invalid status" in str(exc_info.value)


class TestPDFModel:
    """Tests for PDF model."""

    def test_create_pdf(self, app):
        """Test creating a PDF record."""
        with app.app_context():
            # Create a user first
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

            pdf = PDF(
                filename="test_12345678.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            assert pdf.id is not None
            assert pdf.filename == "test_12345678.pdf"
            assert pdf.original_filename == "test.pdf"
            assert pdf.status == PDFStatus.UNPROCESSED.value
            assert pdf.file_size == 1024
            assert pdf.upload_date is not None
            assert pdf.user_id == user.id

    def test_status_enum_property(self, app):
        """Test status_enum property."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

            pdf = PDF(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=1024,
                status=PDFStatus.UNPROCESSED.value,
                user_id=user.id,
            )
            assert pdf.status_enum == PDFStatus.UNPROCESSED

    def test_set_status(self, app):
        """Test set_status method."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

            pdf = PDF(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )
            pdf.set_status(PDFStatus.PROCESSED)
            assert pdf.status == PDFStatus.PROCESSED.value

    def test_to_dict(self, app):
        """Test to_dict serialization."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

            pdf = PDF(
                filename="stored_12345678.pdf",
                original_filename="original.pdf",
                file_size=2048,
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            data = pdf.to_dict()

            assert data["id"] == pdf.id
            assert data["filename"] == "original.pdf"  # Should use original_filename
            assert data["status"] == "unprocessed"
            assert data["fileSize"] == 2048
            assert "uploadDate" in data

    def test_repr(self, app):
        """Test __repr__ method."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

            pdf = PDF(
                filename="test.pdf",
                original_filename="my_document.pdf",
                file_size=1024,
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            repr_str = repr(pdf)
            assert "PDF" in repr_str
            assert "my_document.pdf" in repr_str


class TestUserModel:
    """Tests for User model."""

    def test_create_user(self, app):
        """Test creating a user."""
        with app.app_context():
            user = User(username="newuser")
            user.set_password("securepassword123")
            db.session.add(user)
            db.session.commit()

            assert user.id is not None
            assert user.username == "newuser"
            assert user.password_hash != "securepassword123"
            assert user.created_at is not None

    def test_password_hashing(self, app):
        """Test password hashing and verification."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("mypassword")

            assert user.check_password("mypassword") is True
            assert user.check_password("wrongpassword") is False

    def test_to_dict(self, app):
        """Test to_dict serialization (without sensitive data)."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

            data = user.to_dict()

            assert data["id"] == user.id
            assert data["username"] == "testuser"
            assert "createdAt" in data
            assert "password" not in data
            assert "password_hash" not in data

    def test_repr(self, app):
        """Test __repr__ method."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

            repr_str = repr(user)
            assert "User" in repr_str
            assert "testuser" in repr_str
