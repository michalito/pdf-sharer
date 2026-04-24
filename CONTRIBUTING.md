# Contributing to saíta

Thanks for your interest in contributing. saíta is a small, focused project — a web app for sharing files, folders, links, and notes on a trusted internal network. This guide explains how to get set up, make a change, and submit it for review.

Before contributing, please read the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security vulnerability, do not open a public issue — follow the [Security Policy](SECURITY.md) instead.

## Getting set up

The fastest path is Docker via `./deploy.sh` (see the [README](README.md) for the full command list):

```bash
./deploy.sh dev          # hot-reload backend + frontend
./deploy.sh dev down     # stop dev stack
./deploy.sh logs         # tail container logs
```

- Dev frontend: http://localhost:5173
- Dev API: http://localhost:5001/api/health

If you prefer to run components directly on your host, install Python 3.11+ and Node 20+ and use the local checks below.

## Running tests locally

### Backend (pytest)

```bash
pytest                                          # full suite
pytest tests/integration/test_items_api.py      # one file
pytest -k "test_search"                         # substring match
```

Coverage threshold is 80% (enforced by `pyproject.toml`). PRs that drop coverage will fail CI.

### Frontend (Vitest + TypeScript)

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test            # single pass
npm --prefix frontend run test:watch      # watch mode
npm --prefix frontend run build           # production build
```

CI runs all of the above on every push and pull request (`.github/workflows/ci.yaml`).

## Architecture orientation

Before making non-trivial changes, skim these two files — they're the quick-reference and deep-dive respectively:

- [AGENTS.md](AGENTS.md) — fast-start commands, operational facts, API surface, config gotchas.
- [CLAUDE.md](CLAUDE.md) — detailed backend/frontend architecture, request flow, presenter layer, spaces, expirations, PWA specifics.

The backend is layered `Routes → Presenter → Services → Repositories → Database`. The frontend is a single-page app with no client-side router; all server state flows through TanStack Query.

## When you change code, keep these aligned

This is the most common source of PR feedback. When you touch one of these areas, make sure the counterpart is updated too:

1. **API contract**: `app/api/routes.py` or `app/api/space_routes.py` ↔ `frontend/src/api/items.ts` ↔ the `## API` table in `README.md`.
2. **Data model**: SQLAlchemy model in `app/domain/` ↔ new Alembic migration under `migrations/versions/` (manual numeric prefix, e.g. `0012_*.py`) ↔ impacted tests.
3. **Presenter output**: `app/api/item_presenter.py` when adding or removing response fields, especially for password-protected items.
4. **Operational behavior**: `deploy.sh`, `docker-compose*.yaml`, `.env.example`, and the relevant sections of `README.md`, `AGENTS.md`, `CLAUDE.md`.
5. **PWA metadata**: `frontend/public/manifest.webmanifest` when renaming or rebranding.

## Code style

- **Python**: follow the existing layered structure — routes stay thin, business logic lives in services, DB access in repositories. Raise `AppError` subclasses (`app/exceptions.py`) for user-facing failures; the registered error handlers will turn them into JSON responses.
- **TypeScript**: strict mode is on. Keep all top-level UI state in `App.tsx` — there is intentionally no global store. New server calls go through `apiJson()` or `xhrForm()` in `frontend/src/api/items.ts`.
- **No new client-side router.** Route-like navigation is via query params or local state.
- **Comments**: only when the *why* isn't obvious. Don't narrate what the code does.

## Commit and PR style

- Write short, imperative commit subjects: `Add dev seed CLI for sample data`, `Raise note text limit to 100k`. Browse `git log --oneline` for examples.
- Keep PRs focused. A bug fix and a refactor should be separate PRs.
- In the PR description, explain the *why* more than the *what* — the diff shows the what.
- Before requesting review, run `pytest` and `npm --prefix frontend run test` locally.

## Reporting bugs and requesting features

Use the templates at `.github/ISSUE_TEMPLATE/`. For security issues, **do not** open a public issue — see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
