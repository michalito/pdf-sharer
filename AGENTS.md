# AGENTS.md

Repository guide for coding agents working in this project.

## Project Summary

- Name: `saita` (internal file/folder sharing app)
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
```

Direct local checks (outside Docker) when needed:

```bash
pytest
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## Operational Facts (Important)

- Default host port is `5001` (`HOST_PORT` override supported).
- Public share links are served at `/d/<id>`.
- Deletion workflow is strict: `DELETE /api/items/<id>` only works when item state is `ready_to_delete`.
- Bulk cleanup exists at `DELETE /api/items/ready-to-delete`.
- Folder uploads are zipped server-side with zip path sanitization (`app/utils/zip_utils.py`).
- Every request gets `X-Request-ID` (incoming value reused if provided).

## API Surface (Current)

- `GET /api/health`
- `GET /api/items` with optional `q`, `kind`, `state`, `page`, `per_page`
- `POST /api/items/files`
- `POST /api/items/folder`
- `GET /api/items/<id>`
- `PATCH /api/items/<id>` with body `{"state":"active|done|archived|ready_to_delete"}`
- `GET /api/items/<id>/download`
- `DELETE /api/items/<id>` (requires `ready_to_delete`)
- `DELETE /api/items/ready-to-delete`
- `GET /d/<id>`

## Config Gotchas

- `FLASK_ENV=production` uses `Config.from_env()` and honors `DATABASE_URL`, `UPLOAD_FOLDER`, etc.
- Any non-production `FLASK_ENV` uses `Config.for_development()`, which currently fixes DB path and upload folder to local defaults.
- `MAX_CONTENT_LENGTH` default is `2147483648` (2GB).

## Change Checklist For Agents

When changing behavior, keep these in sync:

1. API contract: backend routes + `frontend/src/api/items.ts` + `README.md`.
2. Data model changes: SQLAlchemy model + Alembic migration(s) + impacted tests.
3. Operational commands/config: `deploy.sh`, compose files, `.env.example`, and docs (`AGENTS.md`, `CLAUDE.md`).
