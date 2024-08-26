from app import db
from datetime import datetime

class PDF(db.Model):
    __tablename__ = 'pdfs'
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default='Unprocessed')
    upload_date = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'status': self.status,
            'upload_date': self.upload_date.isoformat()
        }