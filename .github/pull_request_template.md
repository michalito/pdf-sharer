## Summary

<!-- What does this PR change, and why? Explain the *why*; the diff shows the *what*. -->

## Test plan

- [ ] `pytest` passes locally
- [ ] `npm --prefix frontend run test` passes
- [ ] `npm --prefix frontend run typecheck` passes
- [ ] Manually exercised the affected flow (describe below)

<!-- Describe any manual verification, relevant browser/device, or edge cases covered. -->

## Contract checklist

Tick any that apply. See `CONTRIBUTING.md` → "When you change code, keep these aligned".

- [ ] Backend route ↔ `frontend/src/api/items.ts` ↔ `README.md` API table
- [ ] Data model change includes an Alembic migration under `migrations/versions/`
- [ ] Presenter (`app/api/item_presenter.py`) updated for new/removed response fields
- [ ] Operational docs updated (`README.md`, `AGENTS.md`, `CLAUDE.md`, `.env.example`)
- [ ] PWA manifest updated (`frontend/public/manifest.webmanifest`) if renaming/rebranding
- [ ] N/A — docs-only, tests-only, or other scope that doesn't need the above

## Related issues

<!-- Closes #123, Refs #456 -->
