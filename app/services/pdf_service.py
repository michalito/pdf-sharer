"""PDF service for business logic operations."""

import logging
import uuid
from pathlib import Path
from typing import Optional

from flask import current_app
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from app.domain.models import PDF, PDFStatus
from app.exceptions import FileOperationError, NotFoundError, ValidationError
from app.repositories.pdf_repository import PDFRepository, PaginatedResult


logger = logging.getLogger(__name__)


class PDFService:
    """Service for PDF business logic operations."""

    ALLOWED_EXTENSIONS = {".pdf"}
    ALLOWED_MIME_TYPES = {"application/pdf"}
    PDF_MAGIC_BYTES = b"%PDF-"

    def __init__(self, repository: Optional[PDFRepository] = None):
        """Initialize the service with a repository."""
        self.repository = repository or PDFRepository()

    def get_all_pdfs(
        self,
        status: Optional[PDFStatus] = None,
        user_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> PaginatedResult[PDF]:
        """
        Get all PDFs, optionally filtered by status.

        Args:
            status: Optional status to filter by
            user_id: Optional user ID to filter by (for multi-tenant)
            page: Page number (1-indexed)
            per_page: Number of items per page

        Returns:
            PaginatedResult containing PDF objects
        """
        return self.repository.get_all(
            status=status,
            user_id=user_id,
            page=page,
            per_page=per_page,
        )

    def get_pdf(self, pdf_id: int, user_id: Optional[int] = None) -> PDF:
        """
        Get a PDF by ID.

        Args:
            pdf_id: The PDF ID
            user_id: Optional user ID for authorization check

        Returns:
            PDF object

        Raises:
            NotFoundError: If PDF is not found
        """
        return self.repository.get_by_id_or_raise(pdf_id, user_id=user_id)

    def get_pdf_path(self, pdf: PDF) -> Path:
        """
        Get the file system path for a PDF.

        Args:
            pdf: The PDF object

        Returns:
            Path to the PDF file

        Raises:
            FileOperationError: If the file doesn't exist
        """
        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        file_path = upload_folder / pdf.filename

        if not file_path.exists():
            logger.error(f"PDF file not found: {file_path}")
            raise FileOperationError(f"File not found for PDF {pdf.id}")

        return file_path

    def upload_pdf(self, file: FileStorage, user_id: Optional[int] = None) -> PDF:
        """
        Upload a new PDF file.

        Args:
            file: The uploaded file
            user_id: Optional user ID for ownership

        Returns:
            Created PDF object

        Raises:
            ValidationError: If the file is invalid
            FileOperationError: If the file cannot be saved
        """
        self._validate_file(file)

        original_filename = file.filename or "unnamed.pdf"
        safe_filename = self._generate_unique_filename(original_filename)

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        upload_folder.mkdir(parents=True, exist_ok=True)

        file_path = upload_folder / safe_filename

        try:
            file.save(str(file_path))
            file_size = file_path.stat().st_size
        except OSError as e:
            logger.error(f"Failed to save file: {e}")
            raise FileOperationError(f"Failed to save file: {e}")

        try:
            pdf = self.repository.create(
                filename=safe_filename,
                original_filename=original_filename,
                file_size=file_size,
                user_id=user_id,
            )
            logger.info(f"Uploaded PDF: {pdf.id} - {original_filename}")
            return pdf
        except IntegrityError as e:
            # Clean up file if database insert fails due to constraint violation
            file_path.unlink(missing_ok=True)
            logger.error(f"Database integrity error: {e}")
            raise ValidationError("A file with this name already exists")
        except SQLAlchemyError as e:
            # Clean up file if database insert fails
            file_path.unlink(missing_ok=True)
            logger.error(f"Database error creating PDF record: {e}")
            raise FileOperationError(f"Failed to create PDF record")

    def update_status(
        self,
        pdf_id: int,
        status: PDFStatus,
        user_id: Optional[int] = None,
    ) -> PDF:
        """
        Update the status of a PDF.

        Args:
            pdf_id: The PDF ID
            status: The new status
            user_id: Optional user ID for authorization check

        Returns:
            Updated PDF object

        Raises:
            NotFoundError: If PDF is not found
        """
        pdf = self.repository.get_by_id_or_raise(pdf_id, user_id=user_id)
        updated_pdf = self.repository.update_status(pdf, status)
        logger.info(f"Updated PDF {pdf_id} status to {status.value}")
        return updated_pdf

    def delete_pdf(self, pdf_id: int, user_id: Optional[int] = None) -> None:
        """
        Soft-delete a PDF (file is kept until cleanup).

        Args:
            pdf_id: The PDF ID
            user_id: Optional user ID for authorization check

        Raises:
            NotFoundError: If PDF is not found
        """
        pdf = self.repository.get_by_id_or_raise(pdf_id, user_id=user_id)

        try:
            self.repository.soft_delete(pdf)
            logger.info(f"Soft-deleted PDF: {pdf_id}")
        except SQLAlchemyError as e:
            logger.error(f"Failed to soft-delete PDF record {pdf_id}: {e}")
            raise FileOperationError(f"Failed to delete PDF record")

    def restore_pdf(self, pdf_id: int, user_id: Optional[int] = None) -> PDF:
        """
        Restore a soft-deleted PDF.

        Args:
            pdf_id: The PDF ID
            user_id: Optional user ID for authorization check

        Returns:
            Restored PDF object

        Raises:
            NotFoundError: If PDF is not found
        """
        pdf = self.repository.get_by_id(pdf_id, user_id=user_id, include_deleted=True)
        if pdf is None:
            raise NotFoundError(f"PDF with ID {pdf_id} not found")

        if not pdf.is_deleted:
            raise ValidationError("PDF is not deleted")

        self.repository.restore(pdf)
        logger.info(f"Restored PDF: {pdf_id}")
        return pdf

    def cleanup_deleted_pdfs(self, days: int = 7) -> int:
        """
        Permanently delete PDFs that were soft-deleted more than `days` ago.

        Args:
            days: Number of days after which to permanently delete

        Returns:
            Number of PDFs cleaned up
        """
        deleted_pdfs = self.repository.get_deleted_pdfs(older_than_days=days)
        count = 0

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])

        for pdf in deleted_pdfs:
            file_path = upload_folder / pdf.filename

            # Delete the file if it exists
            if file_path.exists():
                try:
                    file_path.unlink()
                except OSError as e:
                    logger.error(f"Failed to delete file {file_path}: {e}")
                    continue  # Skip this PDF, try others

            # Hard delete the database record
            try:
                self.repository.hard_delete(pdf)
                count += 1
                logger.info(f"Permanently deleted PDF: {pdf.id}")
            except SQLAlchemyError as e:
                logger.error(f"Failed to hard-delete PDF record {pdf.id}: {e}")

        return count

    def get_deleted_pdfs(self, user_id: Optional[int] = None) -> list[PDF]:
        """
        Get soft-deleted PDFs for a user.

        Args:
            user_id: Optional user ID filter

        Returns:
            List of soft-deleted PDF objects
        """
        return self.repository.get_deleted_pdfs(user_id=user_id)

    def _validate_file(self, file: FileStorage) -> None:
        """
        Validate an uploaded file.

        Args:
            file: The file to validate

        Raises:
            ValidationError: If validation fails
        """
        if not file or not file.filename:
            raise ValidationError("No file provided")

        # Check extension
        extension = Path(file.filename).suffix.lower()
        if extension not in self.ALLOWED_EXTENSIONS:
            raise ValidationError(
                f"Invalid file type. Only PDF files are allowed, got: {extension}"
            )

        # Check MIME type if available
        if file.content_type and file.content_type not in self.ALLOWED_MIME_TYPES:
            logger.warning(
                f"Unexpected MIME type: {file.content_type} for file {file.filename}"
            )

        # Check magic bytes to verify it's actually a PDF
        self._validate_pdf_magic_bytes(file)

    def _validate_pdf_magic_bytes(self, file: FileStorage) -> None:
        """
        Validate that the file starts with PDF magic bytes.

        Args:
            file: The file to validate

        Raises:
            ValidationError: If the file is not a valid PDF
        """
        # Read first 5 bytes
        header = file.stream.read(len(self.PDF_MAGIC_BYTES))

        # Reset file pointer
        file.stream.seek(0)

        if header != self.PDF_MAGIC_BYTES:
            raise ValidationError(
                "Invalid PDF file. The file content does not match PDF format."
            )

    def _generate_unique_filename(self, original_filename: str) -> str:
        """
        Generate a unique filename to prevent collisions.

        Args:
            original_filename: The original filename

        Returns:
            A unique, safe filename
        """
        safe_name = secure_filename(original_filename)

        # Handle empty filename after sanitization
        if not safe_name:
            safe_name = "document.pdf"

        # Ensure it ends with .pdf
        if not safe_name.lower().endswith(".pdf"):
            safe_name += ".pdf"

        # Add UUID to prevent collisions (16 chars for better uniqueness)
        name_part = Path(safe_name).stem
        unique_id = uuid.uuid4().hex[:16]

        return f"{name_part}_{unique_id}.pdf"
