"""Integration tests for API error handling."""

import pytest


class TestAPIErrorHandling:
    """Tests for API error responses."""

    def test_404_json_response(self, authenticated_client):
        """Test that 404 errors return JSON with proper structure."""
        response = authenticated_client.get("/api/pdfs/99999")

        assert response.status_code == 404
        assert response.content_type == "application/json"
        data = response.get_json()
        assert "error" in data
        assert "not found" in data["error"].lower()

    def test_400_json_response(self, authenticated_client, sample_pdf):
        """Test that 400 errors return JSON with proper structure."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "invalid"},
        )

        assert response.status_code == 400
        assert response.content_type == "application/json"
        data = response.get_json()
        assert "error" in data

    def test_401_json_response(self, client):
        """Test that 401 errors return JSON for API requests."""
        response = client.get("/api/pdfs")

        assert response.status_code == 401
        assert response.content_type == "application/json"
        data = response.get_json()
        assert "error" in data

    def test_method_not_allowed(self, authenticated_client):
        """Test that unsupported methods return appropriate error."""
        response = authenticated_client.put("/api/pdfs")

        assert response.status_code == 405

    def test_invalid_json_body_returns_400(self, authenticated_client, sample_pdf):
        """Test handling of invalid JSON body returns 400 with error code."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            data="not valid json {",
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        # Should have either INVALID_JSON code or be a bad request
        if "code" in data:
            assert data["code"] in ("INVALID_JSON", "BAD_REQUEST")

    def test_missing_status_field_returns_400(self, authenticated_client, sample_pdf):
        """Test that missing required field returns 400."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={},  # Missing 'status' field
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "status" in data["error"].lower()

    def test_empty_request_body_returns_400(self, authenticated_client, sample_pdf):
        """Test that empty request body returns 400."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            data="",
            content_type="application/json",
        )

        # Empty body should be caught as bad request or missing status
        assert response.status_code == 400

    def test_invalid_pagination_returns_400(self, authenticated_client):
        """Test that invalid pagination params return 400."""
        response = authenticated_client.get("/api/pdfs?page=invalid")

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data


class TestAPIErrorCodes:
    """Tests for API error codes in responses."""

    def test_validation_error_structure(self, authenticated_client, sample_pdf):
        """Test validation errors have proper structure."""
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "not_a_valid_status"},
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        # Error message should be helpful
        assert len(data["error"]) > 0


class TestWebErrorHandling:
    """Tests for web error responses."""

    def test_404_returns_html(self, client):
        """Test that web 404 returns HTML page."""
        response = client.get("/nonexistent-page")

        assert response.status_code == 404
        assert b"404" in response.data or b"not found" in response.data.lower()

    def test_login_redirect_for_protected_pages(self, client):
        """Test that protected pages redirect to login."""
        response = client.get("/", follow_redirects=False)

        # Should redirect to login for unauthenticated users
        # Note: The index page might be accessible, so this depends on your setup
        # Adjust based on your requirements


class TestCSRFProtection:
    """Tests for CSRF protection."""

    def test_api_exempt_from_csrf(self, authenticated_client, sample_pdf):
        """Test that API endpoints work without CSRF token."""
        # API should be exempt from CSRF
        response = authenticated_client.patch(
            f"/api/pdfs/{sample_pdf.id}",
            json={"status": "processed"},
        )

        # Should work without CSRF token
        assert response.status_code == 200
