"""Domain models and enums."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from app import db


class PDFStatus(str, Enum):
    """Valid statuses for PDF documents."""

    UNPROCESSED = "unprocessed"
    PROCESSED = "processed"

    @classmethod
    def from_string(cls, value: str) -> "PDFStatus":
        """Convert a string to PDFStatus, with case-insensitive matching."""
        try:
            return cls(value.lower())
        except ValueError:
            valid = ", ".join(s.value for s in cls)
            raise ValueError(f"Invalid status '{value}'. Valid values: {valid}")


class PDF(db.Model):
    """PDF document model."""

    __tablename__ = "pdfs"
    __table_args__ = (
        db.UniqueConstraint("filename", "user_id", name="uq_pdfs_filename_user_id"),
    )

    id: int = db.Column(db.Integer, primary_key=True)
    filename: str = db.Column(db.String(255), nullable=False)
    original_filename: str = db.Column(db.String(255), nullable=False)
    status: str = db.Column(
        db.String(20),
        nullable=False,
        default=PDFStatus.UNPROCESSED.value,
        index=True,
    )
    file_size: int = db.Column(db.Integer, nullable=False, default=0)
    upload_date: datetime = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: datetime = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
        onupdate=lambda: datetime.now(timezone.utc),
    )
    deleted_at: Optional[datetime] = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    user_id: Optional[int] = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Relationship to User (will be defined when User model exists)
    user = db.relationship("User", back_populates="pdfs", lazy="select")

    @property
    def is_deleted(self) -> bool:
        """Check if the PDF is soft-deleted."""
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        """Mark the PDF as deleted."""
        self.deleted_at = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return f"<PDF {self.id}: {self.original_filename} ({self.status})>"

    @property
    def status_enum(self) -> PDFStatus:
        """Get the status as an enum."""
        return PDFStatus(self.status)

    def set_status(self, status: PDFStatus) -> None:
        """Set the status using an enum."""
        self.status = status.value

    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        result = {
            "id": self.id,
            "filename": self.original_filename,
            "status": self.status,
            "fileSize": self.file_size,
            "uploadDate": self.upload_date.isoformat(),
        }
        if self.updated_at:
            result["updatedAt"] = self.updated_at.isoformat()
        return result
