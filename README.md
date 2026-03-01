# saíta

saíta is an internal web application for sharing **any type of file**, **zip archives**, **folders** (zipped by the server), **external links**, and **small notes**. It is designed for deployment on a trusted internal network and intentionally has **no authentication**.

## Features

- Upload any file type
- Upload folders (the server zips them into a single downloadable `.zip`)
- Save external URLs as shareable link items
- Save short text notes as shareable note items
- Optional per-item password protection for files, folders, links, and notes
- Drag-and-drop upload for files
- Direct internal share links (`/d/<id>`) with “Copy Link”
- Workflow status: Active / Done / Archived / Ready to delete
- Safe deletion workflow (mark “Ready to delete”, then delete — per-item or bulk)
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

## Folder uploads

Folder uploads are supported via `webkitdirectory` (Chrome/Edge). The browser uploads the folder contents + relative paths; the server streams them into a zip archive and stores it as a single downloadable item.

## Environment Variables

Configure in `.env` (auto-created from `.env.example` when using `./deploy.sh prod`):

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Cookie signing key (**required in production**; keep stable across restarts for protected-item unlock sessions) | Required in production |
| `DATABASE_URL` | Database connection string | SQLite at `instance/saita.db` |
| `UPLOAD_FOLDER` | File storage directory | `uploads/` |
| `MAX_CONTENT_LENGTH` | Max upload size in bytes | 2147483648 (2GB) |
| `NOTE_EXCERPT_LENGTH` | Max note preview length in list responses (bounded 40..1000) | 180 |
| `APP_VERSION` | Version string exposed by `GET /api/health` and shown in the UI footer. `deploy.sh` auto-detects from latest git tag when unset. | Latest git tag (fallback `dev`) |
| `HOST_PORT` | Docker host port | 5001 |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (`{"ok": true, "version": "<app-version>"}`) |
| `GET` | `/api/storage` | Storage overview (`{disk, items: {totalCount, totalSizeBytes, countByKind, sizeByKind, countByState}, largestItems}`) |
| `GET` | `/api/items` | List items (optional `?q=...&kind=file\|folder\|link\|note&state=active\|done\|archived\|ready_to_delete&protected=true\|false&sort=name\|size\|created\|modified&order=asc\|desc&page=1&per_page=50`; `q` matches names and unprotected note body text; note items include `noteExcerpt`, not full `noteText`; default sort: `created` desc) |
| `POST` | `/api/items/files` | Upload files (multipart/form-data, field: `files`, repeatable; optional `password`) |
| `POST` | `/api/items/folder` | Upload a folder (multipart: `files` + `paths` repeatable; optional `password`) |
| `POST` | `/api/items/link` | Save a URL (JSON: `{"url":"https://...","name?":"optional label","password?":"optional password"}`) |
| `POST` | `/api/items/note` | Save a note (JSON: `{"text":"...","title?":"optional title","password?":"optional password"}`) |
| `GET` | `/api/items/<id>` | Fetch item metadata (adds `isPasswordProtected` + `isPasswordUnlocked`; hides `linkUrl`/`noteText`/`noteExcerpt` while locked) |
| `PATCH` | `/api/items/<id>` | Update item (JSON: `{"state?":"done","spaceId?":1,"pinned?":true}`; at least one field required; bumps `updatedAt`) |
| `GET` | `/api/items/<id>/download` | Download a file/folder item |
| `POST` | `/api/items/<id>/unlock` | Unlock a protected item for current browser session (JSON: `{"password":"..."}`) |
| `DELETE` | `/api/items/<id>` | Delete an item (requires state `ready_to_delete`) |
| `DELETE` | `/api/items/ready-to-delete` | Bulk delete items in state `ready_to_delete` (optional filters: `?q=...&kind=file\|folder\|link\|note&protected=true\|false`) |
| `GET` | `/d/<id>` | Public share link (downloads file/folder, redirects link, renders note, or prompts for password if protected) |
| `POST` | `/d/<id>` | Submit password to unlock a protected public share link in the current session |

## Upgrading from the old PDF-only app

This is a breaking rewrite (new schema, new UI, no auth). Remove old Docker volumes before deploying:

```bash
./deploy.sh cleanup volumes
```
