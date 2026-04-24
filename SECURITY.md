# Security Policy

Thanks for taking the time to help keep saíta and its users safe.

## Supported versions

Only the latest released minor version receives security fixes. When a fix lands, it ships as a patch release on top of the current minor.

| Version | Supported          |
|---------|--------------------|
| Latest `1.x` (current minor) | Yes |
| Older `1.x` minors | No |
| `0.x` | No |

Check `/api/health` on your deployment to see which version you're running.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email the maintainer at **sinoplismichael@gmail.com** with the subject line prefix `[saita security]`.

In your report, please include:

- A description of the issue and its impact.
- Steps to reproduce (or a proof-of-concept).
- The version of saíta affected (from `/api/health`).
- Your preferred disclosure timeline.

### What to expect

- **Acknowledgement** within 5 business days.
- **Triage and fix plan** communicated within 14 days.
- **Coordinated disclosure**: we prefer a 90-day embargo window from the date of first acknowledgement to public disclosure, adjusted for complexity. We'll credit you in the release notes if you want.

## Scope

saíta is **designed for deployment on a trusted internal network and intentionally has no authentication**. This is stated up front in the README and trust-model documentation.

The following are *not* vulnerabilities — they are the documented trust model:

- Running saíta on the public internet and anyone being able to see or upload items.
- Anyone with network access being able to delete items via the API.
- No rate limiting on item creation or list endpoints.

The following **are** in scope and we want to hear about them:

- Authentication or authorization bypass of **password-protected items** (including session unlock cookies).
- Path traversal, arbitrary file read/write, or zip-slip via uploads or folder zip handling.
- Remote code execution through uploaded files, links, or note rendering.
- Cross-site scripting (XSS) in item names, link URLs, or markdown notes (both React render and server-side render at `/d/<id>`).
- Server-side request forgery (SSRF) through link items or any other vector.
- SQL injection or ORM-level query manipulation.
- Cookie forgery, session fixation, or signed-token tampering.
- Denial-of-service vulnerabilities that go beyond "too many requests" — for example, crashes from malformed uploads or algorithmic complexity attacks.
- Information disclosure that leaks protected-item contents to unauthorized viewers.

## Out of scope

- Missing security headers that don't materially affect the threat model.
- Findings from automated scanners without a demonstrated exploit path.
- Issues requiring physical access to a deployment host.
- Issues in third-party dependencies with no saíta-specific impact (please report those upstream).

## Credit

If you'd like acknowledgement for a valid report, let us know and we'll credit you in the relevant release notes in [CHANGELOG.md](CHANGELOG.md).
