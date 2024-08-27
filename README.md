# PDF Sharer App

PDF Sharer is an open-source web application that allows users to upload, manage, and share PDF files by giving access to the app. It provides a simple and intuitive interface for organizing PDFs into processed and unprocessed categories.

## Features

- Upload PDF files
- Drag-and-drop functionality for file uploads and PDF management
- Categorize PDFs as processed or unprocessed
- Download PDFs
- Delete PDFs
- RESTful API for PDF management

## Tech Stack

- Backend: Flask (Python)
- Frontend: HTML, CSS, JavaScript
- Database: SQLite (default), compatible with other SQL databases
- ORM: SQLAlchemy
- Migrations: Alembic
- Containerization: Docker

## Prerequisites

- Python 3.7+
- pip
- Docker and Docker Compose (for containerized deployment)

## Installation and Setup

### Development Environment

1. Clone the repository:
   ```
   git clone https://github.com/michalito/pdf-sharer.git
   cd pdf-sharer
   ```

2. Create and activate a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
   ```

3. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   ```
   cp .env.example .env
   ```
   Edit the `.env` file and set the `SECRET_KEY` and other configuration variables as needed.

5. Initialize the database:
   ```
   flask db upgrade
   ```

6. Run the development server:
   ```
   flask run
   ```

The application will be available at `http://localhost:5000`.

### Production Environment

For production deployment, we recommend using Docker:

1. Build the Docker image:
   ```
   docker build -t pdf-sharer .
   ```

2. Create a `docker-compose.yml` file (if not already present) with the following content:
   ```yaml
   version: '3.8'

   services:
     web:
       build: .
       ports:
         - "5000:5000"
       volumes:
         - ./instance:/app/instance
         - ./uploads:/app/uploads
       environment:
         - FLASK_ENV=production
         - SECRET_KEY=${SECRET_KEY}
       restart: unless-stopped
   ```

3. Set up environment variables:
   ```
   cp .env.example .env
   ```
   Edit the `.env` file and set the `SECRET_KEY` and other production-specific variables.

4. Start the application:
   ```
   docker-compose up -d
   ```

The application will be available at `http://localhost:5000`. Configure your reverse proxy (e.g., Nginx) to forward requests to this port and handle SSL termination.

## API Documentation

The PDF Sharer App provides a RESTful API for PDF management. Here are the available endpoints:

- `GET /api/pdfs`: Retrieve all PDFs
- `POST /api/pdfs`: Upload a new PDF
- `GET /api/pdfs/<pdf_id>`: Download a specific PDF
- `POST /api/pdfs/<pdf_id>/process`: Update the status of a PDF
- `DELETE /api/pdfs/<pdf_id>`: Delete a specific PDF

For detailed API usage, please refer to the `main.py` file in the `routes` directory.

## Contributing

We welcome contributions to the PDF Sharer App! Please follow these steps to contribute:

1. Fork the repository
2. Create a new branch for your feature or bug fix
3. Make your changes and commit them with clear, descriptive messages
4. Push your changes to your fork
5. Submit a pull request to the main repository

Please ensure your code adheres to the project's coding standards and include tests for new features.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Security Considerations

- Ensure that the `SECRET_KEY` is kept secret and unique for each deployment
- Regularly update dependencies to patch any security vulnerabilities
- Implement proper input validation and sanitization to prevent security issues
- Use HTTPS in production to encrypt data in transit
- Regularly backup the database and uploaded files

## Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.





# Appendix
Project Structure

pdf_sharer/
   ├── app/
   │   ├── __init__.py
   │   ├── config.py
   │   ├── models/
   │   │   ├── __init__.py
   │   │   └── pdf.py
   │   ├── routes/
   │   │   ├── __init__.py
   │   │   └── main.py
   │   ├── services/
   │   │   ├── __init__.py
   │   │   └── pdf_service.py
   │   ├── static/
   │   │   └── css/
   │   │       └── styles.css
   │   └── templates/
   │       └── index.html
   ├── migrations/
   ├── tests/
   │   ├── __init__.py
   │   ├── test_models.py
   │   └── test_routes.py
   ├── .gitignore
   ├── alembic.ini
   ├── config.py
   ├── entrypoint.sh
   ├── requirements.txt
   └── run.py


To use the API for uploading, you can make a POST request to /api/pdfs with the PDF file in the request body. Here's an example using JavaScript's Fetch API:

```
javascriptCopyconst formData = new FormData();
formData.append('file', pdfFile);  // pdfFile is the File object

fetch('/api/pdfs', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```