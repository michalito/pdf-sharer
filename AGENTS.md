# AGENTS.md

Repository guide for coding agents working in this project.

## Project Summary

- Name: `saita` (internal file/folder/link/note sharing app)
- Backend: Flask + SQLAlchemy + Alembic
- Frontend: React + TypeScript + Vite
- Runtime: Docker Compose (`docker-compose.yaml` for prod, `docker-compose.dev.yaml` for dev)
- Security model: trusted internal network, intentionally no authentication

## Source Of Truth

When docs and code disagree, trust code in:

- Backend API: `app/api/routes.py`
- Business rules: `app/services/item_service.py`
- Config behavior: `app/config.py`
- Deployment behavior: `deploy.sh`, `docker-compose*.yaml`, `entrypoint.sh`
- Frontend API usage: `frontend/src/api/items.ts`

## Fast Start Commands

Use the deploy script for normal operations:

```bash
# Development (backend + frontend, hot reload)
./deploy.sh dev
./deploy.sh dev down

# Production
./deploy.sh prod
./deploy.sh prod down

# Common ops
./deploy.sh status
./deploy.sh logs
./deploy.sh migrate
./deploy.sh migrate create "message"
./deploy.sh prune-orphans --dry-run
./deploy.sh expire-items --dry-run
```

Direct local checks (outside Docker) when needed:

```bash
pytest
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## Operational Facts (Important)

- Default host port is `5001` (`HOST_PORT` override supported).
- Public share links are served at `/d/<id>` and resolve by kind:
  - file/folder: direct download
  - link: HTTP redirect to target URL
  - note: rendered note page
  - protected item: password prompt first (session unlock)
- Search behavior (`q` on `GET /api/items`) matches item names and unprotected note body text.
- Note payload shape:
  - `GET /api/items` returns note summaries (`noteExcerpt`)
  - `GET /api/items/<id>` returns full `noteText` (and `noteExcerpt`)
- Deletion workflow is strict: `DELETE /api/items/<id>` only works when item state is `ready_to_delete`.
- Bulk cleanup exists at `DELETE /api/items/ready-to-delete`.
- Expired TTL cleanup is operationally scheduled via `flask expire-items` / `./deploy.sh expire-items`; requests do not perform background cleanup.
- Folder uploads are zipped server-side with zip path sanitization (`app/utils/zip_utils.py`).
- Every request gets `X-Request-ID` (incoming value reused if provided).
- `GET /api/health` returns `{"ok": true, "version": "<app-version>"}`.

## API Surface (Current)

- `GET /api/health` (returns `ok` + `version`)
- `GET /api/items` with optional `q`, `kind`, `state`, `protected`, `sort` (`name|size|created|modified`, default `created`), `order` (`asc|desc`, default `desc`), `page`, `per_page`
- `POST /api/items/files`
- `POST /api/items/folder`
- `POST /api/items/link`
- `POST /api/items/note`
- `GET /api/items/<id>`
- `POST /api/items/<id>/unlock`
- `PATCH /api/items/<id>` with body `{"state?":"...", "spaceId?":1, "pinned?":true}` (bumps `updatedAt`)
- `GET /api/items/<id>/download`
- `DELETE /api/items/<id>` (requires `ready_to_delete`)
- `DELETE /api/items/ready-to-delete` (optional `q`, `kind`, `protected`)
- `GET /d/<id>`
- `POST /d/<id>`

## Config Gotchas

- `FLASK_ENV=production` uses `Config.from_env()` and honors `DATABASE_URL`, `UPLOAD_FOLDER`, etc.
- `SECRET_KEY` is required in production (`Config.from_env()` raises if missing). Keep it stable across restarts, otherwise protected-item unlock sessions are invalidated.
- `SESSION_COOKIE_SECURE` defaults to `false`; set it explicitly to `true` when serving the app over HTTPS and you want unlock-session cookies to be transport-secure.
- Any non-production `FLASK_ENV` uses `Config.for_development()`, which currently fixes DB path and upload folder to local defaults.
- `MAX_CONTENT_LENGTH` default is `2147483648` (2GB).
- `NOTE_EXCERPT_LENGTH` controls note preview length in `GET /api/items` and is bounded to `40..1000` (default `180`).
- `TRUST_PROXY_HOPS` controls how many reverse-proxy hops are trusted for `X-Forwarded-For` when deriving client IP (`0` by default; set `1` for one proxy).
- `APP_VERSION` is exposed by `GET /api/health` and the UI footer; when unset, `deploy.sh` auto-detects from latest git tag (fallback `dev`).

## Change Checklist For Agents

When changing behavior, keep these in sync:

1. API contract: backend routes + `frontend/src/api/items.ts` + `README.md`.
2. Data model changes: SQLAlchemy model + Alembic migration(s) + impacted tests.
3. Operational commands/config: `deploy.sh`, compose files, `.env.example`, and docs (`AGENTS.md`, `CLAUDE.md`).
