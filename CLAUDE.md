# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Last verified against code: 2026-03-02.

## Project Snapshot

- App: `saita` — internal file, folder, link, and note sharing
- Backend: Flask, SQLAlchemy, Alembic
- Frontend: React + TypeScript + Vite (TanStack Query for server state)
- Deployment: Docker Compose via `./deploy.sh`; CI builds via GitHub Actions + `Dockerfile.ci`
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
./deploy.sh expire-items --dry-run
./deploy.sh expire-items
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

Layered: `Routes -> Presenter -> Services -> Repositories -> DB`

```text
app/
  __init__.py                     # create_app() factory; registers blueprints, request hooks
  api/routes.py                   # Item REST API under /api
  api/space_routes.py             # Space CRUD endpoints under /api/spaces
  api/item_presenter.py           # present_item_for_api() — access-policy masking for protected items
  web/routes.py                   # "/" SPA fallback + "/d/<id>" share route
  services/item_service.py        # Upload, zip, delete/state logic, validation limits
  services/space_service.py       # Space CRUD, name normalization, cascading unassign on delete
  services/item_access.py         # Per-item session unlock tracking (signed Flask cookies)
  repositories/item_repository.py
  repositories/space_repository.py
  domain/item.py                  # Item model, ItemKind, ItemState, to_dto()
  domain/space.py                 # Space model (name, normalized_name, item relationship)
  config.py                       # Config dataclass (from_env / for_development)
  constants.py                    # Upload size, note excerpt bounds, TTL presets
  exceptions.py                   # AppError hierarchy (NotFoundError, ValidationError, etc.)
  error_handlers.py               # register_error_handlers() — called on both blueprints
  logging_config.py               # JSON logging in prod, plain text in dev
  utils/zip_utils.py              # sanitize_zip_path(), dedupe_zip_path()
  utils/markdown.py               # Markdown→HTML via mistune (strikethrough, tables, task lists)
  cli.py                          # flask prune-orphans, flask expire-items commands
```

Key patterns:
- **Per-request DI**: `before_request` hook creates `g.item_service` and `g.space_service`; routes call `_get_service()` / `_get_space_service()`. Tests override via `app.config["ITEM_SERVICE_OVERRIDE"]`.
- **Request IDs**: middleware sets `g.request_id` (from `X-Request-ID` header or new UUID), returned on every response.
- **Presenter layer**: `item_presenter.present_item_for_api()` wraps `Item.to_dto()` and applies access-policy masking — protected locked items hide `linkUrl`/`noteText`/`noteExcerpt` and expose `isPasswordProtected` + `isPasswordUnlocked`.
- **meta_json column**: Links store `{"url": "..."}`, notes store `{"text": "..."}`, folders store `{"file_count": N, "top_level_dir": "..."}`.
- **Session unlocks**: Per-item unlock state is tracked in signed Flask session cookies (`app/services/item_access.py`).
- **Item expiration**: Optional `expires_at` column. Expired items are filtered from all queries immediately and are removed by the `flask expire-items` / `./deploy.sh expire-items` maintenance command.
- **Item position**: Optional `position` column for manual (drag-and-drop) ordering. New items get `max(position)+1`. Reorder endpoint requires an exact permutation of all active item IDs.

### Frontend

Single-page app — **no client-side router**. `App.tsx` is the sole root component.

- **Server state**: TanStack Query (`useQuery`/`useMutation`). Query key for items: `["items", { q, kind, state, space, sort, order, page, perPage }]`.
- **Uploads**: Use raw `XMLHttpRequest` (via `xhrForm()` in `api/items.ts`) for progress tracking. JSON endpoints use `fetch` via `apiJson()`.
- **Styling**: Tailwind CSS, dark/light theme via `useTheme` hook (localStorage-persisted).
- **Markdown notes**: Notes render as markdown via `MarkdownProse` component (`react-markdown` + `remark-gfm`). Server-side rendering also available via `app/utils/markdown.py` (mistune) for the `/d/<id>` share page.
- **No global state store** — all local UI state is `useState` in `App.tsx` (including space filter, upload dialog state, etc.).
- **PWA**: Installable as a standalone app. `manifest.webmanifest` in `frontend/public/` defines app metadata. Service worker generated by `vite-plugin-pwa` (Workbox `generateSW`) precaches built frontend assets and Google Fonts. Navigations fall back to `/static/index.html` for offline app-shell startup, with `/api` and `/d/*` excluded from fallback. SW registered manually in `main.tsx` at `/sw.js` (root scope via `serve_public`). No API caching. Theme-color meta tag updated dynamically by `useTheme` hook.

### Spaces

Spaces are named organizational groupings for items (one-to-many, optional). They are purely organizational — they don't affect sharing, passwords, or download behavior.

- Items can belong to one space or no space (`space_id` nullable FK).
- Space names have case-folded `normalized_name` for uniqueness.
- Deleting a space unassigns its items (sets `space_id=NULL`), does not delete them.
- Frontend `SpaceBar` component handles space filtering; `SpacePicker` handles space assignment during uploads.
- Space filter has three modes: "all" (no filter), "none" (unspaced items only), or a specific space ID.
- Validation: space name max 120 chars, no empty strings.

## Current API Contract

### Items
- `GET /api/items` with optional `q`, `kind`, `state`, `space` (ID or `none`), `protected`, `sort` (`name|size|created|modified|manual`, default `created`), `order` (`asc|desc`, default `desc`), `page`, `per_page` — response includes `countByState` (totals by state for the current filters, ignoring the `state` filter)
- `POST /api/items/files` (multipart field `files`, repeatable; optional `password`, `ttl`, `spaceId`)
- `POST /api/items/folder` (multipart: repeatable `files` + repeatable `paths`; optional `password`, `ttl`, `spaceId`)
- `POST /api/items/link` (JSON: `{"url":"https://...","name?":"...","password?":"...","ttl?":"1h|6h|24h|3d|7d|30d","spaceId?":1}`)
- `POST /api/items/note` (JSON: `{"text":"...","title?":"...","password?":"...","ttl?":"...","spaceId?":1}`)
- `GET /api/items/<id>`
- `POST /api/items/<id>/unlock` (JSON: `{"password":"..."}`)
- `PATCH /api/items/<id>` with JSON `{"state?":"active|done|archived|ready_to_delete","spaceId?":1,"pinned?":true}` (at least one field required; bumps `updatedAt`)
- `GET /api/items/<id>/download`
- `DELETE /api/items/<id>` only when item state is `ready_to_delete`
- `GET /api/items/order` with optional `space` (ID or `none`) — returns `{"orderedIds": [...]}`
- `PUT /api/items/reorder` (JSON: `{"orderedIds": [1, 3, 2, ...]}`) — returns `{"ok": true}`
- `DELETE /api/items/ready-to-delete` (optional `q`, `kind`, `protected`)

### Spaces
- `GET /api/spaces` — list all spaces with item counts
- `POST /api/spaces` (JSON: `{"name":"..."}`) — returns 201
- `PATCH /api/spaces/<id>` (JSON: `{"name":"..."}`) — rename
- `PUT /api/spaces/reorder` (JSON: `{"orderedIds": [3, 1, 2]}`) — reorders spaces by position
- `DELETE /api/spaces/<id>` — returns `{"unassigned": N}`

### Other
- `GET /api/health` (returns `{"ok": true, "version": "<app-version>", "limits": {"noteTextMaxChars": <max-note-length>}}`)
- `GET /api/storage` (returns `{disk, items: {totalCount, totalSizeBytes, countByKind, sizeByKind, countByState, sizeByState}, spaceStats: [{spaceId, spaceName, itemCount, sizeBytes}], largestItems}`)
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
- Service validation limits: display name 255 chars, link URL 2048, note title 120, note text configurable via `MAX_NOTE_TEXT_LENGTH` (default 100000), space name 120.
- **Item expiration (TTL)**: Items can optionally have an `expires_at` timestamp set at creation time from preset durations (`1h`, `6h`, `24h`, `3d`, `7d`, `30d`). Expired items are permanently deleted (DB row + disk file). Two-layer approach: (1) expired items are filtered from all queries immediately, (2) scheduled maintenance runs `flask expire-items` / `./deploy.sh expire-items` (with `--dry-run`, `--limit`). TTL is immutable after creation.

## Testing

Backend fixtures (`tests/conftest.py`): `app` creates a full Flask app with in-memory SQLite and temp upload dir; `client` is the Flask test client. Each test gets a fresh DB via `create_all`/`drop_all`. Coverage threshold: 80% (`pyproject.toml`).

Test files:
- `tests/integration/`: `test_items_api.py`, `test_spaces_api.py`, `test_storage_api.py`, `test_cli.py`
- `tests/unit/`: `test_zip_utils.py`, `test_item_presenter.py`, `test_markdown.py`, `test_config.py`, `test_item_access.py`
- `frontend/src/test/`: `App.test.tsx`, `StorageDashboard.test.tsx`, `MarkdownProse.test.tsx` (Vitest + jsdom + Testing Library, API mocked via `vi.mock()`)

## Configuration

- `FLASK_ENV=production` → `Config.from_env()` (reads `DATABASE_URL`, `UPLOAD_FOLDER`, etc.) and **requires** `SECRET_KEY`.
- Any other `FLASK_ENV` → `Config.for_development()` (local SQLite defaults)
- Keep `SECRET_KEY` stable across production restarts/deploys to preserve protected-item unlock sessions.
- Key env vars: `SECRET_KEY`, `DATABASE_URL`, `UPLOAD_FOLDER`, `MAX_CONTENT_LENGTH` (default 2GB), `MAX_NOTE_TEXT_LENGTH` (default 100000), `NOTE_EXCERPT_LENGTH` (default 180, bounded 40..1000), `TRUST_PROXY_HOPS` (default `0`; set `1` behind one reverse proxy), `SESSION_COOKIE_SECURE` (default `false`; set `true` explicitly for HTTPS-only unlock-session cookies), `APP_VERSION` (health/UI version string and part of `/api/health`; auto-detected from latest git tag by `deploy.sh`, fallback `dev`), `HOST_PORT` (default 5001)
- `.env.example` documents all production config options.

## CI/CD

GitHub Actions workflow (`.github/workflows/build-push.yaml`) builds the frontend natively, stages assets into `app/static/` and `app/templates/`, then uses `Dockerfile.ci` for an ARM64-optimized image build (skips redundant frontend build inside Docker).

## When Changing Code

Keep these aligned:

1. API backend (`app/api/routes.py`, `app/api/space_routes.py`) and frontend client (`frontend/src/api/items.ts`).
2. Data model and migration files when schema changes.
3. Presenter logic (`app/api/item_presenter.py`) when adding/removing fields from API responses.
4. Operational docs: `README.md`, `AGENTS.md`, and this file.
5. PWA manifest (`frontend/public/manifest.webmanifest`) when changing app name or theme colors.
