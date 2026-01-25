"""Web routes for serving HTML pages."""

from flask import render_template

from app.web import web


@web.route("/")
def index():
    """Serve the main application page."""
    return render_template("index.html")
