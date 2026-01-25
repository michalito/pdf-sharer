"""PDF repository for data access operations."""

from typing import Optional

from app import db
from app.domain.models import PDF, PDFStatus
from app.exceptions import NotFoundError


class PDFRepository:
    """Repository for PDF data access operations."""

    def get_all(self, status: Optional[PDFStatus] = None) -> list[PDF]:
        """
        Get all PDFs, optionally filtered by status.

        Args:
            status: Optional status filter

        Returns:
            List of PDF objects ordered by upload date descending
        """
        query = PDF.query.order_by(PDF.upload_date.desc())

        if status is not None:
            query = query.filter(PDF.status == status.value)

        return query.all()

    def get_by_id(self, pdf_id: int) -> Optional[PDF]:
        """
        Get a PDF by its ID.

        Args:
            pdf_id: The PDF ID

        Returns:
            PDF object or None if not found
        """
        return db.session.get(PDF, pdf_id)

    def get_by_id_or_raise(self, pdf_id: int) -> PDF:
        """
        Get a PDF by its ID, raising an error if not found.

        Args:
            pdf_id: The PDF ID

        Returns:
            PDF object

        Raises:
            NotFoundError: If PDF is not found
        """
        pdf = self.get_by_id(pdf_id)
        if pdf is None:
            raise NotFoundError(f"PDF with ID {pdf_id} not found")
        return pdf

    def create(
        self,
        filename: str,
        original_filename: str,
        file_size: int,
        status: PDFStatus = PDFStatus.UNPROCESSED,
    ) -> PDF:
        """
        Create a new PDF record.

        Args:
            filename: The stored filename (sanitized)
            original_filename: The original user-provided filename
            file_size: Size of the file in bytes
            status: Initial status (defaults to UNPROCESSED)

        Returns:
            Created PDF object
        """
        pdf = PDF(
            filename=filename,
            original_filename=original_filename,
            file_size=file_size,
            status=status.value,
        )
        db.session.add(pdf)
        db.session.commit()
        return pdf

    def update_status(self, pdf: PDF, status: PDFStatus) -> PDF:
        """
        Update the status of a PDF.

        Args:
            pdf: The PDF object to update
            status: The new status

        Returns:
            Updated PDF object
        """
        pdf.set_status(status)
        db.session.commit()
        return pdf

    def delete(self, pdf: PDF) -> None:
        """
        Delete a PDF record.

        Args:
            pdf: The PDF object to delete
        """
        db.session.delete(pdf)
        db.session.commit()
