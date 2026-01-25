"""Integration tests for PDF upload API."""

import io

import pytest


class TestUploadPDF:
    """Tests for POST /api/pdfs endpoint."""

    def test_upload_unauthenticated(self, client, sample_pdf_bytes):
        """Test that unauthenticated uploads are rejected."""
        response = client.post(
            "/api/pdfs",
            data={"file": (io.BytesIO(sample_pdf_bytes), "test.pdf")},
            content_type="multipart/form-data",
        )
        assert response.status_code == 401

    def test_upload_success(self, authenticated_client, sample_pdf_bytes):
        """Test successful PDF upload."""
        response = authenticated_client.post(
            "/api/pdfs",
            data={"file": (io.BytesIO(sample_pdf_bytes), "test_document.pdf")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data["filename"] == "test_document.pdf"
        assert data["status"] == "unprocessed"
        assert "id" in data
        assert "fileSize" in data
        assert "uploadDate" in data

    def test_upload_no_file(self, authenticated_client):
        """Test upload without file."""
        response = authenticated_client.post(
            "/api/pdfs",
            data={},
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "No file" in response.get_json()["error"]

    def test_upload_wrong_extension(self, authenticated_client):
        """Test upload with non-PDF file extension."""
        response = authenticated_client.post(
            "/api/pdfs",
            data={"file": (io.BytesIO(b"content"), "document.txt")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "Only PDF" in response.get_json()["error"]

    def test_upload_invalid_pdf_content(self, authenticated_client):
        """Test upload with invalid PDF content (wrong magic bytes)."""
        response = authenticated_client.post(
            "/api/pdfs",
            data={"file": (io.BytesIO(b"Not a PDF"), "fake.pdf")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 400
        assert "content does not match" in response.get_json()["error"]

    def test_upload_creates_file(self, authenticated_client, sample_pdf_bytes, temp_upload_dir):
        """Test that uploaded file is actually saved."""
        response = authenticated_client.post(
            "/api/pdfs",
            data={"file": (io.BytesIO(sample_pdf_bytes), "saved_file.pdf")},
            content_type="multipart/form-data",
        )

        assert response.status_code == 201

        # Check that a file was created in the upload directory
        files = list(temp_upload_dir.glob("*.pdf"))
        assert len(files) >= 1

    def test_upload_multiple_files_sequentially(self, authenticated_client, sample_pdf_bytes):
        """Test uploading multiple files one after another."""
        for i in range(3):
            response = authenticated_client.post(
                "/api/pdfs",
                data={"file": (io.BytesIO(sample_pdf_bytes), f"document_{i}.pdf")},
                content_type="multipart/form-data",
            )
            assert response.status_code == 201

        # Verify all files are listed
        response = authenticated_client.get("/api/pdfs")
        data = response.get_json()
        assert data["pagination"]["total"] == 3
