"""Flask application factory and extensions."""

import logging
from pathlib import Path
from typing import Optional

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

from app.config import Config, get_config


# Extensions
db = SQLAlchemy()
migrate = Migrate()


def _configure_logging(app: Flask) -> None:
    """Configure application logging."""
    log_level = logging.DEBUG if app.debug else logging.INFO

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Reduce noise from werkzeug in production
    if not app.debug:
        logging.getLogger("werkzeug").setLevel(logging.WARNING)


def _ensure_directories(config: Config) -> None:
    """Ensure required directories exist."""
    config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

    # Ensure instance directory exists for SQLite
    if "sqlite" in config.DATABASE_URI:
        db_path = config.DATABASE_URI.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)


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

    # Import models for migrations
    from app.domain import models  # noqa: F401

    # Register blueprints
    from app.api import api
    from app.web import web

    app.register_blueprint(api)
    app.register_blueprint(web)

    app.logger.info("Application initialized successfully")

    return app
