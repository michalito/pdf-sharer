"""Unit tests for PDF repository."""

import pytest

from app import db
from app.domain.models import PDF, PDFStatus
from app.domain.user import User
from app.exceptions import NotFoundError
from app.repositories.pdf_repository import PDFRepository, PaginatedResult


class TestPaginatedResult:
    """Tests for PaginatedResult dataclass."""

    def test_create_paginated_result(self):
        """Test creating a paginated result."""
        result = PaginatedResult(
            items=[1, 2, 3],
            total=10,
            page=1,
            per_page=3,
            pages=4,
            has_next=True,
            has_prev=False,
        )

        assert result.items == [1, 2, 3]
        assert result.total == 10
        assert result.page == 1
        assert result.per_page == 3
        assert result.pages == 4
        assert result.has_next is True
        assert result.has_prev is False

    def test_to_dict(self):
        """Test to_dict method."""
        result = PaginatedResult(
            items=[],
            total=25,
            page=2,
            per_page=10,
            pages=3,
            has_next=True,
            has_prev=True,
        )

        data = result.to_dict()

        assert data["total"] == 25
        assert data["page"] == 2
        assert data["per_page"] == 10
        assert data["pages"] == 3
        assert data["has_next"] is True
        assert data["has_prev"] is True
        # items should not be in pagination dict
        assert "items" not in data


class TestPDFRepository:
    """Tests for PDFRepository."""

    @pytest.fixture
    def repository(self):
        """Create a repository instance."""
        return PDFRepository()

    @pytest.fixture
    def user(self, app):
        """Create a test user."""
        with app.app_context():
            user = User(username="testuser")
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()
            db.session.refresh(user)
            return user

    def test_create_pdf(self, app, repository, user):
        """Test creating a PDF record."""
        with app.app_context():
            pdf = repository.create(
                filename="test_12345678.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )

            assert pdf.id is not None
            assert pdf.filename == "test_12345678.pdf"
            assert pdf.original_filename == "test.pdf"
            assert pdf.status == PDFStatus.UNPROCESSED.value
            assert pdf.user_id == user.id

    def test_get_by_id(self, app, repository, user):
        """Test getting a PDF by ID."""
        with app.app_context():
            created = repository.create(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )

            found = repository.get_by_id(created.id)

            assert found is not None
            assert found.id == created.id

    def test_get_by_id_not_found(self, app, repository):
        """Test getting a non-existent PDF."""
        with app.app_context():
            found = repository.get_by_id(99999)
            assert found is None

    def test_get_by_id_with_user_filter(self, app, repository, user):
        """Test that user filter works correctly."""
        with app.app_context():
            # Create another user
            other_user = User(username="otheruser")
            other_user.set_password("password123")
            db.session.add(other_user)
            db.session.commit()

            # Create PDF owned by first user
            pdf = repository.create(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )

            # Should find when matching user_id
            assert repository.get_by_id(pdf.id, user_id=user.id) is not None

            # Should not find when different user_id
            assert repository.get_by_id(pdf.id, user_id=other_user.id) is None

    def test_get_by_id_or_raise(self, app, repository, user):
        """Test get_by_id_or_raise with existing PDF."""
        with app.app_context():
            created = repository.create(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )

            found = repository.get_by_id_or_raise(created.id)
            assert found.id == created.id

    def test_get_by_id_or_raise_not_found(self, app, repository):
        """Test get_by_id_or_raise with non-existent PDF."""
        with app.app_context():
            with pytest.raises(NotFoundError):
                repository.get_by_id_or_raise(99999)

    def test_get_all_pagination(self, app, repository, user):
        """Test paginated results."""
        with app.app_context():
            # Create 15 PDFs
            for i in range(15):
                repository.create(
                    filename=f"test_{i}.pdf",
                    original_filename=f"test_{i}.pdf",
                    file_size=1024,
                    user_id=user.id,
                )

            # Get first page
            result = repository.get_all(user_id=user.id, page=1, per_page=10)

            assert len(result.items) == 10
            assert result.total == 15
            assert result.page == 1
            assert result.pages == 2
            assert result.has_next is True
            assert result.has_prev is False

            # Get second page
            result = repository.get_all(user_id=user.id, page=2, per_page=10)

            assert len(result.items) == 5
            assert result.has_next is False
            assert result.has_prev is True

    def test_get_all_status_filter(self, app, repository, user):
        """Test filtering by status."""
        with app.app_context():
            # Create PDFs with different statuses
            repository.create(
                filename="unprocessed.pdf",
                original_filename="unprocessed.pdf",
                file_size=1024,
                status=PDFStatus.UNPROCESSED,
                user_id=user.id,
            )
            repository.create(
                filename="processed.pdf",
                original_filename="processed.pdf",
                file_size=1024,
                status=PDFStatus.PROCESSED,
                user_id=user.id,
            )

            unprocessed = repository.get_all(
                status=PDFStatus.UNPROCESSED, user_id=user.id
            )
            processed = repository.get_all(
                status=PDFStatus.PROCESSED, user_id=user.id
            )

            assert unprocessed.total == 1
            assert processed.total == 1

    def test_get_all_max_per_page(self, app, repository, user):
        """Test that per_page is capped at MAX_PER_PAGE."""
        with app.app_context():
            result = repository.get_all(user_id=user.id, per_page=1000)
            assert result.per_page == PDFRepository.MAX_PER_PAGE

    def test_update_status(self, app, repository, user):
        """Test updating PDF status."""
        with app.app_context():
            pdf = repository.create(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )

            updated = repository.update_status(pdf, PDFStatus.PROCESSED)

            assert updated.status == PDFStatus.PROCESSED.value

    def test_delete(self, app, repository, user):
        """Test deleting a PDF record."""
        with app.app_context():
            pdf = repository.create(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=1024,
                user_id=user.id,
            )
            pdf_id = pdf.id

            repository.delete(pdf)

            assert repository.get_by_id(pdf_id) is None
