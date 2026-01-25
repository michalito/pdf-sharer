"""PDF repository for data access operations."""

from dataclasses import dataclass
from typing import Generic, Optional, TypeVar

from app import db
from app.domain.models import PDF, PDFStatus
from app.exceptions import NotFoundError


T = TypeVar("T")


@dataclass
class PaginatedResult(Generic[T]):
    """Container for paginated query results."""

    items: list[T]
    total: int
    page: int
    per_page: int
    pages: int
    has_next: bool
    has_prev: bool

    def to_dict(self) -> dict:
        """Convert pagination info to dictionary."""
        return {
            "total": self.total,
            "page": self.page,
            "per_page": self.per_page,
            "pages": self.pages,
            "has_next": self.has_next,
            "has_prev": self.has_prev,
        }


class PDFRepository:
    """Repository for PDF data access operations."""

    MAX_PER_PAGE = 100

    def get_all(
        self,
        status: Optional[PDFStatus] = None,
        user_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
        include_deleted: bool = False,
    ) -> PaginatedResult[PDF]:
        """
        Get all PDFs with pagination, optionally filtered by status and user.

        Args:
            status: Optional status filter
            user_id: Optional user ID filter
            page: Page number (1-indexed)
            per_page: Number of items per page (max 100)
            include_deleted: If True, include soft-deleted PDFs

        Returns:
            PaginatedResult containing PDF objects
        """
        # Enforce limits
        page = max(1, page)
        per_page = min(max(1, per_page), self.MAX_PER_PAGE)

        query = PDF.query.order_by(PDF.upload_date.desc())

        # Filter out deleted PDFs by default
        if not include_deleted:
            query = query.filter(PDF.deleted_at.is_(None))

        if status is not None:
            query = query.filter(PDF.status == status.value)

        if user_id is not None:
            query = query.filter(PDF.user_id == user_id)

        # Get total count
        total = query.count()

        # Calculate pagination
        pages = (total + per_page - 1) // per_page if total > 0 else 1
        offset = (page - 1) * per_page

        items = query.offset(offset).limit(per_page).all()

        return PaginatedResult(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            pages=pages,
            has_next=page < pages,
            has_prev=page > 1,
        )

    def get_by_id(
        self,
        pdf_id: int,
        user_id: Optional[int] = None,
        include_deleted: bool = False,
    ) -> Optional[PDF]:
        """
        Get a PDF by its ID.

        Args:
            pdf_id: The PDF ID
            user_id: Optional user ID filter for authorization
            include_deleted: If True, include soft-deleted PDFs

        Returns:
            PDF object or None if not found
        """
        pdf = db.session.get(PDF, pdf_id)

        if pdf is None:
            return None

        # Filter out deleted PDFs by default
        if not include_deleted and pdf.is_deleted:
            return None

        # Check user ownership if user_id provided
        if user_id is not None and pdf.user_id != user_id:
            return None

        return pdf

    def get_by_id_or_raise(
        self,
        pdf_id: int,
        user_id: Optional[int] = None,
    ) -> PDF:
        """
        Get a PDF by its ID, raising an error if not found.

        Args:
            pdf_id: The PDF ID
            user_id: Optional user ID filter for authorization

        Returns:
            PDF object

        Raises:
            NotFoundError: If PDF is not found or not owned by user
        """
        pdf = self.get_by_id(pdf_id, user_id=user_id)
        if pdf is None:
            raise NotFoundError(f"PDF with ID {pdf_id} not found")
        return pdf

    def create(
        self,
        filename: str,
        original_filename: str,
        file_size: int,
        status: PDFStatus = PDFStatus.UNPROCESSED,
        user_id: Optional[int] = None,
    ) -> PDF:
        """
        Create a new PDF record.

        Args:
            filename: The stored filename (sanitized)
            original_filename: The original user-provided filename
            file_size: Size of the file in bytes
            status: Initial status (defaults to UNPROCESSED)
            user_id: Optional user ID for ownership

        Returns:
            Created PDF object
        """
        pdf = PDF(
            filename=filename,
            original_filename=original_filename,
            file_size=file_size,
            status=status.value,
            user_id=user_id,
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

    def soft_delete(self, pdf: PDF) -> PDF:
        """
        Soft-delete a PDF record by setting deleted_at.

        Args:
            pdf: The PDF object to soft-delete

        Returns:
            The soft-deleted PDF object
        """
        pdf.soft_delete()
        db.session.commit()
        return pdf

    def restore(self, pdf: PDF) -> PDF:
        """
        Restore a soft-deleted PDF.

        Args:
            pdf: The PDF object to restore

        Returns:
            The restored PDF object
        """
        pdf.deleted_at = None
        db.session.commit()
        return pdf

    def hard_delete(self, pdf: PDF) -> None:
        """
        Permanently delete a PDF record from the database.

        Args:
            pdf: The PDF object to permanently delete
        """
        db.session.delete(pdf)
        db.session.commit()

    def delete(self, pdf: PDF) -> None:
        """
        Delete a PDF record (soft-delete).

        Args:
            pdf: The PDF object to delete
        """
        self.soft_delete(pdf)

    def get_deleted_pdfs(
        self,
        user_id: Optional[int] = None,
        older_than_days: Optional[int] = None,
    ) -> list[PDF]:
        """
        Get soft-deleted PDFs.

        Args:
            user_id: Optional user ID filter
            older_than_days: Only return PDFs deleted more than this many days ago

        Returns:
            List of soft-deleted PDF objects
        """
        from datetime import datetime, timedelta, timezone

        query = PDF.query.filter(PDF.deleted_at.isnot(None))

        if user_id is not None:
            query = query.filter(PDF.user_id == user_id)

        if older_than_days is not None:
            cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
            query = query.filter(PDF.deleted_at < cutoff)

        return query.all()
