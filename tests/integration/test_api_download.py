"""Integration tests for PDF download API."""

import pytest


class TestDownloadPDF:
    """Tests for GET /api/pdfs/<id> endpoint."""

    def test_download_unauthenticated(self, client, sample_pdf):
        """Test that unauthenticated downloads are rejected."""
        response = client.get(f"/api/pdfs/{sample_pdf.id}")
        assert response.status_code == 401

    def test_download_success(self, authenticated_client, sample_pdf, sample_pdf_bytes):
        """Test successful PDF download."""
        response = authenticated_client.get(f"/api/pdfs/{sample_pdf.id}")

        assert response.status_code == 200
        assert response.content_type == "application/pdf"
        assert response.data == sample_pdf_bytes

    def test_download_not_found(self, authenticated_client):
        """Test downloading non-existent PDF."""
        response = authenticated_client.get("/api/pdfs/99999")

        assert response.status_code == 404

    def test_download_other_users_pdf(self, client, app, sample_pdf):
        """Test that users cannot download other users' PDFs."""
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

        # Try to download first user's PDF
        response = client.get(f"/api/pdfs/{sample_pdf.id}")

        assert response.status_code == 404

    def test_download_sets_filename_header(self, authenticated_client, sample_pdf):
        """Test that download sets correct filename header."""
        response = authenticated_client.get(f"/api/pdfs/{sample_pdf.id}")

        assert response.status_code == 200
        content_disposition = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disposition
        assert sample_pdf.original_filename in content_disposition
