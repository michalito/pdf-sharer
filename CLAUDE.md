# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All operations use `./deploy.sh` with Docker:

```bash
# Development (hot-reload enabled)
./deploy.sh dev             # Start dev containers
./deploy.sh dev down        # Stop dev containers

# Production
./deploy.sh prod            # Build and start production containers
./deploy.sh prod down       # Stop containers
./deploy.sh rebuild         # Rebuild from scratch (no cache)
./deploy.sh status          # Show container health

# Database
./deploy.sh migrate         # Apply pending migrations
./deploy.sh migrate create "msg"  # Create new migration

# Utilities
./deploy.sh logs            # Follow container logs
./deploy.sh logs 100        # Last 100 lines
./deploy.sh shell           # Bash into container
./deploy.sh stop            # Stop any running containers
./deploy.sh cleanup all     # Remove containers, volumes, images

# Maintenance
./deploy.sh cleanup-deleted         # Remove soft-deleted PDFs older than 7 days
./deploy.sh cleanup-deleted --days=30  # Custom retention period
./deploy.sh cleanup-deleted --dry-run  # Preview without deleting
```

Note: Port 5001 is default to avoid macOS AirPlay conflict on 5000.

## Architecture

This is a Flask application for PDF upload/management using a clean layered architecture:

```
app/
├── api/          # REST API endpoints (Blueprint at /api)
├── auth/         # Authentication routes (Blueprint at /auth)
├── web/          # HTML page serving (Blueprint at /)
├── services/     # Business logic (PDFService, AuthService, AuditService)
├── repositories/ # Data access (PDFRepository, UserRepository, AuditRepository)
├── domain/       # Models and enums (PDF, PDFStatus, User, AuditLog)
├── logging_config.py  # Structured logging (JSON in production)
└── exceptions.py # Custom exceptions (AppError hierarchy)
```

**Request flow:** Routes → Services → Repositories → Database

- **API Blueprint** (`/api`): RESTful endpoints for PDF CRUD operations
- **Web Blueprint** (`/`): Serves the frontend SPA from templates
- **PDFService**: Business logic, file validation, unique filename generation
- **PDFRepository**: SQLAlchemy queries, abstracts database operations
- **PDF model**: SQLAlchemy model with `to_dict()` for JSON serialization

## Key Patterns

- Application factory pattern in `app/__init__.py` via `create_app()`
- Configuration via `Config` dataclass with `for_development()` and `from_env()` methods
- Custom exception hierarchy: `AppError` → `NotFoundError`, `ValidationError`, `FileOperationError`
- PDFs stored with UUID-suffixed filenames to prevent collisions (`{name}_{uuid16}.pdf`)
- Status enum: `PDFStatus.UNPROCESSED` / `PDFStatus.PROCESSED`
- Request ID middleware: Every request gets a unique ID (passed through via `X-Request-ID` header)
- Audit logging: All significant actions are logged to `audit_logs` table

## Security Features

- **CSRF Protection**: All routes require CSRF tokens (via `X-CSRFToken` header)
- **Rate Limiting**: Auth routes limited to 5 login attempts per minute
- **Secure Sessions**: HttpOnly, SameSite=Lax, Secure (in production) cookies

## Soft-Delete

PDFs are soft-deleted by default (marked with `deleted_at` timestamp):
- Deleted PDFs are hidden from listings but can be recovered
- Use `./deploy.sh cleanup-deleted --days=7` to permanently remove old deleted PDFs
- `deleted_at` column indexed for efficient queries

## Audit Logging

All significant actions are logged to `audit_logs` table:
- User actions: login, logout
- PDF actions: upload, download, status change, delete
- Each log includes: timestamp, request_id, user_id, IP, action, resource details
- Logs include request ID for correlation across multiple entries

## API Endpoints

```
GET    /api/pdfs            # List all (optional ?status= filter)
POST   /api/pdfs            # Upload (multipart/form-data, field: 'file')
GET    /api/pdfs/<id>       # Download
PATCH  /api/pdfs/<id>       # Update status (JSON: {"status": "processed"})
DELETE /api/pdfs/<id>       # Delete
```

## Environment Variables

- `SECRET_KEY` (required in production)
- `DATABASE_URL` (defaults to SQLite at `instance/pdfs.db`)
- `UPLOAD_FOLDER` (defaults to `uploads/`)
- `MAX_CONTENT_LENGTH` (defaults to 16MB)
- `FLASK_ENV` (set to `production` for production config)
