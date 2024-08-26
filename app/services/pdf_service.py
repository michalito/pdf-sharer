import os
from werkzeug.utils import secure_filename
from app import db
from app.models.pdf import PDF
from flask import current_app

class PDFService:
    def get_all_pdfs(self):
        return PDF.query.all()

    def get_pdf(self, pdf_id):
        return PDF.query.get(pdf_id)

    def save_pdf(self, file):
        filename = secure_filename(file.filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        file.save(file_path)
        new_pdf = PDF(filename=filename)
        db.session.add(new_pdf)
        db.session.commit()
        return new_pdf

    def mark_as_processed(self, pdf_id):
        pdf = self.get_pdf(pdf_id)
        if pdf:
            pdf.status = 'Processed'
            db.session.commit()
        return pdf

    def get_pdf_path(self, pdf):
        return os.path.join(current_app.config['UPLOAD_FOLDER'], pdf.filename)

    def update_pdf_status(self, pdf_id, status):
        pdf = self.get_pdf(pdf_id)
        if pdf:
            pdf.status = status
            db.session.commit()
        return pdf