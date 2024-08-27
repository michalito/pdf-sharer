import os
from werkzeug.utils import secure_filename
from app import db
from app.models.pdf import PDF
from flask import current_app

class PDFService:
    def get_all_pdfs(self):
        return PDF.query.order_by(PDF.upload_date.desc()).all()

    def get_pdf(self, pdf_id):
        return PDF.query.get(pdf_id)

    def save_pdf(self, file):
        filename = secure_filename(file.filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        file.save(file_path)
        new_pdf = PDF(filename=filename, status='Unprocessed')
        db.session.add(new_pdf)
        db.session.commit()
        return new_pdf

    def update_pdf_status(self, pdf_id, status):
        pdf = self.get_pdf(pdf_id)
        if pdf:
            pdf.status = status
            db.session.commit()
        return pdf

    def get_pdf_path(self, pdf):
        return os.path.join(current_app.config['UPLOAD_FOLDER'], pdf.filename)

    def delete_pdf(self, pdf_id):
        pdf = self.get_pdf(pdf_id)
        if pdf:
            file_path = self.get_pdf_path(pdf)
            if os.path.exists(file_path):
                os.remove(file_path)
            db.session.delete(pdf)
            db.session.commit()
            return True
        return False