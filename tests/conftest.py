"""Pytest configuration and fixtures for PDF Sharer tests."""

import io
import tempfile
from pathlib import Path
from typing import Generator

import pytest
from flask import Flask
from flask.testing import FlaskClient
from werkzeug.datastructures import FileStorage

from app import create_app, db
from app.config import Config
from app.domain.models import PDF, PDFStatus
from app.domain.user import User


# Minimal valid PDF content
MINIMAL_PDF_CONTENT = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF"""


@pytest.fixture(scope="session")
def sample_pdf_bytes() -> bytes:
    """Minimal valid PDF file content."""
    return MINIMAL_PDF_CONTENT


@pytest.fixture(scope="function")
def temp_upload_dir() -> Generator[Path, None, None]:
    """Create a temporary upload directory for tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture(scope="function")
def test_config(temp_upload_dir: Path) -> Config:
    """Create a test configuration with in-memory SQLite."""
    return Config(
        SECRET_KEY="test-secret-key-for-testing-only",
        DATABASE_URI="sqlite:///:memory:",
        UPLOAD_FOLDER=temp_upload_dir,
        MAX_CONTENT_LENGTH=16 * 1024 * 1024,  # 16MB
        SESSION_COOKIE_SECURE=False,  # Disable for testing
    )


# Standard test password that meets complexity requirements
TEST_PASSWORD = "TestPass123!"


@pytest.fixture(scope="function")
def app(test_config: Config) -> Generator[Flask, None, None]:
    """Create and configure a test Flask application."""
    flask_app = create_app(test_config)
    flask_app.config["TESTING"] = True
    flask_app.config["WTF_CSRF_ENABLED"] = False
    flask_app.config["LOGIN_DISABLED"] = False

    # Create database tables
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.drop_all()


@pytest.fixture(scope="function")
def client(app: Flask) -> FlaskClient:
    """Create a test client."""
    return app.test_client()


@pytest.fixture(scope="function")
def runner(app: Flask):
    """Create a test CLI runner."""
    return app.test_cli_runner()


@pytest.fixture(scope="function")
def pdf_file_storage(sample_pdf_bytes: bytes) -> FileStorage:
    """Create a mock FileStorage object for file upload tests."""
    return FileStorage(
        stream=io.BytesIO(sample_pdf_bytes),
        filename="test_document.pdf",
        content_type="application/pdf",
    )


@pytest.fixture(scope="function")
def invalid_pdf_file_storage() -> FileStorage:
    """Create a FileStorage with invalid PDF content."""
    return FileStorage(
        stream=io.BytesIO(b"This is not a PDF file"),
        filename="fake.pdf",
        content_type="application/pdf",
    )


@pytest.fixture(scope="function")
def test_user(app: Flask) -> User:
    """Create a test user."""
    with app.app_context():
        user = User(username="testuser")
        user.set_password(TEST_PASSWORD)
        db.session.add(user)
        db.session.commit()
        db.session.refresh(user)
        return user


@pytest.fixture(scope="function")
def authenticated_client(app: Flask, client: FlaskClient, test_user: User) -> FlaskClient:
    """Create an authenticated test client."""
    with client:
        # Login the user
        with app.app_context():
            # Reload user in this context
            user = db.session.get(User, test_user.id)
            response = client.post(
                "/auth/login",
                json={"username": user.username, "password": TEST_PASSWORD},
            )
            assert response.status_code == 200
        return client


@pytest.fixture(scope="function")
def sample_pdf(app: Flask, temp_upload_dir: Path, sample_pdf_bytes: bytes, test_user: User) -> PDF:
    """Create a sample PDF record with an actual file."""
    with app.app_context():
        # Reload user
        user = db.session.get(User, test_user.id)

        # Create the actual file
        filename = "test_doc_12345678.pdf"
        file_path = temp_upload_dir / filename
        file_path.write_bytes(sample_pdf_bytes)

        # Create database record
        pdf = PDF(
            filename=filename,
            original_filename="test_doc.pdf",
            file_size=len(sample_pdf_bytes),
            status=PDFStatus.UNPROCESSED.value,
            user_id=user.id,
        )
        db.session.add(pdf)
        db.session.commit()

        # Refresh to get the ID
        db.session.refresh(pdf)

        return pdf


@pytest.fixture(scope="function")
def multiple_pdfs(app: Flask, temp_upload_dir: Path, sample_pdf_bytes: bytes, test_user: User) -> list[PDF]:
    """Create multiple sample PDF records."""
    with app.app_context():
        # Reload user
        user = db.session.get(User, test_user.id)

        pdfs = []
        for i in range(5):
            filename = f"test_doc_{i:08d}.pdf"
            file_path = temp_upload_dir / filename
            file_path.write_bytes(sample_pdf_bytes)

            status = PDFStatus.PROCESSED if i % 2 == 0 else PDFStatus.UNPROCESSED
            pdf = PDF(
                filename=filename,
                original_filename=f"test_doc_{i}.pdf",
                file_size=len(sample_pdf_bytes),
                status=status.value,
                user_id=user.id,
            )
            db.session.add(pdf)
            pdfs.append(pdf)

        db.session.commit()

        # Refresh all PDFs
        for pdf in pdfs:
            db.session.refresh(pdf)

        return pdfs
