"""Flask application factory and extensions."""

import uuid
from pathlib import Path
from typing import Optional

from flask import Flask, g, request
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from werkzeug.middleware.proxy_fix import ProxyFix

from app.config import Config, get_config


# Extensions
db = SQLAlchemy()
migrate = Migrate()


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


def _setup_request_handlers(app: Flask) -> None:
    """Set up request lifecycle handlers for dependency injection."""

    @app.before_request
    def add_request_id():
        """Add a unique request ID for correlation."""
        g.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

    @app.before_request
    def setup_services():
        """Create services for the request context."""
        from app.repositories.item_repository import ItemRepository
        from app.repositories.space_repository import SpaceRepository
        from app.services.item_service import ItemService
        from app.services.space_service import SpaceService

        # Allow test overrides
        if app.config.get("ITEM_SERVICE_OVERRIDE"):
            g.item_service = app.config["ITEM_SERVICE_OVERRIDE"]
        else:
            g.item_service = ItemService(ItemRepository())

        if app.config.get("SPACE_SERVICE_OVERRIDE"):
            g.space_service = app.config["SPACE_SERVICE_OVERRIDE"]
        else:
            g.space_service = SpaceService(SpaceRepository())

    @app.after_request
    def add_request_id_header(response):
        """Add request ID to response headers."""
        response.headers["X-Request-ID"] = getattr(g, "request_id", "-")
        return response


def _configure_proxy_fix(app: Flask) -> None:
    """Enable proxy-aware client IP handling when configured."""
    hops = app.config.get("TRUST_PROXY_HOPS", 0)
    try:
        trusted_hops = int(hops)
    except (TypeError, ValueError) as exc:
        raise ValueError("TRUST_PROXY_HOPS must be a non-negative integer") from exc

    if trusted_hops < 0:
        raise ValueError("TRUST_PROXY_HOPS must be a non-negative integer")

    if trusted_hops > 0:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=trusted_hops)
        app.logger.info(
            "ProxyFix enabled for X-Forwarded-For with %s trusted hop(s)",
            trusted_hops,
        )


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

    if "UNLOCK_THROTTLE" not in app.config:
        from app.constants import (
            UNLOCK_THROTTLE_COOLDOWN_SECONDS,
            UNLOCK_THROTTLE_MAX_ATTEMPTS,
            UNLOCK_THROTTLE_WINDOW_SECONDS,
        )
        from app.services.unlock_throttle import UnlockThrottle

        app.config["UNLOCK_THROTTLE"] = UnlockThrottle(
            max_attempts=UNLOCK_THROTTLE_MAX_ATTEMPTS,
            window_seconds=UNLOCK_THROTTLE_WINDOW_SECONDS,
            cooldown_seconds=UNLOCK_THROTTLE_COOLDOWN_SECONDS,
        )

    # Configure logging
    _configure_logging(app)
    _configure_proxy_fix(app)

    # Ensure directories exist
    _ensure_directories(config)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Set up dependency injection
    _setup_request_handlers(app)

    # Import models for migrations
    from app.domain import item  # noqa: F401
    from app.domain import space  # noqa: F401
    from app.domain import unlock_attempt  # noqa: F401

    # Register blueprints
    from app.api import api
    from app.web import web

    app.register_blueprint(api)
    app.register_blueprint(web)

    # Register CLI commands
    from app.cli import register_cli_commands
    register_cli_commands(app)

    app.logger.info("Application initialized successfully")

    return app
