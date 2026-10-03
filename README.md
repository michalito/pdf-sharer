# saíta

saíta is an internal web application for sharing **any type of file**, **zip archives**, **folders** (zipped by the server), **external links**, and **notes**. It is designed for deployment on a trusted internal network and intentionally has **no authentication**.

## Trust model

saíta is **designed for a trusted internal network and has no authentication by design**. Anyone with network access to the app can upload, download, and delete items. Do not expose it directly to the public internet. Per-item password protection exists for file/folder/link/note sharing via `/d/<id>`, but it is not a substitute for network-level access control.

## Features

- Upload any file type
- Upload folders (the server zips them into a single downloadable `.zip`)
- Save external URLs as shareable link items
- Save text notes as shareable note items
- Optional per-item password protection for files, folders, links, and notes
- Drag-and-drop upload for files
- Direct internal share links (`/d/<id>`) with “Copy Link”
- Workflow status: Active / Done / Archived / Ready to delete
- Safe deletion workflow (mark “Ready to delete”, then delete — per-item or bulk)
- Installable PWA with offline app-shell startup (no API offline caching)
- REST API for automation/integrations

## Quick Start (Docker)

```bash
./deploy.sh dev   # hot-reload (frontend + backend)
./deploy.sh prod  # single production container
```

Development:
- Frontend: `http://localhost:5173`
- API: `http://localhost:5001/api/health`

Production:
- UI + API: `http://localhost:5001`

> **Note:** Port 5001 is used by default to avoid conflict with macOS AirPlay Receiver on port 5000.

Run multiple branch/worktree instances side by side with the same command in each worktree:

```bash
./deploy.sh dev
```

When `deploy.sh` runs inside a non-primary git worktree, it automatically derives the Docker Compose project name from the worktree directory name, so each worktree gets its own containers and volumes. On the first `dev` start in that worktree, it also auto-selects free backend/frontend ports and saves them into that worktree’s `.env`. Stop or inspect one instance without touching the others:

```bash
./deploy.sh status
./deploy.sh logs
./deploy.sh dev down
```

`./deploy.sh logs` still resolves the scoped project when the `web` container has already exited, so startup and healthcheck crashes remain inspectable without restarting first.

## Folder uploads

Folder uploads stream ZIP64 entries when necessary, so individual files near the upload limit remain supported. Requests exceeding `MAX_CONTENT_LENGTH` return HTTP 413.

Folder uploads are supported via `webkitdirectory` (Chrome/Edge). The browser uploads the folder contents + relative paths; the server streams them into a zip archive and stores it as a single downloadable item.

## Environment Variables

Configure in `.env` (auto-created from `.env.example` when using `./deploy.sh prod`):

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Cookie signing key (**required in production**; keep stable across restarts for protected-item unlock sessions) | Required in production |
| `DATABASE_URL` | SQLite connection string (SQLite is the only supported DB backend currently) | SQLite at `instance/saita.db` |
| `UPLOAD_FOLDER` | File storage directory | `uploads/` |
| `MAX_CONTENT_LENGTH` | Max upload size in bytes | 2147483648 (2GB) |
| `MAX_NOTE_TEXT_LENGTH` | Max note body length in characters | 100000 |
| `NOTE_EXCERPT_LENGTH` | Max note preview length in list responses (bounded 40..1000) | 180 |
| `APP_VERSION` | Version string exposed by `GET /api/health` and shown in the UI footer. `deploy.sh` auto-detects from latest git tag when unset. | Latest git tag (fallback `dev`) |
| `HOST_PORT` | Docker host port | 5001 |
| `FRONTEND_PORT` | Dev frontend host port (`./deploy.sh dev` only) | 5173 |
| `TRUST_PROXY_HOPS` | Trusted reverse-proxy hops for `X-Forwarded-For` (set `1` for one proxy in front) | 0 |
| `SESSION_COOKIE_SECURE` | Marks the unlock-session cookie as HTTPS-only. Defaults to `false`; set it to `true` when serving over HTTPS. | `false` |

## Multi-Instance Dev

Use one git worktree per branch and start each worktree with the same command:

```bash
./deploy.sh dev
```

Recommended local port convention:

- default instance: backend `5001`, frontend `5173`
- first branch instance: backend `5003`, frontend `5175`
- next branch instance: backend `5004`, frontend `5176`

You can still pin ports explicitly when needed:

```bash
./deploy.sh dev --name kyoto --host-port 5003 --frontend-port 5175
```

You can still override the auto-derived instance name when needed:

```bash
./deploy.sh dev --name qa-preview
```

Named helper commands target only that instance:

```bash
./deploy.sh status --name kyoto
./deploy.sh shell --name kyoto
./deploy.sh migrate --name kyoto
./deploy.sh seed --name kyoto
./deploy.sh stop --name kyoto
./deploy.sh cleanup volumes --name kyoto
```

Helper commands detect the running container's production/development configuration, and `rebuild` preserves that mode. Migrations run in the container entrypoint; startup and rebuild wait for backend health and exit with an error if it fails. Development sample data is seeded after the backend becomes healthy.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (`{"ok": true, "version": "<app-version>", "limits": {"noteTextMaxChars": 100000}}`) |
| `GET` | `/api/storage` | Storage overview (`{disk, items: {totalCount, totalSizeBytes, countByKind, sizeByKind, countByState, sizeByState}, spaceStats: [{spaceId, spaceName, itemCount, sizeBytes}], largestItems}`) |
| `GET` | `/api/items` | List items (optional `?q=...&kind=file\|folder\|link\|note&state=active\|done\|archived\|ready_to_delete&space=<id>\|none&protected=true\|false&sort=name\|size\|created\|modified\|manual&order=asc\|desc&page=1&per_page=50`; `q` is a literal substring search over names and unprotected note body text (`%` and `_` are literal characters); note items include `noteExcerpt`, not full `noteText`; includes `contentHash`; default sort: `created` desc) |
| `POST` | `/api/items/files` | Upload files (multipart/form-data, field `files` repeatable; optional `password`, `space_id`, `ttl`, `force`; on duplicate returns `409` with `{code:"DUPLICATE_CONTENT"}` and includes `duplicates:[...]` only when no protected existing item is involved) |
| `POST` | `/api/items/folder` | Upload a folder (multipart: `files` + `paths` repeatable; optional `password`, `space_id`, `ttl`, `force`; on duplicate returns `409` with `{code:"DUPLICATE_CONTENT"}` and includes `duplicates:[...]` only when no protected existing item is involved) |
| `POST` | `/api/items/link` | Save a URL (JSON: `{"url":"https://...","name?":"optional label","password?":"optional password","spaceId?":1,"ttl?":"1h\|6h\|24h\|3d\|7d\|30d","force?":true}`; on duplicate returns `409` with `{code:"DUPLICATE_CONTENT"}` and includes `duplicates:[...]` only when no protected existing item is involved) |
| `POST` | `/api/items/note` | Save a note (JSON: `{"text":"...","title?":"optional title","password?":"optional password","spaceId?":1,"ttl?":"1h\|6h\|24h\|3d\|7d\|30d","force?":true}`; on duplicate returns `409` with `{code:"DUPLICATE_CONTENT"}` and includes `duplicates:[...]` only when no protected existing item is involved) |
| `GET` | `/api/items/<id>` | Fetch item metadata (adds `isPasswordProtected` + `isPasswordUnlocked`; hides `linkUrl`/`noteText`/`noteExcerpt`/`contentHash` while locked) |
| `PATCH` | `/api/items/<id>` | Update item (JSON: `{"state?":"done","spaceId?":1,"pinned?":true}`; at least one field required; bumps `updatedAt`) |
| `GET` | `/api/items/<id>/download` | Download a file/folder item |
| `POST` | `/api/items/<id>/unlock` | Unlock a protected item for current browser session (JSON: `{"password":"..."}`) |
| `DELETE` | `/api/items/<id>` | Delete an item (requires state `ready_to_delete`) |
| `GET` | `/api/items/order` | Get current manual item order (optional `?space=<id>\|none`; returns `{"orderedIds":[...]}`) |
| `PUT` | `/api/items/reorder` | Reorder active items (JSON: `{"orderedIds":[1,3,2]}` — must be an exact permutation of all active non-expired item IDs) |
| `DELETE` | `/api/items/ready-to-delete` | Bulk delete items in state `ready_to_delete` (optional filters: `?q=...&kind=file\|folder\|link\|note&space=<id>\|none&protected=true\|false`) |
| `GET` | `/api/spaces` | List all spaces with item counts, ordered by position |
| `POST` | `/api/spaces` | Create a space (JSON: `{"name":"..."}`) |
| `PATCH` | `/api/spaces/<id>` | Rename a space (JSON: `{"name":"..."}`) |
| `PUT` | `/api/spaces/reorder` | Reorder spaces (JSON: `{"orderedIds": [3, 1, 2]}` — must be an exact permutation of all space IDs) |
| `DELETE` | `/api/spaces/<id>` | Delete a space (unassigns its items, returns `{"unassigned": N}`) |
| `GET` | `/d/<id>` | Public share link (downloads file/folder, redirects link, renders note, or prompts for password if protected) |
| `POST` | `/d/<id>` | Submit password to unlock a protected public share link in the current session |

Duplicate detection is content-hash based across all item kinds (file/folder/link/note). Set `force=true` to bypass duplicate rejection, or use `ttl` for auto-deleting items (TTL items are excluded from dedup checks). When a collision involves a password-protected existing item, the API still returns `409 DUPLICATE_CONTENT` but omits duplicate metadata.

## Maintenance

- `./deploy.sh prune-orphans --dry-run` previews upload files that are no longer referenced by the DB. Orphan pruning waits for uploads to commit before inspecting files; uploads can still run concurrently with each other.
- `./deploy.sh expire-items --dry-run` previews expired TTL items without deleting them.
- In production, schedule `./deploy.sh expire-items` from cron/systemd/your container scheduler instead of relying on request traffic for cleanup.

## Releases

Create and push the next semantic version tag with:

```bash
./scripts/release-tag.sh
```

The script uses the latest reachable git tag on the current branch as its base version, asks whether to bump `major`, `minor`, or `patch`, then creates and pushes an annotated `vX.Y.Z` tag to `origin`. Pushing that tag triggers the existing GitHub Actions image/release workflow.

## Database integrity

SQLite foreign keys are enforced on application connections. Item and space IDs are no longer reused after deletion, keeping share URLs and space selections tied to their original resources. Migration `0012` preserves existing rows and indexes, unassigns historical missing-space references, and removes orphaned unlock-attempt records. It cannot recover IDs of items deleted before this migration. Relative SQLite database paths are resolved under Flask’s instance directory.

## Upgrading from the old PDF-only app

This is a breaking rewrite (new schema, new UI, no auth). Remove old Docker volumes before deploying:

```bash
./deploy.sh cleanup volumes
```

## Project governance

- **Contributing** — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and PR conventions.
- **Security** — report vulnerabilities per [SECURITY.md](SECURITY.md); do not open public issues for security bugs.
- **Code of Conduct** — [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) (Contributor Covenant v2.1).
- **Changelog** — [CHANGELOG.md](CHANGELOG.md).
- **License** — MIT, see [LICENSE](LICENSE).
