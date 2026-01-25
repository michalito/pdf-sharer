"""Integration tests for PDF update API."""

import pytest


class TestUpdatePDF:
    """Tests for PATCH /api/pdfs/<id> endpoint."""

    def test_update_unauthenticated(self, client, sample_pdf):
        """Test that unauthenticated updates are rejected."""
        response = client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "processed"},
        )
        assert response.status_code == 401

    def test_update_status_to_processed(self, authenticated_client, sample_pdf):
        """Test updating status to processed."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "processed"},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "processed"
        assert data["id"] == sample_pdf.id

    def test_update_status_to_unprocessed(self, authenticated_client, sample_pdf, app):
        """Test updating status back to unprocessed."""
        from app import db
        from app.domain.models import PDF, PDFStatus

        # First set to processed
        with app.app_context():
            pdf = db.session.get(PDF, sample_pdf.id)
            pdf.set_status(PDFStatus.PROCESSED)
            db.session.commit()

        # Then update back to unprocessed
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "unprocessed"},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "unprocessed"

    def test_update_not_found(self, authenticated_client):
        """Test updating non-existent PDF."""
        response = authenticated_client.patch(
            "/api/pdfs/99999",
            json={"status": "processed"},
        )

        assert response.status_code == 404

    def test_update_invalid_status(self, authenticated_client, sample_pdf):
        """Test updating with invalid status."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "invalid_status"},
        )

        assert response.status_code == 400
        assert "Invalid status" in response.get_json()["error"]

    def test_update_missing_status(self, authenticated_client, sample_pdf):
        """Test updating without status field."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={},
        )

        assert response.status_code == 400
        assert "Missing" in response.get_json()["error"]

    def test_update_other_users_pdf(self, client, app, sample_pdf):
        """Test that users cannot update other users' PDFs."""
        from app import db
        from app.domain.user import User

        # Create another user and login
        with app.app_context():
            other_user = User(username="otheruser")
            other_user.set_password("OtherPass123!")
            db.session.add(other_user)
            db.session.commit()

        # Login as other user
        client.post(
            "/auth/login",
            json={"username": "otheruser", "password": "OtherPass123!"},
        )

        # Try to update first user's PDF
        response = client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "processed"},
        )

        assert response.status_code == 404

    def test_update_case_insensitive_status(self, authenticated_client, sample_pdf):
        """Test that status is case-insensitive."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "PROCESSED"},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "processed"
