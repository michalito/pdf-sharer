# CLAUDE.md

This file guides Claude Code when working in this repository.

Last verified against code: 2026-02-27.

## Project Snapshot

- App: `saita` internal file, folder, link, and note sharing
- Backend: Flask, SQLAlchemy, Alembic
- Frontend: React + TypeScript + Vite
- Deployment: Docker Compose via `./deploy.sh`
- Trust model: internal network, no authentication by design

## Commands

Primary workflow uses `./deploy.sh`:

```bash
# Development (hot reload: backend + frontend)
./deploy.sh dev
./deploy.sh dev down
./deploy.sh dev restart

# Production
./deploy.sh prod
./deploy.sh prod down
./deploy.sh prod restart

# Runtime and diagnostics
./deploy.sh status
./deploy.sh logs
./deploy.sh logs 100
./deploy.sh shell
./deploy.sh stop
./deploy.sh rebuild

# Database
./deploy.sh migrate
./deploy.sh migrate create "message"
./deploy.sh migrate downgrade
./deploy.sh migrate history

# Cleanup and maintenance
./deploy.sh cleanup containers|volumes|images|all
./deploy.sh prune-orphans --dry-run
./deploy.sh prune-orphans
```

Useful local checks:

```bash
pytest
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Port note: host port defaults to `5001` (`HOST_PORT` can override).

## Architecture

Layered backend (`Routes -> Services -> Repositories -> DB`):

```text
app/
  api/routes.py               # REST API under /api
  web/routes.py               # "/" and public "/d/<id>" share route
  services/item_service.py    # Upload, zip, delete/state logic
  repositories/item_repository.py
  domain/item.py              # Item, ItemKind, ItemState
  config.py                   # Config dataclass and env mapping
  logging_config.py
  exceptions.py
```

Factory pattern: `app/__init__.py:create_app()`.

## Current API Contract

- `GET /api/health`
- `GET /api/items` with optional `q`, `kind`, `state`, `page`, `per_page`
- `POST /api/items/files` (multipart field `files`, repeatable)
- `POST /api/items/folder` (multipart: repeatable `files` + repeatable `paths`)
- `POST /api/items/link` (JSON: `{"url":"https://...","name?":"optional label"}`)
- `POST /api/items/note` (JSON: `{"text":"...","title?":"optional title"}`)
- `GET /api/items/<id>`
- `PATCH /api/items/<id>` with JSON `{"state":"active|done|archived|ready_to_delete"}`
- `GET /api/items/<id>/download`
- `DELETE /api/items/<id>` only when item state is `ready_to_delete`
- `DELETE /api/items/ready-to-delete` (optional `q`, `kind`)
- `GET /d/<id>` (public/internal stable share link: download file/folder, redirect link, render note)

Note payload behavior:
- List endpoint (`GET /api/items`) returns note summaries via `noteExcerpt`
- Detail endpoint (`GET /api/items/<id>`) returns full note body in `noteText` (and includes `noteExcerpt`)
- Search query `q` matches item names and note body text

## Important Behavioral Details

- Stored filenames are UUID-based (`<uuid><ext>` for files, `<uuid>.zip` for folder uploads).
- Folder upload zips are created server-side with zip-path sanitization and de-duplication.
- Request IDs: middleware sets `g.request_id` and always returns `X-Request-ID`.
- Delete behavior is intentionally two-step (`PATCH` to `ready_to_delete`, then `DELETE`).
- `entrypoint.sh` runs migrations on container start.

## Configuration Details

- `FLASK_ENV=production` -> `Config.from_env()` (uses env vars like `DATABASE_URL`, `UPLOAD_FOLDER`).
- Any non-production env -> `Config.for_development()` (uses local defaults for DB and upload path).
Main env knobs:
- `SECRET_KEY` (optional; generated if absent in production config path)
- `DATABASE_URL`
- `UPLOAD_FOLDER`
- `MAX_CONTENT_LENGTH` (default `2147483648`)
- `NOTE_EXCERPT_LENGTH` (default `180`, bounded `40..1000`)
- `HOST_PORT` (Docker host mapping, default `5001`)

## When Changing Code

Keep these aligned:

1. API backend (`app/api/routes.py`) and frontend client (`frontend/src/api/items.ts`).
2. Data model and migration files when schema changes.
3. Operational docs: `README.md`, `AGENTS.md`, and this file.
