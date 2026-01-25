"""Integration tests for authentication API."""

from tests.conftest import TEST_PASSWORD


class TestAuthLogin:
    """Tests for /auth/login endpoint."""

    def test_login_success(self, client, test_user):
        """Test successful login."""
        response = client.post(
            "/auth/login",
            json={"username": "testuser", "password": TEST_PASSWORD},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["username"] == "testuser"

    def test_login_wrong_password(self, client, test_user):
        """Test login with wrong password."""
        response = client.post(
            "/auth/login",
            json={"username": "testuser", "password": "WrongPass123!"},
        )

        assert response.status_code == 401
        assert "Invalid" in response.get_json()["error"]

    def test_login_nonexistent_user(self, client):
        """Test login with non-existent user."""
        response = client.post(
            "/auth/login",
            json={"username": "nonexistent", "password": "ValidPass123!"},
        )

        assert response.status_code == 401

    def test_login_missing_credentials(self, client):
        """Test login with missing credentials."""
        response = client.post(
            "/auth/login",
            json={"username": "testuser"},
        )

        assert response.status_code == 401


class TestAuthLogout:
    """Tests for /auth/logout endpoint."""

    def test_logout_success(self, authenticated_client):
        """Test successful logout."""
        response = authenticated_client.post("/auth/logout")

        assert response.status_code == 200
        assert "success" in response.get_json()["message"]

    def test_logout_unauthenticated(self, client):
        """Test logout without being logged in."""
        response = client.post("/auth/logout")

        # Auth blueprint redirects to login page for unauthenticated users
        assert response.status_code in (401, 302)


class TestAuthMe:
    """Tests for /auth/me endpoint."""

    def test_me_authenticated(self, authenticated_client):
        """Test getting current user when authenticated."""
        response = authenticated_client.get("/auth/me")

        assert response.status_code == 200
        data = response.get_json()
        assert data["username"] == "testuser"

    def test_me_unauthenticated(self, client):
        """Test getting current user when not authenticated."""
        response = client.get("/auth/me")

        # Auth blueprint redirects to login page for unauthenticated users
        assert response.status_code in (401, 302)
