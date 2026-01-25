"""Flask application factory and extensions."""

import logging
import uuid
from pathlib import Path
from typing import Optional

from flask import Flask, g, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect

from app.config import Config, get_config


# Extensions
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
csrf = CSRFProtect()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)


def _configure_logging(app: Flask) -> None:
    """Configure application logging."""
    from app.logging_config import configure_logging

    # Use JSON logging in production
    use_json = not app.debug
    configure_logging(app, use_json=use_json)


def _ensure_directories(config: Config) -> None:
    """Ensure required directories exist."""
    config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

    # Ensure instance directory exists for SQLite
    if "sqlite" in config.DATABASE_URI:
        db_path = config.DATABASE_URI.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)


def _setup_login_manager(app: Flask) -> None:
    """Configure Flask-Login."""
    login_manager.login_view = "web.login"
    login_manager.login_message = "Please log in to access this page."
    login_manager.login_message_category = "info"

    @login_manager.user_loader
    def load_user(user_id: str):
        """Load a user by ID for Flask-Login."""
        from app.domain.user import User
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        """Handle unauthorized access for API requests."""
        from flask import jsonify, request
        if request.is_json or request.path.startswith("/api"):
            return jsonify({"error": "Authentication required"}), 401
        from flask import redirect, url_for
        return redirect(url_for("web.login"))


def _setup_request_handlers(app: Flask) -> None:
    """Set up request lifecycle handlers for dependency injection."""

    @app.before_request
    def add_request_id():
        """Add a unique request ID for correlation."""
        g.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

    @app.before_request
    def setup_services():
        """Create services for the request context."""
        from app.repositories.audit_repository import AuditRepository
        from app.repositories.pdf_repository import PDFRepository
        from app.repositories.user_repository import UserRepository
        from app.services.audit_service import AuditService
        from app.services.auth_service import AuthService
        from app.services.pdf_service import PDFService

        # Allow test overrides
        if app.config.get("PDF_SERVICE_OVERRIDE"):
            g.pdf_service = app.config["PDF_SERVICE_OVERRIDE"]
        else:
            g.pdf_service = PDFService(PDFRepository())

        if app.config.get("AUTH_SERVICE_OVERRIDE"):
            g.auth_service = app.config["AUTH_SERVICE_OVERRIDE"]
        else:
            g.auth_service = AuthService(UserRepository())

        if app.config.get("AUDIT_SERVICE_OVERRIDE"):
            g.audit_service = app.config["AUDIT_SERVICE_OVERRIDE"]
        else:
            g.audit_service = AuditService(AuditRepository())

    @app.after_request
    def add_request_id_header(response):
        """Add request ID to response headers."""
        response.headers["X-Request-ID"] = getattr(g, "request_id", "-")
        return response


def create_app(config: Optional[Config] = None) -> Flask:
    """
    Create and configure the Flask application.

    Args:
        config: Optional configuration object. If not provided,
                configuration is determined by environment.

    Returns:
        Configured Flask application
    """
    if config is None:
        config = get_config()

    app = Flask(__name__)
    app.config.from_mapping(config.to_flask_config())

    # Configure logging
    _configure_logging(app)

    # Ensure directories exist
    _ensure_directories(config)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)
    limiter.init_app(app)

    # Configure Flask-Login
    _setup_login_manager(app)

    # Set up dependency injection
    _setup_request_handlers(app)

    # Import models for migrations
    from app.domain import models  # noqa: F401
    from app.domain import user  # noqa: F401
    from app.domain import audit_log  # noqa: F401

    # Register blueprints
    from app.api import api
    from app.auth import auth
    from app.web import web

    app.register_blueprint(api)
    app.register_blueprint(auth)
    app.register_blueprint(web)

    # Register CLI commands
    from app.cli import register_cli_commands
    register_cli_commands(app)

    app.logger.info("Application initialized successfully")

    return app
