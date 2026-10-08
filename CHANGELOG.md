# Changelog

All notable changes to saíta are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Pre-`1.7.0` releases predate the public release and are not backfilled here. See `git log` and GitHub release notes for earlier history.

## [Unreleased]

### Added
- Production Authentik forward authentication with pinned HS256 verification, required-group checks, mutation origin protection, JSON API authentication errors, and logout.
- Project governance docs: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).
- GitHub issue templates (bug report, feature request) and a pull request template.
- `Trust model` callout in the README and governance footer linking the new docs.

### Changed
- Public health now returns only `ok`; version and note limits move to protected `/api/app-info`.
- PWA precaching includes public assets only; HTML/offline navigation fallback is removed so every navigation checks authentication.
- Production configuration must explicitly select forward auth and mount its dedicated proxy client secret; shared data and anonymous password-protected share links are preserved.
- API password unlocks are bound to the verified member; anonymous share-password grants remain browser-scoped. Protected public prompts hide titles and kinds.
- Logout clears private UI immediately and reaches the fixed outpost sign-out path even after identity expiry or a local network failure.
- Direct Flask runs require explicit `FLASK_ENV`; development ports bind loopback and insecure cookie-signing keys fail production startup.

<!--
At release time, rename the `[Unreleased]` heading above to `[X.Y.Z] - YYYY-MM-DD`
and start a fresh empty `[Unreleased]` block above it.
-->
