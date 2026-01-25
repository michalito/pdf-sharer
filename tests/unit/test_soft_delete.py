"""Unit tests for soft-delete functionality."""

from datetime import datetime, timedelta, timezone

import pytest

from app import db
from app.domain.models import PDF, PDFStatus
from app.repositories.pdf_repository import PDFRepository
from app.services.pdf_service import PDFService


class TestPDFModelSoftDelete:
    """Tests for PDF model soft-delete methods."""

    def test_is_deleted_property(self, app):
        """Test is_deleted property."""
        with app.app_context():
            pdf = PDF(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=100,
            )

            assert pdf.is_deleted is False

            pdf.deleted_at = datetime.now(timezone.utc)
            assert pdf.is_deleted is True

    def test_soft_delete_method(self, app):
        """Test soft_delete method sets deleted_at."""
        with app.app_context():
            pdf = PDF(
                filename="test.pdf",
                original_filename="test.pdf",
                file_size=100,
            )

            assert pdf.deleted_at is None

            pdf.soft_delete()

            assert pdf.deleted_at is not None
            assert pdf.is_deleted is True


class TestPDFRepositorySoftDelete:
    """Tests for PDFRepository soft-delete methods."""

    @pytest.fixture
    def repo(self):
        """Create a PDF repository."""
        return PDFRepository()

    def test_get_all_excludes_deleted_by_default(
        self, app, repo, sample_pdf_bytes, temp_upload_dir, test_user
    ):
        """Test that get_all excludes soft-deleted PDFs by default."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            # Create two PDFs
            pdf1 = PDF(
                filename="active.pdf",
                original_filename="active.pdf",
                file_size=100,
                user_id=user.id,
            )
            pdf2 = PDF(
                filename="deleted.pdf",
                original_filename="deleted.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc),
            )
            db.session.add_all([pdf1, pdf2])
            db.session.commit()

            # Default query should exclude deleted
            result = repo.get_all(user_id=user.id)
            assert len(result.items) == 1
            assert result.items[0].filename == "active.pdf"

    def test_get_all_includes_deleted_when_requested(
        self, app, repo, test_user
    ):
        """Test that get_all includes soft-deleted PDFs when include_deleted=True."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            pdf1 = PDF(
                filename="active2.pdf",
                original_filename="active2.pdf",
                file_size=100,
                user_id=user.id,
            )
            pdf2 = PDF(
                filename="deleted2.pdf",
                original_filename="deleted2.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc),
            )
            db.session.add_all([pdf1, pdf2])
            db.session.commit()

            # With include_deleted=True, should include both
            result = repo.get_all(user_id=user.id, include_deleted=True)
            filenames = [p.filename for p in result.items]
            assert "active2.pdf" in filenames
            assert "deleted2.pdf" in filenames

    def test_get_by_id_excludes_deleted_by_default(self, app, repo, test_user):
        """Test that get_by_id excludes soft-deleted PDFs by default."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            pdf = PDF(
                filename="deleted_by_id.pdf",
                original_filename="deleted_by_id.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc),
            )
            db.session.add(pdf)
            db.session.commit()

            # Should not find deleted PDF
            result = repo.get_by_id(pdf.id, user_id=user.id)
            assert result is None

    def test_get_by_id_includes_deleted_when_requested(self, app, repo, test_user):
        """Test that get_by_id includes soft-deleted PDFs when requested."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            pdf = PDF(
                filename="deleted_by_id2.pdf",
                original_filename="deleted_by_id2.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc),
            )
            db.session.add(pdf)
            db.session.commit()

            # With include_deleted=True, should find it
            result = repo.get_by_id(pdf.id, user_id=user.id, include_deleted=True)
            assert result is not None
            assert result.filename == "deleted_by_id2.pdf"

    def test_soft_delete_method(self, app, repo, test_user):
        """Test soft_delete repository method."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            pdf = PDF(
                filename="to_soft_delete.pdf",
                original_filename="to_soft_delete.pdf",
                file_size=100,
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            assert pdf.deleted_at is None

            repo.soft_delete(pdf)

            assert pdf.deleted_at is not None
            assert pdf.is_deleted is True

    def test_restore_method(self, app, repo, test_user):
        """Test restore repository method."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            pdf = PDF(
                filename="to_restore.pdf",
                original_filename="to_restore.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc),
            )
            db.session.add(pdf)
            db.session.commit()

            assert pdf.is_deleted is True

            repo.restore(pdf)

            assert pdf.deleted_at is None
            assert pdf.is_deleted is False

    def test_get_deleted_pdfs(self, app, repo, test_user):
        """Test get_deleted_pdfs method."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            # Create old deleted PDF and new deleted PDF
            old_pdf = PDF(
                filename="old_deleted.pdf",
                original_filename="old_deleted.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
            new_pdf = PDF(
                filename="new_deleted.pdf",
                original_filename="new_deleted.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
            active_pdf = PDF(
                filename="still_active.pdf",
                original_filename="still_active.pdf",
                file_size=100,
                user_id=user.id,
            )
            db.session.add_all([old_pdf, new_pdf, active_pdf])
            db.session.commit()

            # Get all deleted PDFs
            all_deleted = repo.get_deleted_pdfs(user_id=user.id)
            assert len(all_deleted) == 2

            # Get only old deleted PDFs (>7 days)
            old_deleted = repo.get_deleted_pdfs(user_id=user.id, older_than_days=7)
            assert len(old_deleted) == 1
            assert old_deleted[0].filename == "old_deleted.pdf"


class TestPDFServiceSoftDelete:
    """Tests for PDFService soft-delete behavior."""

    def test_delete_pdf_uses_soft_delete(self, app, sample_pdf, test_user):
        """Test that delete_pdf performs soft-delete."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            service = PDFService()
            pdf_id = sample_pdf.id

            service.delete_pdf(pdf_id, user_id=user.id)

            # PDF should still exist but be marked as deleted
            pdf = db.session.get(PDF, pdf_id)
            assert pdf is not None
            assert pdf.is_deleted is True

    def test_restore_pdf(self, app, test_user):
        """Test restore_pdf method."""
        with app.app_context():
            from app.domain.user import User
            user = db.session.get(User, test_user.id)

            # Create a deleted PDF
            pdf = PDF(
                filename="to_restore_svc.pdf",
                original_filename="to_restore_svc.pdf",
                file_size=100,
                user_id=user.id,
                deleted_at=datetime.now(timezone.utc),
            )
            db.session.add(pdf)
            db.session.commit()

            service = PDFService()
            restored = service.restore_pdf(pdf.id, user_id=user.id)

            assert restored.is_deleted is False
            assert restored.deleted_at is None
