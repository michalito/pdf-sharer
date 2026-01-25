"""API route definitions."""

import logging
from typing import Any

from flask import jsonify, request, send_file, Response

from app.api import api
from app.domain.models import PDFStatus
from app.exceptions import AppError, ValidationError
from app.services.pdf_service import PDFService


logger = logging.getLogger(__name__)

# Service instance - in a larger app, use dependency injection
_pdf_service = PDFService()


def _get_service() -> PDFService:
    """Get the PDF service instance."""
    return _pdf_service


@api.errorhandler(AppError)
def handle_app_error(error: AppError) -> tuple[Response, int]:
    """Handle application errors."""
    logger.warning(f"Application error: {error.message}")
    return jsonify({"error": error.message}), error.status_code


@api.errorhandler(ValueError)
def handle_value_error(error: ValueError) -> tuple[Response, int]:
    """Handle value errors as validation errors."""
    logger.warning(f"Value error: {error}")
    return jsonify({"error": str(error)}), 400


@api.errorhandler(Exception)
def handle_generic_error(error: Exception) -> tuple[Response, int]:
    """Handle unexpected errors."""
    logger.exception(f"Unexpected error: {error}")
    return jsonify({"error": "An unexpected error occurred"}), 500


@api.route("/pdfs", methods=["GET"])
def list_pdfs() -> Response:
    """
    List all PDFs.

    Query Parameters:
        status: Optional filter by status (unprocessed, processed)

    Returns:
        JSON array of PDF objects
    """
    service = _get_service()

    status_filter = request.args.get("status")
    status = None

    if status_filter:
        try:
            status = PDFStatus.from_string(status_filter)
        except ValueError as e:
            raise ValidationError(str(e))

    pdfs = service.get_all_pdfs(status)
    return jsonify([pdf.to_dict() for pdf in pdfs])


@api.route("/pdfs", methods=["POST"])
def upload_pdf() -> tuple[Response, int]:
    """
    Upload a new PDF.

    Request Body:
        multipart/form-data with 'file' field

    Returns:
        Created PDF object with 201 status
    """
    service = _get_service()

    if "file" not in request.files:
        raise ValidationError("No file provided in request")

    file = request.files["file"]
    pdf = service.upload_pdf(file)

    return jsonify(pdf.to_dict()), 201


@api.route("/pdfs/<int:pdf_id>", methods=["GET"])
def get_pdf(pdf_id: int) -> Response:
    """
    Download a PDF file.

    Args:
        pdf_id: The PDF ID

    Returns:
        The PDF file as an attachment
    """
    service = _get_service()

    pdf = service.get_pdf(pdf_id)
    file_path = service.get_pdf_path(pdf)

    return send_file(
        file_path,
        as_attachment=True,
        download_name=pdf.original_filename,
    )


@api.route("/pdfs/<int:pdf_id>", methods=["PATCH"])
def update_pdf(pdf_id: int) -> Response:
    """
    Update a PDF's status.

    Args:
        pdf_id: The PDF ID

    Request Body:
        JSON with 'status' field

    Returns:
        Updated PDF object
    """
    service = _get_service()

    data = request.get_json()
    if not data or "status" not in data:
        raise ValidationError("Missing 'status' field in request body")

    try:
        status = PDFStatus.from_string(data["status"])
    except ValueError as e:
        raise ValidationError(str(e))

    pdf = service.update_status(pdf_id, status)
    return jsonify(pdf.to_dict())


@api.route("/pdfs/<int:pdf_id>", methods=["DELETE"])
def delete_pdf(pdf_id: int) -> tuple[Response, int]:
    """
    Delete a PDF.

    Args:
        pdf_id: The PDF ID

    Returns:
        Empty response with 204 status
    """
    service = _get_service()
    service.delete_pdf(pdf_id)
    return jsonify({}), 204
