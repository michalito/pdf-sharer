from flask import Blueprint, jsonify, request, send_file, current_app, render_template, redirect, url_for, flash
from werkzeug.utils import secure_filename
from app.services.pdf_service import PDFService
from werkzeug.exceptions import BadRequest, NotFound

main = Blueprint('main', __name__)
pdf_service = PDFService()

# Web routes
@main.route('/')
def index():
    pdfs = pdf_service.get_all_pdfs()
    return render_template('index.html', pdfs=pdfs)

@main.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        flash('No file part in the request', 'error')
        return redirect(url_for('main.index'))
    
    file = request.files['file']
    
    if file.filename == '':
        flash('No file selected for uploading', 'error')
        return redirect(url_for('main.index'))
    
    if file and file.filename.lower().endswith('.pdf'):
        try:
            pdf = pdf_service.save_pdf(file)
            flash(f'File {pdf.filename} uploaded successfully', 'success')
        except Exception as e:
            flash(f'Error uploading file: {str(e)}', 'error')
    else:
        flash('Invalid file type. Please upload a PDF.', 'error')
    
    return redirect(url_for('main.index'))

# API routes
@main.route('/api/pdfs', methods=['GET'])
def get_pdfs():
    pdfs = pdf_service.get_all_pdfs()
    return jsonify([pdf.to_dict() for pdf in pdfs])

@main.route('/api/pdfs', methods=['POST'])
def upload_pdf():
    if 'file' not in request.files:
        raise BadRequest('No file part in the request')
    file = request.files['file']
    if file.filename == '':
        raise BadRequest('No file selected for uploading')
    if not file.filename.lower().endswith('.pdf'):
        raise BadRequest('File must be a PDF')
    
    try:
        pdf = pdf_service.save_pdf(file)
        return jsonify(pdf.to_dict()), 201
    except Exception as e:
        raise BadRequest(f'Error uploading file: {str(e)}')

@main.route('/api/pdfs/<int:pdf_id>', methods=['GET'])
def download_pdf(pdf_id):
    pdf = pdf_service.get_pdf(pdf_id)
    if not pdf:
        raise NotFound('PDF not found')
    return send_file(pdf_service.get_pdf_path(pdf), as_attachment=True)

@main.route('/api/pdfs/<int:pdf_id>/process', methods=['POST'])
def process_pdf(pdf_id):
    data = request.json
    new_status = data.get('status', 'Processed')
    pdf = pdf_service.update_pdf_status(pdf_id, new_status)
    if not pdf:
        raise NotFound('PDF not found')
    return jsonify(pdf.to_dict())

@main.route('/api/pdfs/<int:pdf_id>', methods=['DELETE'])
def delete_pdf(pdf_id):
    if pdf_service.delete_pdf(pdf_id):
        return jsonify({"message": "PDF deleted successfully"}), 200
    else:
        raise NotFound('PDF not found')

@main.errorhandler(BadRequest)
@main.errorhandler(NotFound)
def handle_error(error):
    return jsonify(error=str(error)), error.code