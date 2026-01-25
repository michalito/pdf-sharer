"""Integration tests for PDF delete API."""

import pytest

from app import db


class TestDeletePDF:
    """Tests for DELETE /api/pdfs/<id> endpoint."""

    def test_delete_unauthenticated(self, client, sample_pdf):
        """Test that unauthenticated deletes are rejected."""
        response = client.delete(f"/api/pdfs/{sample_pdf.id}")
        assert response.status_code == 401

    def test_delete_success(self, authenticated_client, sample_pdf, temp_upload_dir, app):
        """Test successful PDF deletion (soft-delete)."""
        pdf_id = sample_pdf.id
        filename = sample_pdf.filename

        response = authenticated_client.delete(f"/api/pdfs/{pdf_id}")

        assert response.status_code == 204

        # File should still exist (soft-delete doesn't remove files immediately)
        assert (temp_upload_dir / filename).exists()

        # Verify PDF is no longer accessible via API (filtered out)
        response = authenticated_client.get(f"/api/pdfs/{pdf_id}")
        assert response.status_code == 404

        # Verify PDF is marked as deleted in database
        from app.domain.models import PDF
        with app.app_context():
            pdf = db.session.get(PDF, pdf_id)
            assert pdf is not None
            assert pdf.is_deleted is True

    def test_delete_not_found(self, authenticated_client):
        """Test deleting non-existent PDF."""
        response = authenticated_client.delete("/api/pdfs/99999")

        assert response.status_code == 404

    def test_delete_other_users_pdf(self, client, app, sample_pdf):
        """Test that users cannot delete other users' PDFs."""
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

        # Try to delete first user's PDF
        response = client.delete(f"/api/pdfs/{sample_pdf.id}")

        assert response.status_code == 404

    def test_delete_removes_from_list(self, authenticated_client, multiple_pdfs, app):
        """Test that deleted PDF is removed from list."""
        from app import db
        from app.domain.models import PDF

        # Get initial count
        response = authenticated_client.get("/api/pdfs")
        initial_count = response.get_json()["pagination"]["total"]

        # Delete first PDF
        with app.app_context():
            pdf_id = multiple_pdfs[0].id

        response = authenticated_client.delete(f"/api/pdfs/{pdf_id}")
        assert response.status_code == 204

        # Get new count
        response = authenticated_client.get("/api/pdfs")
        new_count = response.get_json()["pagination"]["total"]

        assert new_count == initial_count - 1
