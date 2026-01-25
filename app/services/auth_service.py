"""Authentication service for user management."""

import logging
from typing import Optional

from app.domain.user import User
from app.exceptions import AuthenticationError
from app.repositories.user_repository import UserRepository


logger = logging.getLogger(__name__)


class AuthService:
    """Service for authentication operations."""

    def __init__(self, repository: Optional[UserRepository] = None):
        """Initialize the service with a repository."""
        self.repository = repository or UserRepository()

    def authenticate(self, username: str, password: str) -> User:
        """
        Authenticate a user with username and password.

        Args:
            username: The username
            password: The password

        Returns:
            Authenticated User object

        Raises:
            AuthenticationError: If authentication fails
        """
        user = self.repository.get_by_username(username)

        if user is None or not user.check_password(password):
            logger.warning(f"Failed login attempt for username: {username}")
            raise AuthenticationError("Invalid username or password")

        logger.info(f"User authenticated: {username}")
        return user

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """
        Get a user by ID.

        Args:
            user_id: The user ID

        Returns:
            User object or None
        """
        return self.repository.get_by_id(user_id)
