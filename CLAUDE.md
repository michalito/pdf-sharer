# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Last verified against code: 2026-02-27.

## Project Snapshot

- App: `saita` — internal file, folder, link, and note sharing
- Backend: Flask, SQLAlchemy, Alembic
- Frontend: React + TypeScript + Vite (TanStack Query for server state)
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

Local checks (outside Docker):

```bash
# Backend tests
pytest                                          # all tests
pytest tests/integration/test_items_api.py      # one file
pytest tests/unit/test_zip_utils.py::test_sanitize_rejects_parent_traversal  # one test
pytest -k "test_search"                         # substring match

# Frontend
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend run test                  # vitest single pass
npm --prefix frontend run test:watch            # vitest watch mode
```

Port note: host port defaults to `5001` (`HOST_PORT` can override). Dev frontend runs on `5173` and proxies API to Flask.

## Architecture

### Backend

Layered: `Routes -> Services -> Repositories -> DB`

```text
app/
  __init__.py                   # create_app() factory; registers blueprints, request hooks
  api/routes.py                 # REST API under /api
  web/routes.py                 # "/" SPA fallback + "/d/<id>" share route
  services/item_service.py      # Upload, zip, delete/state logic, validation limits
  repositories/item_repository.py
  domain/item.py                # Item model, ItemKind, ItemState, to_dto()
  config.py                     # Config dataclass (from_env / for_development)
  constants.py                  # Upload size, note excerpt bounds
  exceptions.py                 # AppError hierarchy (NotFoundError, ValidationError, etc.)
  error_handlers.py             # register_error_handlers() — called on both blueprints
  logging_config.py             # JSON logging in prod, plain text in dev
  utils/zip_utils.py            # sanitize_zip_path(), dedupe_zip_path()
  cli.py                        # flask prune-orphans command
```

Key patterns:
- **Per-request DI**: `before_request` hook creates `g.item_service`; routes call `_get_service()`. Tests override via `app.config["ITEM_SERVICE_OVERRIDE"]`.
- **Request IDs**: middleware sets `g.request_id` (from `X-Request-ID` header or new UUID), returned on every response.
- **Serialization**: `Item.to_dto()` on the model handles all DTO conversion. Protected locked items hide `linkUrl`/`noteText`/`noteExcerpt` and expose `isPasswordProtected` + `isPasswordUnlocked`.
- **meta_json column**: Links store `{"url": "..."}`, notes store `{"text": "..."}`, folders store `{"file_count": N, "top_level_dir": "..."}`.
- **Session unlocks**: Per-item unlock state is tracked in signed Flask session cookies (`app/services/item_access.py`).

### Frontend

Single-page app — **no client-side router**. `App.tsx` is the sole root component.

- **Server state**: TanStack Query (`useQuery`/`useMutation`). Query key for items: `["items", { q, kind, state, page, perPage }]`.
- **Uploads**: Use raw `XMLHttpRequest` (via `xhrForm()` in `api/items.ts`) for progress tracking. JSON endpoints use `fetch` via `apiJson()`.
- **Styling**: Tailwind CSS, dark/light theme via `useTheme` hook (localStorage-persisted).
- **No global state store** — all local UI state is `useState` in `App.tsx`.

## Current API Contract

- `GET /api/health` (returns `{"ok": true, "version": "<app-version>"}`)
- `GET /api/items` with optional `q`, `kind`, `state`, `protected`, `page`, `per_page`
- `POST /api/items/files` (multipart field `files`, repeatable; optional `password`)
- `POST /api/items/folder` (multipart: repeatable `files` + repeatable `paths`; optional `password`)
- `POST /api/items/link` (JSON: `{"url":"https://...","name?":"optional label","password?":"optional password"}`)
- `POST /api/items/note` (JSON: `{"text":"...","title?":"optional title","password?":"optional password"}`)
- `GET /api/items/<id>`
- `POST /api/items/<id>/unlock` (JSON: `{"password":"..."}`)
- `PATCH /api/items/<id>` with JSON `{"state?":"active|done|archived|ready_to_delete","spaceId?":1,"pinned?":true}` (at least one field required)
- `GET /api/items/<id>/download`
- `DELETE /api/items/<id>` only when item state is `ready_to_delete`
- `DELETE /api/items/ready-to-delete` (optional `q`, `kind`, `protected`)
- `GET /d/<id>` (public share link: download file/folder, redirect link, render note, or show password prompt)
- `POST /d/<id>` (submit password for protected share links)

Note payload behavior:
- List endpoint (`GET /api/items`) returns note summaries via `noteExcerpt`
- Detail endpoint (`GET /api/items/<id>`) returns full note body in `noteText` (and includes `noteExcerpt`)
- Search query `q` matches item names and unprotected note body text (protected notes match by title only)

## Important Behavioral Details

- Stored filenames are UUID-based (`<uuid><ext>` for files, `<uuid>.zip` for folder uploads).
- Folder upload zips are created server-side with zip-path sanitization and de-duplication.
- Delete behavior is intentionally two-step (`PATCH` to `ready_to_delete`, then `DELETE`).
- `entrypoint.sh` runs migrations on every container start (zero-touch schema updates).
- Migration files use manual prefixes (`0001_`, `0002_`) instead of Alembic hex IDs.
- Service validation limits: display name 255 chars, link URL 2048, note title 120, note text 4000.

## Testing

Backend fixtures (`tests/conftest.py`): `app` creates a full Flask app with in-memory SQLite and temp upload dir; `client` is the Flask test client. Each test gets a fresh DB via `create_all`/`drop_all`.

Frontend tests (`frontend/src/test/`): Vitest + jsdom + Testing Library. API module is mocked via `vi.mock()`.

## Configuration

- `FLASK_ENV=production` → `Config.from_env()` (reads `DATABASE_URL`, `UPLOAD_FOLDER`, etc.) and **requires** `SECRET_KEY`.
- Any other `FLASK_ENV` → `Config.for_development()` (local SQLite defaults)
- Keep `SECRET_KEY` stable across production restarts/deploys to preserve protected-item unlock sessions.
- Key env vars: `SECRET_KEY`, `DATABASE_URL`, `UPLOAD_FOLDER`, `MAX_CONTENT_LENGTH` (default 2GB), `NOTE_EXCERPT_LENGTH` (default 180, bounded 40..1000), `APP_VERSION` (health/UI version string; auto-detected from latest git tag by `deploy.sh`, fallback `dev`), `HOST_PORT` (default 5001)

## When Changing Code

Keep these aligned:

1. API backend (`app/api/routes.py`) and frontend client (`frontend/src/api/items.ts`).
2. Data model and migration files when schema changes.
3. Operational docs: `README.md`, `AGENTS.md`, and this file.
