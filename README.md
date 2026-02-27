# saíta

saíta is an internal web application for sharing **any type of file**, **zip archives**, **folders** (zipped by the server), **external links**, and **small notes**. It is designed for deployment on a trusted internal network and intentionally has **no authentication**.

## Features

- Upload any file type
- Upload folders (the server zips them into a single downloadable `.zip`)
- Save external URLs as shareable link items
- Save short text notes as shareable note items
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
| `SECRET_KEY` | Cookie signing key (optional) | Auto-generated at startup |
| `DATABASE_URL` | Database connection string | SQLite at `instance/saita.db` |
| `UPLOAD_FOLDER` | File storage directory | `uploads/` |
| `MAX_CONTENT_LENGTH` | Max upload size in bytes | 2147483648 (2GB) |
| `NOTE_EXCERPT_LENGTH` | Max note preview length in list responses (bounded 40..1000) | 180 |
| `HOST_PORT` | Docker host port | 5001 |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/items` | List items (optional `?q=...&kind=file\|folder\|link\|note&state=active\|done\|archived\|ready_to_delete&page=1&per_page=50`; note items include `noteExcerpt`, not full text) |
| `POST` | `/api/items/files` | Upload files (multipart/form-data, field: `files`, repeatable) |
| `POST` | `/api/items/folder` | Upload a folder (multipart: `files` + `paths` repeatable) |
| `POST` | `/api/items/link` | Save a URL (JSON: `{"url":"https://...","name?":"optional label"}`) |
| `POST` | `/api/items/note` | Save a note (JSON: `{"text":"...","title?":"optional title"}`) |
| `GET` | `/api/items/<id>` | Fetch item metadata (includes full `noteText` for note items) |
| `PATCH` | `/api/items/<id>` | Update item state (JSON: `{"state":"done"}`) |
| `GET` | `/api/items/<id>/download` | Download a file/folder item |
| `DELETE` | `/api/items/<id>` | Delete an item (requires state `ready_to_delete`) |
| `DELETE` | `/api/items/ready-to-delete` | Bulk delete items in state `ready_to_delete` (optional filters: `?q=...&kind=file\|folder\|link\|note`) |
| `GET` | `/d/<id>` | Public share link (downloads file/folder, redirects link, renders note) |

## Upgrading from the old PDF-only app

This is a breaking rewrite (new schema, new UI, no auth). Remove old Docker volumes before deploying:

```bash
./deploy.sh cleanup volumes
```
