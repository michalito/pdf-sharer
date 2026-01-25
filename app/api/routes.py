"""API route definitions."""

import logging

from flask import g, jsonify, request, send_file, Response
from flask_login import current_user, login_required

from app import limiter
from app.api import api
from app.domain.models import PDFStatus
from app.error_handlers import register_error_handlers
from app.exceptions import ValidationError
from app.services.audit_service import AuditService
from app.services.pdf_service import PDFService


logger = logging.getLogger(__name__)

# Register all error handlers for this blueprint
register_error_handlers(api)


def _get_service() -> PDFService:
    """Get the PDF service from the request context."""
    return g.pdf_service


def _get_audit_service() -> AuditService:
    """Get the audit service from the request context."""
    return g.audit_service


def _get_user_id() -> int:
    """Get the current user's ID."""
    return current_user.id


@api.route("/pdfs", methods=["GET"])
@login_required
def list_pdfs() -> Response:
    """
    List all PDFs for the current user.

    Query Parameters:
        status: Optional filter by status (unprocessed, processed)
        page: Page number (default 1)
        per_page: Items per page (default 20, max 100)

    Returns:
        JSON object with items array and pagination info
    """
    service = _get_service()
    user_id = _get_user_id()

    # Parse status filter
    status_filter = request.args.get("status")
    status = None
    if status_filter:
        try:
            status = PDFStatus.from_string(status_filter)
        except ValueError as e:
            raise ValidationError(str(e))

    # Parse pagination params
    try:
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 20))
    except ValueError:
        raise ValidationError("Invalid pagination parameters")

    result = service.get_all_pdfs(
        status=status,
        user_id=user_id,
        page=page,
        per_page=per_page,
    )

    return jsonify({
        "items": [pdf.to_dict() for pdf in result.items],
        "pagination": result.to_dict(),
    })


@api.route("/pdfs", methods=["POST"])
@login_required
@limiter.limit("10 per minute")
def upload_pdf() -> tuple[Response, int]:
    """
    Upload a new PDF.

    Request Body:
        multipart/form-data with 'file' field

    Returns:
        Created PDF object with 201 status
    """
    service = _get_service()
    audit = _get_audit_service()
    user_id = _get_user_id()

    if "file" not in request.files:
        raise ValidationError("No file provided in request")

    file = request.files["file"]
    pdf = service.upload_pdf(file, user_id=user_id)

    audit.log_pdf_upload(user_id, pdf.id, pdf.original_filename)

    return jsonify(pdf.to_dict()), 201


@api.route("/pdfs/<int:pdf_id>", methods=["GET"])
@login_required
def get_pdf(pdf_id: int) -> Response:
    """
    Download a PDF file.

    Args:
        pdf_id: The PDF ID

    Returns:
        The PDF file as an attachment
    """
    service = _get_service()
    audit = _get_audit_service()
    user_id = _get_user_id()

    pdf = service.get_pdf(pdf_id, user_id=user_id)
    file_path = service.get_pdf_path(pdf)

    audit.log_pdf_download(user_id, pdf_id, pdf.original_filename)

    return send_file(
        file_path,
        as_attachment=True,
        download_name=pdf.original_filename,
    )


@api.route("/pdfs/<int:pdf_id>", methods=["PATCH"])
@login_required
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
    audit = _get_audit_service()
    user_id = _get_user_id()

    data = request.get_json()
    if not data or "status" not in data:
        raise ValidationError("Missing 'status' field in request body")

    try:
        status = PDFStatus.from_string(data["status"])
    except ValueError as e:
        raise ValidationError(str(e))

    # Get current PDF to capture old status
    old_pdf = service.get_pdf(pdf_id, user_id=user_id)
    old_status = old_pdf.status

    pdf = service.update_status(pdf_id, status, user_id=user_id)

    audit.log_pdf_status_change(user_id, pdf_id, old_status, status.value)

    return jsonify(pdf.to_dict())


@api.route("/pdfs/<int:pdf_id>", methods=["DELETE"])
@login_required
def delete_pdf(pdf_id: int) -> tuple[Response, int]:
    """
    Delete a PDF (soft-delete).

    Args:
        pdf_id: The PDF ID

    Returns:
        Empty response with 204 status
    """
    service = _get_service()
    audit = _get_audit_service()
    user_id = _get_user_id()

    # Get PDF info before deletion for audit log
    pdf = service.get_pdf(pdf_id, user_id=user_id)
    filename = pdf.original_filename

    service.delete_pdf(pdf_id, user_id=user_id)

    audit.log_pdf_delete(user_id, pdf_id, filename)

    return jsonify({}), 204
