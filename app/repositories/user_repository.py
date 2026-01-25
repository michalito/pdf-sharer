"""User repository for data access operations."""

from typing import Optional

from app import db
from app.domain.user import User


class UserRepository:
    """Repository for User data access operations."""

    def get_by_id(self, user_id: int) -> Optional[User]:
        """
        Get a user by ID.

        Args:
            user_id: The user ID

        Returns:
            User object or None if not found
        """
        return db.session.get(User, user_id)

    def get_by_username(self, username: str) -> Optional[User]:
        """
        Get a user by username.

        Args:
            username: The username

        Returns:
            User object or None if not found
        """
        return User.query.filter_by(username=username).first()

    def username_exists(self, username: str) -> bool:
        """
        Check if a username is already taken.

        Args:
            username: The username to check

        Returns:
            True if username exists, False otherwise
        """
        return User.query.filter_by(username=username).first() is not None

    def create(self, username: str, password: str) -> User:
        """
        Create a new user.

        Args:
            username: The username
            password: The plain-text password (will be hashed)

        Returns:
            Created User object
        """
        user = User(username=username)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        return user

    def delete(self, user: User) -> None:
        """
        Delete a user.

        Args:
            user: The user to delete
        """
        db.session.delete(user)
        db.session.commit()
