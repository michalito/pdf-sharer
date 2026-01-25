"""Audit log model and enums."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any

from app import db


class AuditAction(str, Enum):
    """Actions that can be audited."""

    # User actions
    USER_LOGIN_SUCCESS = "user_login_success"
    USER_LOGIN_FAILURE = "user_login_failure"
    USER_LOGOUT = "user_logout"
    USER_REGISTER = "user_register"

    # PDF actions
    PDF_UPLOAD = "pdf_upload"
    PDF_DOWNLOAD = "pdf_download"
    PDF_STATUS_CHANGE = "pdf_status_change"
    PDF_DELETE = "pdf_delete"
    PDF_RESTORE = "pdf_restore"


class ResourceType(str, Enum):
    """Types of resources that can be audited."""

    USER = "user"
    PDF = "pdf"
    SESSION = "session"


class AuditLog(db.Model):
    """Audit log entry for tracking user actions."""

    __tablename__ = "audit_logs"

    id: int = db.Column(db.Integer, primary_key=True)
    timestamp: datetime = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    request_id: Optional[str] = db.Column(db.String(36), nullable=True, index=True)
    user_id: Optional[int] = db.Column(db.Integer, nullable=True, index=True)
    ip_address: Optional[str] = db.Column(db.String(45), nullable=True)
    user_agent: Optional[str] = db.Column(db.String(512), nullable=True)
    action: str = db.Column(db.String(50), nullable=False, index=True)
    resource_type: Optional[str] = db.Column(db.String(20), nullable=True, index=True)
    resource_id: Optional[int] = db.Column(db.Integer, nullable=True)
    details: Optional[str] = db.Column(db.Text, nullable=True)
    success: bool = db.Column(db.Boolean, nullable=False, default=True)
    error_message: Optional[str] = db.Column(db.String(500), nullable=True)

    # Composite index for resource queries
    __table_args__ = (
        db.Index("ix_audit_logs_resource", "resource_type", "resource_id"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.id}: {self.action} by user {self.user_id}>"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        import json

        result = {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "request_id": self.request_id,
            "user_id": self.user_id,
            "ip_address": self.ip_address,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "success": self.success,
        }

        if self.details:
            try:
                result["details"] = json.loads(self.details)
            except json.JSONDecodeError:
                result["details"] = self.details

        if self.error_message:
            result["error_message"] = self.error_message

        return result
