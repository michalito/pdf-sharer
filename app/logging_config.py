"""Structured logging configuration."""

import json
import logging
from datetime import datetime, timezone

from flask import g, has_request_context


class RequestIdFilter(logging.Filter):
    """Filter that adds request_id to log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Add request_id to the log record."""
        if has_request_context():
            record.request_id = getattr(g, "request_id", "-")
        else:
            record.request_id = "-"
        return True


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging in production."""

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record as JSON."""
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }

        # Add location info
        if record.pathname:
            log_data["location"] = {
                "file": record.pathname,
                "line": record.lineno,
                "function": record.funcName,
            }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add any extra fields
        extra_fields = {
            key: value
            for key, value in record.__dict__.items()
            if key not in {
                "name", "msg", "args", "created", "filename", "funcName",
                "levelname", "levelno", "lineno", "module", "msecs",
                "pathname", "process", "processName", "relativeCreated",
                "stack_info", "exc_info", "exc_text", "thread", "threadName",
                "request_id", "message",
            }
        }
        if extra_fields:
            log_data["extra"] = extra_fields

        return json.dumps(log_data, default=str)


def configure_logging(app, use_json: bool = False) -> None:
    """
    Configure application logging.

    Args:
        app: Flask application
        use_json: If True, use JSON formatting (for production)
    """
    log_level = logging.DEBUG if app.debug else logging.INFO

    # Remove existing handlers
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create handler
    handler = logging.StreamHandler()
    handler.setLevel(log_level)

    # Add request ID filter
    handler.addFilter(RequestIdFilter())

    # Set formatter based on environment
    if use_json:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] %(message)s"
            )
        )

    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    # Reduce noise from werkzeug in production
    if not app.debug:
        logging.getLogger("werkzeug").setLevel(logging.WARNING)

    app.logger.info("Logging configured")
