"""Integration tests for PDF list API."""

import pytest


class TestListPDFs:
    """Tests for GET /api/pdfs endpoint."""

    def test_list_pdfs_unauthenticated(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.get("/api/pdfs")
        assert response.status_code == 401

    def test_list_pdfs_empty(self, authenticated_client):
        """Test listing PDFs when none exist."""
        response = authenticated_client.get("/api/pdfs")

        assert response.status_code == 200
        data = response.get_json()
        assert data["items"] == []
        assert data["pagination"]["total"] == 0

    def test_list_pdfs_with_data(self, authenticated_client, multiple_pdfs, app):
        """Test listing PDFs with existing data."""
        response = authenticated_client.get("/api/pdfs")

        assert response.status_code == 200
        data = response.get_json()
        assert len(data["items"]) == 5
        assert data["pagination"]["total"] == 5

    def test_list_pdfs_status_filter(self, authenticated_client, multiple_pdfs, app):
        """Test filtering PDFs by status."""
        # Filter by unprocessed (should be 2)
        response = authenticated_client.get("/api/pdfs?status=unprocessed")
        assert response.status_code == 200
        data = response.get_json()
        assert data["pagination"]["total"] == 2

        # Filter by processed (should be 3)
        response = authenticated_client.get("/api/pdfs?status=processed")
        assert response.status_code == 200
        data = response.get_json()
        assert data["pagination"]["total"] == 3

    def test_list_pdfs_invalid_status(self, authenticated_client):
        """Test filtering with invalid status."""
        response = authenticated_client.get("/api/pdfs?status=invalid")

        assert response.status_code == 400
        assert "Invalid status" in response.get_json()["error"]

    def test_list_pdfs_pagination(self, authenticated_client, app, test_user, temp_upload_dir, sample_pdf_bytes):
        """Test pagination of PDF list."""
        from app import db
        from app.domain.models import PDF

        # Create 25 PDFs
        with app.app_context():
            user = db.session.get(type(test_user), test_user.id)
            for i in range(25):
                filename = f"pdf_{i:03d}.pdf"
                (temp_upload_dir / filename).write_bytes(sample_pdf_bytes)
                pdf = PDF(
                    filename=filename,
                    original_filename=f"doc_{i}.pdf",
                    file_size=len(sample_pdf_bytes),
                    user_id=user.id,
                )
                db.session.add(pdf)
            db.session.commit()

        # First page
        response = authenticated_client.get("/api/pdfs?page=1&per_page=10")
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["items"]) == 10
        assert data["pagination"]["total"] == 25
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["pages"] == 3
        assert data["pagination"]["has_next"] is True
        assert data["pagination"]["has_prev"] is False

        # Second page
        response = authenticated_client.get("/api/pdfs?page=2&per_page=10")
        data = response.get_json()
        assert len(data["items"]) == 10
        assert data["pagination"]["page"] == 2
        assert data["pagination"]["has_next"] is True
        assert data["pagination"]["has_prev"] is True

        # Third page (partial)
        response = authenticated_client.get("/api/pdfs?page=3&per_page=10")
        data = response.get_json()
        assert len(data["items"]) == 5
        assert data["pagination"]["has_next"] is False
        assert data["pagination"]["has_prev"] is True

    def test_list_pdfs_invalid_pagination(self, authenticated_client):
        """Test invalid pagination parameters."""
        response = authenticated_client.get("/api/pdfs?page=abc")

        assert response.status_code == 400
        assert "Invalid pagination" in response.get_json()["error"]
