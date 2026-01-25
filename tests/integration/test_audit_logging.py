"""Integration tests for audit logging."""

import pytest

from app import db
from app.domain.audit_log import AuditAction, AuditLog

from tests.conftest import TEST_PASSWORD


class TestRequestIdMiddleware:
    """Tests for request ID middleware."""

    def test_response_includes_request_id(self, client):
        """Test that responses include X-Request-ID header."""
        response = client.get("/")

        assert "X-Request-ID" in response.headers
        assert response.headers["X-Request-ID"] != "-"

    def test_request_id_passthrough(self, client):
        """Test that provided request ID is used."""
        custom_id = "my-custom-request-id"
        response = client.get("/", headers={"X-Request-ID": custom_id})

        assert response.headers["X-Request-ID"] == custom_id


class TestAuditLoggingIntegration:
    """Integration tests for audit logging in routes."""

    def test_login_creates_audit_log(self, app, client, test_user):
        """Test that successful login creates an audit log entry."""
        response = client.post(
            "/auth/login",
            json={"username": "testuser", "password": TEST_PASSWORD},
        )

        assert response.status_code == 200

        with app.app_context():
            logs = AuditLog.query.filter_by(
                action=AuditAction.USER_LOGIN_SUCCESS.value
            ).all()
            assert len(logs) >= 1

            log = logs[-1]
            assert log.user_id == test_user.id
            assert log.success is True

    def test_failed_login_creates_audit_log(self, app, client, test_user):
        """Test that failed login creates an audit log entry."""
        response = client.post(
            "/auth/login",
            json={"username": "testuser", "password": "WrongPass123!"},
        )

        assert response.status_code == 401

        with app.app_context():
            logs = AuditLog.query.filter_by(
                action=AuditAction.USER_LOGIN_FAILURE.value
            ).all()
            assert len(logs) >= 1

            log = logs[-1]
            assert log.success is False
            assert "testuser" in log.details

    def test_logout_creates_audit_log(self, app, authenticated_client, test_user):
        """Test that logout creates an audit log entry."""
        response = authenticated_client.post("/auth/logout")

        assert response.status_code == 200

        with app.app_context():
            logs = AuditLog.query.filter_by(
                action=AuditAction.USER_LOGOUT.value
            ).all()
            assert len(logs) >= 1

            log = logs[-1]
            assert log.user_id == test_user.id

    def test_registration_creates_audit_log(self, app, client):
        """Test that registration creates an audit log entry."""
        response = client.post(
            "/auth/register",
            json={"username": "audituser", "password": "AuditPass123!"},
        )

        assert response.status_code == 201
        data = response.get_json()

        with app.app_context():
            logs = AuditLog.query.filter_by(
                action=AuditAction.USER_REGISTER.value
            ).all()
            assert len(logs) >= 1

            log = logs[-1]
            assert log.user_id == data["id"]
            assert "audituser" in log.details

    def test_pdf_upload_creates_audit_log(
        self, app, authenticated_client, sample_pdf_bytes, test_user
    ):
        """Test that PDF upload creates an audit log entry."""
        from io import BytesIO

        response = authenticated_client.post(
            "/api/pdfs",
            data={"file": (BytesIO(sample_pdf_bytes), "audit_test.pdf")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 201
        pdf_data = response.get_json()

        with app.app_context():
            logs = AuditLog.query.filter_by(
                action=AuditAction.PDF_UPLOAD.value
            ).all()
            assert len(logs) >= 1

            log = logs[-1]
            assert log.user_id == test_user.id
            assert log.resource_id == pdf_data["id"]
            assert "audit_test.pdf" in log.details

    def test_pdf_delete_creates_audit_log(
        self, app, authenticated_client, sample_pdf, test_user
    ):
        """Test that PDF deletion creates an audit log entry."""
        with app.app_context():
            pdf_id = sample_pdf.id

        response = authenticated_client.delete(f"/api/pdfs/{pdf_id}")
        assert response.status_code == 204

        with app.app_context():
            logs = AuditLog.query.filter_by(
                action=AuditAction.PDF_DELETE.value
            ).all()
            assert len(logs) >= 1

            log = logs[-1]
            assert log.user_id == test_user.id
            assert log.resource_id == pdf_id

    def test_audit_logs_include_request_id(self, app, client, test_user):
        """Test that audit logs include the request ID."""
        custom_id = "test-request-12345"

        response = client.post(
            "/auth/login",
            json={"username": "testuser", "password": TEST_PASSWORD},
            headers={"X-Request-ID": custom_id},
        )

        assert response.status_code == 200

        with app.app_context():
            logs = AuditLog.query.filter_by(request_id=custom_id).all()
            assert len(logs) >= 1
