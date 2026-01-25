"""PDF service for business logic operations."""

import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from app.domain.models import PDF, PDFStatus
from app.exceptions import FileOperationError, NotFoundError, ValidationError
from app.repositories.pdf_repository import PDFRepository


logger = logging.getLogger(__name__)


class PDFService:
    """Service for PDF business logic operations."""

    ALLOWED_EXTENSIONS = {".pdf"}
    ALLOWED_MIME_TYPES = {"application/pdf"}

    def __init__(self, repository: Optional[PDFRepository] = None):
        """Initialize the service with a repository."""
        self.repository = repository or PDFRepository()

    def get_all_pdfs(self, status: Optional[PDFStatus] = None) -> list[PDF]:
        """
        Get all PDFs, optionally filtered by status.

        Args:
            status: Optional status to filter by

        Returns:
            List of PDF objects
        """
        return self.repository.get_all(status)

    def get_pdf(self, pdf_id: int) -> PDF:
        """
        Get a PDF by ID.

        Args:
            pdf_id: The PDF ID

        Returns:
            PDF object

        Raises:
            NotFoundError: If PDF is not found
        """
        return self.repository.get_by_id_or_raise(pdf_id)

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

    def upload_pdf(self, file: FileStorage) -> PDF:
        """
        Upload a new PDF file.

        Args:
            file: The uploaded file

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
            )
            logger.info(f"Uploaded PDF: {pdf.id} - {original_filename}")
            return pdf
        except Exception as e:
            # Clean up file if database insert fails
            file_path.unlink(missing_ok=True)
            logger.error(f"Failed to create PDF record: {e}")
            raise FileOperationError(f"Failed to create PDF record: {e}")

    def update_status(self, pdf_id: int, status: PDFStatus) -> PDF:
        """
        Update the status of a PDF.

        Args:
            pdf_id: The PDF ID
            status: The new status

        Returns:
            Updated PDF object

        Raises:
            NotFoundError: If PDF is not found
        """
        pdf = self.repository.get_by_id_or_raise(pdf_id)
        updated_pdf = self.repository.update_status(pdf, status)
        logger.info(f"Updated PDF {pdf_id} status to {status.value}")
        return updated_pdf

    def delete_pdf(self, pdf_id: int) -> None:
        """
        Delete a PDF and its file.

        Args:
            pdf_id: The PDF ID

        Raises:
            NotFoundError: If PDF is not found
        """
        pdf = self.repository.get_by_id_or_raise(pdf_id)

        # Delete the file
        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        file_path = upload_folder / pdf.filename

        if file_path.exists():
            try:
                file_path.unlink()
            except OSError as e:
                logger.warning(f"Failed to delete file {file_path}: {e}")

        # Delete the database record
        self.repository.delete(pdf)
        logger.info(f"Deleted PDF: {pdf_id}")

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

        # Add UUID to prevent collisions
        name_part = Path(safe_name).stem
        unique_id = uuid.uuid4().hex[:8]

        return f"{name_part}_{unique_id}.pdf"
