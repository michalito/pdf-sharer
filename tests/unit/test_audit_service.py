"""Unit tests for AuditService."""

import pytest
from unittest.mock import MagicMock, patch

from app.domain.audit_log import AuditAction, AuditLog, ResourceType
from app.services.audit_service import AuditService


class TestAuditService:
    """Tests for AuditService."""

    @pytest.fixture
    def mock_repository(self):
        """Create a mock audit repository."""
        return MagicMock()

    @pytest.fixture
    def service(self, mock_repository):
        """Create an AuditService with mock repository."""
        return AuditService(repository=mock_repository)

    def test_log_creates_audit_entry(self, service, mock_repository):
        """Test that log() creates an audit entry."""
        mock_repository.create.return_value = AuditLog(
            id=1,
            action=AuditAction.USER_LOGIN_SUCCESS.value,
            user_id=1,
        )

        with patch.object(service, "_get_request_context") as mock_ctx:
            mock_ctx.return_value = {
                "request_id": "test-request-id",
                "ip_address": "127.0.0.1",
                "user_agent": "Test Agent",
            }

            result = service.log(
                action=AuditAction.USER_LOGIN_SUCCESS,
                user_id=1,
            )

        assert result is not None
        mock_repository.create.assert_called_once()

    def test_log_is_fail_safe(self, service, mock_repository):
        """Test that log() never raises exceptions."""
        mock_repository.create.side_effect = Exception("Database error")

        with patch.object(service, "_get_request_context") as mock_ctx:
            mock_ctx.return_value = {
                "request_id": None,
                "ip_address": None,
                "user_agent": None,
            }

            # Should not raise
            result = service.log(
                action=AuditAction.USER_LOGIN_SUCCESS,
                user_id=1,
            )

        assert result is None

    def test_log_login_success(self, service, mock_repository):
        """Test log_login_success convenience method."""
        mock_repository.create.return_value = AuditLog(
            id=1,
            action=AuditAction.USER_LOGIN_SUCCESS.value,
        )

        with patch.object(service, "_get_request_context") as mock_ctx:
            mock_ctx.return_value = {
                "request_id": None,
                "ip_address": None,
                "user_agent": None,
            }

            service.log_login_success(user_id=1)

        mock_repository.create.assert_called_once()
        call_kwargs = mock_repository.create.call_args[1]
        assert call_kwargs["action"] == AuditAction.USER_LOGIN_SUCCESS
        assert call_kwargs["user_id"] == 1
        assert call_kwargs["resource_type"] == ResourceType.USER
        assert call_kwargs["resource_id"] == 1

    def test_log_login_failure(self, service, mock_repository):
        """Test log_login_failure convenience method."""
        mock_repository.create.return_value = AuditLog(
            id=1,
            action=AuditAction.USER_LOGIN_FAILURE.value,
        )

        with patch.object(service, "_get_request_context") as mock_ctx:
            mock_ctx.return_value = {
                "request_id": None,
                "ip_address": None,
                "user_agent": None,
            }

            service.log_login_failure(username="baduser")

        call_kwargs = mock_repository.create.call_args[1]
        assert call_kwargs["action"] == AuditAction.USER_LOGIN_FAILURE
        assert call_kwargs["success"] is False
        assert call_kwargs["details"]["username"] == "baduser"

    def test_log_pdf_upload(self, service, mock_repository):
        """Test log_pdf_upload convenience method."""
        mock_repository.create.return_value = AuditLog(
            id=1,
            action=AuditAction.PDF_UPLOAD.value,
        )

        with patch.object(service, "_get_request_context") as mock_ctx:
            mock_ctx.return_value = {
                "request_id": None,
                "ip_address": None,
                "user_agent": None,
            }

            service.log_pdf_upload(user_id=1, pdf_id=10, filename="test.pdf")

        call_kwargs = mock_repository.create.call_args[1]
        assert call_kwargs["action"] == AuditAction.PDF_UPLOAD
        assert call_kwargs["user_id"] == 1
        assert call_kwargs["resource_type"] == ResourceType.PDF
        assert call_kwargs["resource_id"] == 10
        assert call_kwargs["details"]["filename"] == "test.pdf"

    def test_log_pdf_status_change(self, service, mock_repository):
        """Test log_pdf_status_change convenience method."""
        mock_repository.create.return_value = AuditLog(
            id=1,
            action=AuditAction.PDF_STATUS_CHANGE.value,
        )

        with patch.object(service, "_get_request_context") as mock_ctx:
            mock_ctx.return_value = {
                "request_id": None,
                "ip_address": None,
                "user_agent": None,
            }

            service.log_pdf_status_change(
                user_id=1,
                pdf_id=10,
                old_status="unprocessed",
                new_status="processed",
            )

        call_kwargs = mock_repository.create.call_args[1]
        assert call_kwargs["action"] == AuditAction.PDF_STATUS_CHANGE
        assert call_kwargs["details"]["old_status"] == "unprocessed"
        assert call_kwargs["details"]["new_status"] == "processed"

    def test_log_pdf_delete(self, service, mock_repository):
        """Test log_pdf_delete convenience method."""
        mock_repository.create.return_value = AuditLog(
            id=1,
            action=AuditAction.PDF_DELETE.value,
        )

        with patch.object(service, "_get_request_context") as mock_ctx:
            mock_ctx.return_value = {
                "request_id": None,
                "ip_address": None,
                "user_agent": None,
            }

            service.log_pdf_delete(user_id=1, pdf_id=10, filename="deleted.pdf")

        call_kwargs = mock_repository.create.call_args[1]
        assert call_kwargs["action"] == AuditAction.PDF_DELETE
        assert call_kwargs["details"]["filename"] == "deleted.pdf"
