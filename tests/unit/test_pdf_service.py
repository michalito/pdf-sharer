"""Unit tests for PDF service."""

import io

import pytest
from werkzeug.datastructures import FileStorage

from app import db
from app.domain.models import PDF, PDFStatus
from app.domain.user import User
from app.exceptions import FileOperationError, NotFoundError, ValidationError
from app.repositories.pdf_repository import PDFRepository
from app.services.pdf_service import PDFService


class TestPDFService:
    """Tests for PDFService."""

    @pytest.fixture
    def service(self, app):
        """Create a service instance."""
        with app.app_context():
            return PDFService(PDFRepository())

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

    def test_get_all_pdfs(self, app, service, user, sample_pdf_bytes, temp_upload_dir):
        """Test getting all PDFs."""
        with app.app_context():
            # Create some PDFs
            for i in range(3):
                filename = f"test_{i}.pdf"
                file_path = temp_upload_dir / filename
                file_path.write_bytes(sample_pdf_bytes)

                pdf = PDF(
                    filename=filename,
                    original_filename=f"doc_{i}.pdf",
                    file_size=len(sample_pdf_bytes),
                    user_id=user.id,
                )
                db.session.add(pdf)
            db.session.commit()

            result = service.get_all_pdfs(user_id=user.id)

            assert result.total == 3
            assert len(result.items) == 3

    def test_get_pdf(self, app, service, user, sample_pdf_bytes, temp_upload_dir):
        """Test getting a single PDF."""
        with app.app_context():
            filename = "test.pdf"
            file_path = temp_upload_dir / filename
            file_path.write_bytes(sample_pdf_bytes)

            pdf = PDF(
                filename=filename,
                original_filename="document.pdf",
                file_size=len(sample_pdf_bytes),
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            found = service.get_pdf(pdf.id, user_id=user.id)

            assert found.id == pdf.id
            assert found.original_filename == "document.pdf"

    def test_get_pdf_not_found(self, app, service):
        """Test getting a non-existent PDF."""
        with app.app_context():
            with pytest.raises(NotFoundError):
                service.get_pdf(99999)

    def test_get_pdf_path(self, app, service, user, sample_pdf_bytes, temp_upload_dir):
        """Test getting the file path for a PDF."""
        with app.app_context():
            filename = "test.pdf"
            file_path = temp_upload_dir / filename
            file_path.write_bytes(sample_pdf_bytes)

            pdf = PDF(
                filename=filename,
                original_filename="document.pdf",
                file_size=len(sample_pdf_bytes),
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            path = service.get_pdf_path(pdf)

            assert path.exists()
            assert path.name == filename

    def test_get_pdf_path_file_not_found(self, app, service, user):
        """Test getting path for PDF with missing file."""
        with app.app_context():
            pdf = PDF(
                filename="nonexistent.pdf",
                original_filename="document.pdf",
                file_size=1024,
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            with pytest.raises(FileOperationError):
                service.get_pdf_path(pdf)

    def test_upload_pdf(self, app, service, user, sample_pdf_bytes):
        """Test uploading a PDF."""
        with app.app_context():
            file = FileStorage(
                stream=io.BytesIO(sample_pdf_bytes),
                filename="test_document.pdf",
                content_type="application/pdf",
            )

            pdf = service.upload_pdf(file, user_id=user.id)

            assert pdf.id is not None
            assert pdf.original_filename == "test_document.pdf"
            assert pdf.status == PDFStatus.UNPROCESSED.value
            assert pdf.user_id == user.id

    def test_upload_pdf_no_file(self, app, service, user):
        """Test upload with no file."""
        with app.app_context():
            file = FileStorage(stream=io.BytesIO(b""), filename="")

            with pytest.raises(ValidationError) as exc_info:
                service.upload_pdf(file, user_id=user.id)

            assert "No file provided" in str(exc_info.value)

    def test_upload_pdf_wrong_extension(self, app, service, user):
        """Test upload with wrong file extension."""
        with app.app_context():
            file = FileStorage(
                stream=io.BytesIO(b"content"),
                filename="document.txt",
                content_type="text/plain",
            )

            with pytest.raises(ValidationError) as exc_info:
                service.upload_pdf(file, user_id=user.id)

            assert "Only PDF files" in str(exc_info.value)

    def test_upload_pdf_invalid_magic_bytes(self, app, service, user):
        """Test upload with invalid PDF content (wrong magic bytes)."""
        with app.app_context():
            file = FileStorage(
                stream=io.BytesIO(b"This is not a PDF"),
                filename="fake.pdf",
                content_type="application/pdf",
            )

            with pytest.raises(ValidationError) as exc_info:
                service.upload_pdf(file, user_id=user.id)

            assert "content does not match PDF format" in str(exc_info.value)

    def test_update_status(self, app, service, user, sample_pdf_bytes, temp_upload_dir):
        """Test updating PDF status."""
        with app.app_context():
            filename = "test.pdf"
            file_path = temp_upload_dir / filename
            file_path.write_bytes(sample_pdf_bytes)

            pdf = PDF(
                filename=filename,
                original_filename="document.pdf",
                file_size=len(sample_pdf_bytes),
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()

            updated = service.update_status(pdf.id, PDFStatus.PROCESSED, user_id=user.id)

            assert updated.status == PDFStatus.PROCESSED.value

    def test_delete_pdf(self, app, service, user, sample_pdf_bytes, temp_upload_dir):
        """Test deleting a PDF."""
        with app.app_context():
            filename = "test_delete.pdf"
            file_path = temp_upload_dir / filename
            file_path.write_bytes(sample_pdf_bytes)

            pdf = PDF(
                filename=filename,
                original_filename="document.pdf",
                file_size=len(sample_pdf_bytes),
                user_id=user.id,
            )
            db.session.add(pdf)
            db.session.commit()
            pdf_id = pdf.id

            service.delete_pdf(pdf_id, user_id=user.id)

            # File should still exist (soft-delete doesn't remove files)
            assert file_path.exists()

            # PDF should not be accessible via normal get (filtered out)
            with pytest.raises(NotFoundError):
                service.get_pdf(pdf_id)

            # But PDF still exists in DB with deleted_at set
            pdf = db.session.get(PDF, pdf_id)
            assert pdf is not None
            assert pdf.is_deleted is True

    def test_delete_pdf_not_found(self, app, service):
        """Test deleting a non-existent PDF."""
        with app.app_context():
            with pytest.raises(NotFoundError):
                service.delete_pdf(99999)


class TestPDFServiceValidation:
    """Tests for PDF service validation methods."""

    @pytest.fixture
    def service(self):
        """Create a service instance."""
        return PDFService()

    def test_validate_pdf_magic_bytes_valid(self, service, sample_pdf_bytes):
        """Test validation passes for valid PDF."""
        file = FileStorage(
            stream=io.BytesIO(sample_pdf_bytes),
            filename="test.pdf",
            content_type="application/pdf",
        )

        # Should not raise
        service._validate_pdf_magic_bytes(file)

        # Stream should be reset
        assert file.stream.read(5) == b"%PDF-"

    def test_validate_pdf_magic_bytes_invalid(self, service):
        """Test validation fails for invalid PDF."""
        file = FileStorage(
            stream=io.BytesIO(b"Not a PDF file"),
            filename="test.pdf",
            content_type="application/pdf",
        )

        with pytest.raises(ValidationError):
            service._validate_pdf_magic_bytes(file)

    def test_generate_unique_filename(self, service):
        """Test unique filename generation."""
        filename1 = service._generate_unique_filename("document.pdf")
        filename2 = service._generate_unique_filename("document.pdf")

        assert filename1 != filename2
        assert filename1.endswith(".pdf")
        assert filename2.endswith(".pdf")
        assert "document" in filename1

    def test_generate_unique_filename_sanitizes(self, service):
        """Test that dangerous characters are removed."""
        filename = service._generate_unique_filename("../../../etc/passwd.pdf")

        assert "/" not in filename
        assert ".." not in filename
        assert filename.endswith(".pdf")

    def test_generate_unique_filename_empty(self, service):
        """Test handling of empty filename."""
        filename = service._generate_unique_filename("")

        assert filename.endswith(".pdf")
        assert "document" in filename
