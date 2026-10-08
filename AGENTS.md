# AGENTS.md

Quick-reference guide for contributors and AI coding assistants working in this project. For setup and PR conventions, see [CONTRIBUTING.md](CONTRIBUTING.md). For the deeper architecture walk-through, see [CLAUDE.md](CLAUDE.md).

## Project Summary

- Name: `saita` (internal file/folder/link/note sharing app)
- Backend: Flask + SQLAlchemy + Alembic
- Frontend: React + TypeScript + Vite
- Runtime: Docker Compose (`docker-compose.yaml` for prod, `docker-compose.dev.yaml` for dev)
- Security model: production Authentik forward auth with independently verified HS256 provider identity; public share links; local development without an IdP

## Source Of Truth

When docs and code disagree, trust code in:

- Backend API: `app/api/routes.py`
- Business rules: `app/services/item_service.py`
- Config behavior: `app/config.py`
- Deployment behavior: `deploy.sh`, `docker-compose*.yaml`, `entrypoint.sh`
- Frontend API usage: `frontend/src/api/items.ts`

## Agent Operating Rules

1. **Think Before Coding**: State assumptions explicitly. Ask rather than guess. Push back when a simpler approach exists. Stop when confused.
2. **Simplicity First**: Write the minimum code that solves the problem. Add nothing speculative. Treat architecture decisions as important, especially for refactors or larger updates/additions.
3. **Goal-Driven Execution**: Define success criteria. Loop until verified. Strong success criteria let agents work independently.
4. **Fail Loud**: "Completed" is wrong if anything was skipped silently. "Tests pass" is wrong if any were skipped. Surface uncertainty instead of hiding it.

## Fast Start Commands

Use the deploy script for normal operations:

```bash
# Development (backend + frontend, hot reload)
./deploy.sh dev
./deploy.sh dev down
./deploy.sh dev                  # in a worktree, auto-derives the instance name

# Production
./deploy.sh prod
./deploy.sh prod down

# Common ops
./deploy.sh status
./deploy.sh status --name kyoto
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

- Default backend host port is `5001` (`HOST_PORT` override supported).
- Default dev frontend host port is `5173` (`FRONTEND_PORT` override supported).
- In a non-primary git worktree, `./deploy.sh` auto-derives the instance name from the worktree directory and scopes Docker Compose resources to `saita-<worktree>`, which keeps branch/worktree DB and upload volumes isolated.
- `./deploy.sh --name <instance>` remains available as an explicit override.
- `./deploy.sh dev` auto-selects free backend/frontend ports for derived/named instances when the worktree `.env` does not already pin them, then saves them into that worktree’s `.env`.
- `./deploy.sh logs` can still retrieve logs for the scoped project after the `web` container has exited, as long as the Compose container still exists.
- Helper commands inspect the container's Compose config label to preserve its production/development mode; `rebuild` keeps that mode.
- Migrations run once in the container entrypoint. Dev/prod startup and rebuild wait for backend health and exit nonzero on failure; dev seeds only after the backend is healthy.
- Public share links are served at `/d/<id>` and resolve by kind:
  - file/folder: direct download
  - link: HTTP redirect to target URL
  - note: rendered note page
  - protected item: password prompt first (session unlock)
- Search behavior (`q` on `GET /api/items`) matches literal substrings in item names and unprotected note body text; `%`, `_`, and backslashes are literal, including during bulk deletion.
- Note payload shape:
  - `GET /api/items` returns note summaries (`noteExcerpt`)
  - `GET /api/items/<id>` returns full `noteText` (and `noteExcerpt`)
- Deletion workflow is strict: `DELETE /api/items/<id>` only works when item state is `ready_to_delete`.
- Bulk cleanup exists at `DELETE /api/items/ready-to-delete`.
- Expired TTL cleanup is operationally scheduled via `flask expire-items` / `./deploy.sh expire-items`; requests do not perform background cleanup.
- `prune-orphans` takes an exclusive upload-directory lock; uploads hold shared locks until their database commit, preventing cleanup from deleting in-flight uploads.
- SQLite foreign keys are enforced on application connections. Item and space IDs use AUTOINCREMENT to prevent future ID reuse; migration `0012` repairs existing dangling references.
- Folder uploads are zipped server-side with zip path sanitization (`app/utils/zip_utils.py`) and ZIP64 support for large entries.
- Every request gets `X-Request-ID` (incoming value reused if provided).
- `GET /api/health` is public and returns only `{"ok": true}`. Protected `/api/app-info` returns the version, runtime limits, and auth mode.
- Production requires explicit `AUTH_MODE=forward`, HTTPS `APP_ORIGIN`, issuer/client ID/group, and the dedicated proxy client-secret file. See [docs/forward-auth.md](docs/forward-auth.md). Never trust plain identity headers or broaden share/static bypasses.
- Authenticated mutations require the canonical `Origin` and `X-Saita-CSRF: 1`. Public password submissions keep their existing behavior.
- Spaces are organizational only. `space` filters accept a positive space ID or `none`; multipart upload uses `space_id`, while JSON APIs use `spaceId`.
- Manual item reordering uses `GET /api/items/order` for scoped/global reads, but `PUT /api/items/reorder` remains a global exact permutation of all active non-expired item IDs.

## API Surface (Current)

- `GET /api/health` (public `ok` only)
- `GET /api/app-info` (protected `ok`, `version`, `limits`, `authMode`)
- `GET /api/auth-required` (public fixed JSON 401 for ingress auth errors)
- `POST /api/auth/logout` (protected; clears Flask unlocks, returns the fixed outpost sign-out URL)
- `GET /api/storage`
- `GET /api/items` with optional `q`, `kind`, `state`, `space` (`<id>|none`), `protected`, `sort` (`name|size|created|modified|manual`, default `created`), `order` (`asc|desc`, default `desc`), `page`, `per_page`
- `POST /api/items/files` (multipart `files`; optional `password`, `space_id`, `ttl`, `force`)
- `POST /api/items/folder` (multipart `files` + `paths`; optional `password`, `space_id`, `ttl`, `force`)
- `POST /api/items/link`
- `POST /api/items/note`
- `GET /api/items/<id>`
- `POST /api/items/<id>/unlock`
- `PATCH /api/items/<id>` with body `{"state?":"...", "spaceId?":1, "pinned?":true}` (bumps `updatedAt`)
- `GET /api/items/<id>/download`
- `DELETE /api/items/<id>` (requires `ready_to_delete`)
- `GET /api/items/order` (optional `space`)
- `PUT /api/items/reorder` (global exact permutation of all active non-expired item IDs)
- `DELETE /api/items/ready-to-delete` (optional `q`, `kind`, `space`, `protected`)
- `GET /api/spaces`
- `POST /api/spaces`
- `PATCH /api/spaces/<id>`
- `PUT /api/spaces/reorder`
- `DELETE /api/spaces/<id>`
- `GET /d/<id>`
- `POST /d/<id>`

## Config Gotchas

- `FLASK_ENV=production` uses `Config.from_env()` and honors `DATABASE_URL`, `UPLOAD_FOLDER`, etc.
- `SECRET_KEY` is required in production (`Config.from_env()` raises if missing). Keep it stable across restarts, otherwise protected-item unlock sessions are invalidated.
- `SESSION_COOKIE_SECURE` defaults to `true` in production and `false` in development; forward mode requires `true`.
- `development`/`testing` `FLASK_ENV` uses `Config.for_development()`, which fixes DB path and upload folder to local defaults. Unknown environment names fail startup. Production images default to `production`.
- `MAX_CONTENT_LENGTH` default is `2147483648` (2GB).
- `MAX_NOTE_TEXT_LENGTH` controls maximum saved note body length and defaults to `100000`.
- `NOTE_EXCERPT_LENGTH` controls note preview length in `GET /api/items` and is bounded to `40..1000` (default `180`).
- `TRUST_PROXY_HOPS` controls how many reverse-proxy hops are trusted for `X-Forwarded-For` when deriving client IP (`0` by default; set `1` for one proxy).
- `APP_VERSION` and runtime limits are exposed by protected `GET /api/app-info` and the UI footer; when unset, `deploy.sh` auto-detects from latest git tag (fallback `dev`).
- `FRONTEND_PORT` only affects `./deploy.sh dev`; use it with `--name`/`HOST_PORT` to run multiple worktrees side by side.

## Change Checklist For Agents

When changing behavior, keep these in sync:

1. API contract: backend routes + `frontend/src/api/items.ts` + `README.md`.
2. Data model changes: SQLAlchemy model + Alembic migration(s) + impacted tests.
3. Operational commands/config: `deploy.sh`, compose files, `.env.example`, and docs (`AGENTS.md`, `CLAUDE.md`).
