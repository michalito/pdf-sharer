"""Web routes for serving HTML pages."""

from flask import render_template

from app.web import web
from app.exceptions import AppError


@web.route("/")
def index():
    """Serve the main application page."""
    return render_template("index.html")


@web.route("/login")
def login():
    """Serve the login page."""
    return render_template("login.html")


@web.errorhandler(AppError)
def handle_app_error(error: AppError):
    """Handle application errors."""
    return render_template(
        "error.html",
        error_code=error.status_code,
        error_message=error.message,
    ), error.status_code


@web.errorhandler(404)
def handle_not_found(error):
    """Handle 404 errors."""
    return render_template(
        "error.html",
        error_code=404,
        error_message="The page you're looking for doesn't exist.",
    ), 404


@web.errorhandler(500)
def handle_server_error(error):
    """Handle 500 errors."""
    return render_template(
        "error.html",
        error_code=500,
        error_message="Something went wrong on our end. Please try again later.",
    ), 500
