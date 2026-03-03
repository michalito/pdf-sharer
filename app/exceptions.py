"""Custom application exceptions."""


class AppError(Exception):
    """Base exception for application errors."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(AppError):
    """Resource not found error."""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=404)


class ValidationError(AppError):
    """Validation error."""

    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class FileOperationError(AppError):
    """File operation error."""

    def __init__(self, message: str):
        super().__init__(message, status_code=500)


class AuthenticationError(AppError):
    """Authentication error."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status_code=401)


class AuthorizationError(AppError):
    """Authorization error - user doesn't have permission."""

    def __init__(self, message: str = "Access denied"):
        super().__init__(message, status_code=403)


class DuplicateDetectedError(AppError):
    """Content hash matches an existing item."""

    def __init__(self, message: str, duplicates: list[dict]):
        super().__init__(message, status_code=409)
        self.duplicates = duplicates
