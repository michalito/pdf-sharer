"""Audit service for logging user actions."""

import logging
from typing import Optional, Any

from flask import g, request

from app.domain.audit_log import AuditAction, AuditLog, ResourceType
from app.repositories.audit_repository import AuditRepository


logger = logging.getLogger(__name__)


class AuditService:
    """Service for audit logging operations.

    This service is fail-safe - it will never raise exceptions that could
    crash the application. All errors are logged but not propagated.
    """

    def __init__(self, repository: Optional[AuditRepository] = None):
        """Initialize the service with a repository."""
        self.repository = repository or AuditRepository()

    def _get_request_context(self) -> dict[str, Optional[str]]:
        """Get context from the current request."""
        try:
            return {
                "request_id": getattr(g, "request_id", None),
                "ip_address": request.remote_addr,
                "user_agent": request.headers.get("User-Agent"),
            }
        except RuntimeError:
            # Outside request context
            return {
                "request_id": None,
                "ip_address": None,
                "user_agent": None,
            }

    def log(
        self,
        action: AuditAction,
        user_id: Optional[int] = None,
        resource_type: Optional[ResourceType] = None,
        resource_id: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None,
    ) -> Optional[AuditLog]:
        """
        Log an audit event.

        This method is fail-safe and will not raise exceptions.

        Args:
            action: The action being audited
            user_id: ID of the user performing the action
            resource_type: Type of resource being acted upon
            resource_id: ID of the resource being acted upon
            details: Additional details
            success: Whether the action succeeded
            error_message: Error message if action failed

        Returns:
            Created AuditLog object or None if logging failed
        """
        try:
            ctx = self._get_request_context()

            audit_log = self.repository.create(
                action=action,
                user_id=user_id,
                request_id=ctx["request_id"],
                ip_address=ctx["ip_address"],
                user_agent=ctx["user_agent"],
                resource_type=resource_type,
                resource_id=resource_id,
                details=details,
                success=success,
                error_message=error_message,
            )

            return audit_log

        except Exception as e:
            # Never crash the app due to audit logging failures
            logger.error(f"Failed to create audit log: {e}", exc_info=True)
            return None

    # Authentication events

    def log_login_success(self, user_id: int) -> Optional[AuditLog]:
        """Log a successful login."""
        return self.log(
            action=AuditAction.USER_LOGIN_SUCCESS,
            user_id=user_id,
            resource_type=ResourceType.USER,
            resource_id=user_id,
        )

    def log_login_failure(self, username: str) -> Optional[AuditLog]:
        """Log a failed login attempt."""
        return self.log(
            action=AuditAction.USER_LOGIN_FAILURE,
            details={"username": username},
            success=False,
            error_message="Invalid credentials",
        )

    def log_logout(self, user_id: int) -> Optional[AuditLog]:
        """Log a user logout."""
        return self.log(
            action=AuditAction.USER_LOGOUT,
            user_id=user_id,
            resource_type=ResourceType.USER,
            resource_id=user_id,
        )

    # PDF events

    def log_pdf_upload(
        self,
        user_id: int,
        pdf_id: int,
        filename: str,
    ) -> Optional[AuditLog]:
        """Log a PDF upload."""
        return self.log(
            action=AuditAction.PDF_UPLOAD,
            user_id=user_id,
            resource_type=ResourceType.PDF,
            resource_id=pdf_id,
            details={"filename": filename},
        )

    def log_pdf_download(
        self,
        user_id: int,
        pdf_id: int,
        filename: str,
    ) -> Optional[AuditLog]:
        """Log a PDF download."""
        return self.log(
            action=AuditAction.PDF_DOWNLOAD,
            user_id=user_id,
            resource_type=ResourceType.PDF,
            resource_id=pdf_id,
            details={"filename": filename},
        )

    def log_pdf_status_change(
        self,
        user_id: int,
        pdf_id: int,
        old_status: str,
        new_status: str,
    ) -> Optional[AuditLog]:
        """Log a PDF status change."""
        return self.log(
            action=AuditAction.PDF_STATUS_CHANGE,
            user_id=user_id,
            resource_type=ResourceType.PDF,
            resource_id=pdf_id,
            details={"old_status": old_status, "new_status": new_status},
        )

    def log_pdf_delete(
        self,
        user_id: int,
        pdf_id: int,
        filename: str,
    ) -> Optional[AuditLog]:
        """Log a PDF deletion."""
        return self.log(
            action=AuditAction.PDF_DELETE,
            user_id=user_id,
            resource_type=ResourceType.PDF,
            resource_id=pdf_id,
            details={"filename": filename},
        )

    def log_pdf_restore(
        self,
        user_id: int,
        pdf_id: int,
        filename: str,
    ) -> Optional[AuditLog]:
        """Log a PDF restoration."""
        return self.log(
            action=AuditAction.PDF_RESTORE,
            user_id=user_id,
            resource_type=ResourceType.PDF,
            resource_id=pdf_id,
            details={"filename": filename},
        )
