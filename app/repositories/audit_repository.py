"""Audit log repository for data access operations."""

import json
from datetime import datetime
from typing import Optional, Any

from app import db
from app.domain.audit_log import AuditAction, AuditLog, ResourceType


class AuditRepository:
    """Repository for audit log data access operations."""

    def create(
        self,
        action: AuditAction,
        user_id: Optional[int] = None,
        request_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        resource_type: Optional[ResourceType] = None,
        resource_id: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None,
    ) -> AuditLog:
        """
        Create a new audit log entry.

        Args:
            action: The action being audited
            user_id: ID of the user performing the action
            request_id: Request ID for correlation
            ip_address: Client IP address
            user_agent: Client user agent
            resource_type: Type of resource being acted upon
            resource_id: ID of the resource being acted upon
            details: Additional details as a dictionary
            success: Whether the action succeeded
            error_message: Error message if action failed

        Returns:
            Created AuditLog object
        """
        audit_log = AuditLog(
            action=action.value,
            user_id=user_id,
            request_id=request_id,
            ip_address=ip_address,
            user_agent=user_agent[:512] if user_agent else None,
            resource_type=resource_type.value if resource_type else None,
            resource_id=resource_id,
            details=json.dumps(details) if details else None,
            success=success,
            error_message=error_message[:500] if error_message else None,
        )
        db.session.add(audit_log)
        db.session.commit()
        return audit_log

    def get_by_user(
        self,
        user_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        """
        Get audit logs for a specific user.

        Args:
            user_id: The user ID
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            List of AuditLog objects
        """
        return (
            AuditLog.query.filter(AuditLog.user_id == user_id)
            .order_by(AuditLog.timestamp.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def get_by_resource(
        self,
        resource_type: ResourceType,
        resource_id: int,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get audit logs for a specific resource.

        Args:
            resource_type: The type of resource
            resource_id: The resource ID
            limit: Maximum number of results

        Returns:
            List of AuditLog objects
        """
        return (
            AuditLog.query.filter(
                AuditLog.resource_type == resource_type.value,
                AuditLog.resource_id == resource_id,
            )
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
            .all()
        )

    def get_by_request_id(self, request_id: str) -> list[AuditLog]:
        """
        Get audit logs for a specific request.

        Args:
            request_id: The request ID

        Returns:
            List of AuditLog objects
        """
        return (
            AuditLog.query.filter(AuditLog.request_id == request_id)
            .order_by(AuditLog.timestamp.asc())
            .all()
        )

    def get_recent(
        self,
        action: Optional[AuditAction] = None,
        since: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[AuditLog]:
        """
        Get recent audit logs.

        Args:
            action: Optional filter by action type
            since: Optional filter for logs after this timestamp
            limit: Maximum number of results

        Returns:
            List of AuditLog objects
        """
        query = AuditLog.query.order_by(AuditLog.timestamp.desc())

        if action is not None:
            query = query.filter(AuditLog.action == action.value)

        if since is not None:
            query = query.filter(AuditLog.timestamp >= since)

        return query.limit(limit).all()

    def count_by_action(
        self,
        action: AuditAction,
        since: Optional[datetime] = None,
    ) -> int:
        """
        Count audit logs for a specific action.

        Args:
            action: The action to count
            since: Optional filter for logs after this timestamp

        Returns:
            Count of matching audit logs
        """
        query = AuditLog.query.filter(AuditLog.action == action.value)

        if since is not None:
            query = query.filter(AuditLog.timestamp >= since)

        return query.count()
