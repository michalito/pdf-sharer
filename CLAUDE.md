# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All operations use `./deploy.sh` with Docker:

```bash
# Development (hot-reload enabled)
./deploy.sh dev             # Start dev containers (backend + frontend)
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
./deploy.sh prune-orphans --dry-run   # Preview orphaned upload files
./deploy.sh prune-orphans             # Delete orphaned upload files
```

Note: Port 5001 is default to avoid macOS AirPlay conflict on 5000.

## Architecture

This is a Flask application for internal file/folder sharing using a clean layered architecture:

```
app/
├── api/          # REST API endpoints (Blueprint at /api)
├── web/          # Serves the built React frontend + /d/<id> links
├── services/     # Business logic (ItemService)
├── repositories/ # Data access (ItemRepository)
├── domain/       # Models and enums (Item, ItemKind)
├── logging_config.py  # Structured logging (JSON in production)
└── exceptions.py # Custom exceptions (AppError hierarchy)
```

**Request flow:** Routes → Services → Repositories → Database

- **API Blueprint** (`/api`): RESTful endpoints for Item CRUD operations
- **Web Blueprint** (`/`): Serves the built frontend (production) and public downloads (`/d/<id>`)
- **ItemService**: File/folder upload, server-side zipping, disk operations
- **ItemRepository**: SQLAlchemy queries, pagination, persistence
- **Item model**: SQLAlchemy model with `to_dto()` for JSON responses

## Key Patterns

- Application factory pattern in `app/__init__.py` via `create_app()`
- Configuration via `Config` dataclass with `for_development()` and `from_env()` methods
- Custom exception hierarchy: `AppError` → `NotFoundError`, `ValidationError`, `FileOperationError`
- Stored filenames are UUID-based to avoid collisions (`<uuid4><ext>`; folders as `<uuid4>.zip`)
- Request ID middleware: Every request gets a unique ID (passed through via `X-Request-ID` header)
 
## Security Notes

- This app is intended for **trusted internal networks** and has **no auth**.
- Folder uploads use server-side zipping with path sanitization to prevent ZIP slip.

## API Endpoints

```
GET    /api/health                # Health
GET    /api/items                 # List items (?q=&kind=&page=&per_page=)
POST   /api/items/files           # Upload files (multipart, field: files)
POST   /api/items/folder          # Upload folder (multipart, files + paths)
GET    /api/items/<id>            # Metadata
GET    /api/items/<id>/download   # Download
DELETE /api/items/<id>            # Immediate delete
GET    /d/<id>                    # Public share link (download)
```

## Environment Variables

- `SECRET_KEY` (optional)
- `DATABASE_URL` (defaults to SQLite at `instance/sharer.db`)
- `UPLOAD_FOLDER` (defaults to `uploads/`)
- `MAX_CONTENT_LENGTH` (defaults to 2GB)
- `FLASK_ENV` (set to `production` for production config)
