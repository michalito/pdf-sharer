# Production authentication

The production workspace at `https://saita.home.theforceiswith.me` uses a dedicated
Authentik forward-auth provider. Signed-in members share the existing item and
space dataset; there is no user table, ownership migration, or per-member ACL.
Public `/d/<id>` sharing and its per-item password/throttle behavior remain available
without signing in. Share IDs are enumerable convenience URLs, not secret tokens.

## Application trust boundary

Set these environment variables in the application runtime:

```text
FLASK_ENV=production
AUTH_MODE=forward
APP_ORIGIN=https://saita.home.theforceiswith.me
AUTHENTIK_PROXY_ISSUER=https://auth.theforceiswith.me/application/o/saita/
AUTHENTIK_PROXY_CLIENT_ID=<dedicated-saita-provider-client-id>
AUTHENTIK_REQUIRED_GROUP=app-saita
AUTHENTIK_PROXY_CLIENT_SECRET_FILE=/run/authentik/saita-client-secret
SESSION_COOKIE_SECURE=true
SECRET_KEY=<existing-stable-secret>
```

Mount the dedicated proxy provider's **client secret**, at least 32 bytes, read-only
at the configured path. Store it in a backend-only Secret/SealedSecret and keep it
out of Git, frontend assets, and logs. Use the provider-specific issuer and actual
generated client ID shown above. Configure the signed token's `groups` claim to
include `app-saita` for approved members.

The pinned Authentik 2026.5.7 proxy-provider API resets `signing_key` to `None` in
`set_oauth_defaults()` on create/update and exposes `client_id` read-only. Its
supported contract is therefore HS256 with the dedicated provider's client secret.
Do not force asymmetric signing through unsupported parent-model mutations. This
app's secret is separate from other providers and from Flask's cookie signing key.

The pinned outpost forwards the raw OAuth access token as `X-authentik-jwt`.
Saita verifies its HS256 signature, exact issuer, single audience, subject,
expiry, optional not-before time, and required group. Optional `iat` is validated as
a finite numeric informational timestamp; it does not reject a newly issued token
because of small issuer/app clock differences. Expiry and not-before checks have
zero leeway. Synchronize runtime clocks; an outage does not extend token validity.
Plain username,
email, groups, UID, metadata/JWKS headers, Basic credentials, and Flask unlock
sessions cannot grant workspace access. Algorithms are pinned to HS256; RS256,
unsigned tokens, and tokens signed with another provider's secret are rejected.

The client secret is loaded once when each worker starts. Requests make no network
calls to Authentik/JWKS, so previously signed, unexpired outpost identities remain
usable during an IdP outage. Wrong secrets and expired identities fail closed;
there is no expiry grace or outage bypass. A missing/invalid secret or incomplete
forward-auth configuration prevents startup. Production requires explicit
`AUTH_MODE=forward`; `development` is only available outside production.
`APP_ORIGIN` must be canonical (lowercase hostname, no default `:443`, no path).
The stable cookie signing key must contain at least 32 bytes. The dedicated proxy
secret must contain 32–4096 bytes with no internal whitespace. Neither secret is
printed; request rejection logs include only safe diagnostic exception classes.

Every authenticated mutation, including multipart uploads, requires
`Origin` to equal `APP_ORIGIN` and `X-Saita-CSRF: 1`. The frontend sends this custom
header. Cross-site/same-site fetch metadata is rejected even if an Origin is
forged. There is no Referer fallback or CORS authorization.

Authenticated API unlock grants are bound to the verified subject and discarded
when another subject arrives. Explicit anonymous share-password grants remain
browser-scoped in a separate session record. API-created/unlocked protected items
do not grant anonymous share access: even the creator must enter the public share
password separately. Anonymous password prompts expose neither title nor kind.

## Ingress contract

The backend remains private to the authenticated ingress. Strip all client-supplied
Authentik identity headers before calling forward auth, and copy only the outpost's
verified identity response, including `X-authentik-jwt`, to the backend. Route
`/outpost.goauthentik.io/` to the dedicated outpost, including login callback and
sign-out. Do not route those paths into the Saita SPA.

Saita itself allows anonymous access only for:

- `GET`/`HEAD`/`POST` on canonical `/d/[1-9][0-9]*` matched to the share route.
- `GET`/`HEAD` on exact `/api/health`, which returns only `{"ok":true}`.
- `GET`/`HEAD` on exact `/api/auth-required`, a fixed JSON 401 response with
  `code: AUTH_REQUIRED` and `loginUrl: /`, for the ingress error adapter.
- Exact `POST /api/auth/logout`, with the same canonical Origin/custom-header/fetch
  metadata checks but no identity requirement. It only clears this browser's cookie
  so sign-out remains possible after identity expiry. All other methods stay protected.
- `GET`/`HEAD` on existing, explicitly named public assets: `logo.png`,
  `apple-touch-icon.png`, `manifest.webmanifest`, `public-pages.css`, the three
  `icons/icon-*.png` files, `sw.js`, `workbox-<name>.js`, and single-level
  `assets/<name>.js|css|woff2|png`, optionally under `/static/`.

Use anchored path rules and read-only method rules on the ingress too. Assets must
exist; neither missing files nor `/static/index.html`, source maps, `/api` prefixes,
share-path suffixes, leading-zero IDs, or unsupported share methods bypass app
authentication. Do not allow all of `/static/` or all of `/d/`.

Protect `/api` with a separate ingress rule that returns **JSON 401**, without an
identity-provider redirect, when forward auth would initiate login. For Traefik,
an errors middleware outside forward-auth can map its 302/303 to 401 and fetch
`/api/auth-required` from Saita. The exact adapter endpoint is public and has no
side effects; do not broaden its bypass. Keep normal workspace navigation redirects
on the browser/UI rule. Verify the actual deployed middleware chain rather than
relying on an `Accept` header: the pinned outpost's Traefik handler initiates login
for unauthorized API requests too.

`GET /api/app-info` is protected and returns the version, note limits, and auth mode
for the UI. Keep health checks pointed at `/api/health`.
Pin and verify `TRUST_PROXY_HOPS` against the actual ingress chain: zero shares the
password throttle across proxy-connected clients; too many trusted hops can allow
spoofed client IPs. Test real callers and spoofed `X-Forwarded-For` at deployment.
Misrouted `/outpost.goauthentik.io` paths return explicit 404 responses from Saita.

## Logout and browser caching

The Sign out button immediately discards React Query data and notifies other
same-origin tabs, then makes a two-second best-effort POST to `/api/auth/logout`
to clear all Flask item unlocks. It always navigates to the fixed
`/outpost.goauthentik.io/sign_out`, including on 401/403 or network failure.
The expired-session gate and server navigation-error page also offer Sign out.
The exact logout POST must bypass ingress forward-auth while preserving app-side
Origin/custom-header checks; do not bypass a prefix or another method.
The outpost removes its local
sessions before initiating central sign-out. No client-supplied return URL is used.
An authentication failure also unmounts private UI and clears query/mutation caches.
Restored browser history pages reload against the server, and app-info is checked
periodically and on focus. All non-asset responses use `Cache-Control: no-store`.
Responses prohibit framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`),
MIME sniffing, and referrer disclosure.

The service worker precaches only public code, styling, fonts, icons, and manifest
files. It does not precache HTML or provide an offline navigation fallback; every
navigation reaches the server. API/share/auth responses are never cached by the
worker. The updated worker removes obsolete precache entries, including the old
offline HTML shell. During cutover, verify an existing installed PWA updates its
worker, then test logout, Back, a second tab, expiry, and an offline navigation.
The build verifies both immediate worker activation and claiming existing clients.

JWTs remain bearer credentials: a captured signed token remains valid until
expiry. Removing a group affects new tokens; coordinate central/outpost session
revocation while connected to invalidate current browser sessions. Neither local
verification nor an IdP outage implies instant token revocation.

## Deployment, rotation, and recovery

For Docker Compose, `AUTHENTIK_PROXY_CLIENT_SECRET_FILE` in the host `.env` is the path
to the host secret file; Compose mounts it at `/run/authentik/saita-client-secret` and
sets that container path. The source must exist and is not created automatically.
The production port binds to loopback by default (`HOST_BIND_ADDRESS` override).
Other runtimes must mount the secret and set its container-visible path directly.
Preserve the existing database/upload volumes and stable `SECRET_KEY`; this change
requires no data migration.

Secret rotation is explicit: replace the mounted secret, restart Saita workers,
update the provider/outpost, and reauthenticate users in a coordinated maintenance
window. The app accepts one dedicated secret, so old tokens are rejected after
restart. Use provider rollback plus the previous private secret snapshot if
rotation fails. Do not silently accept arbitrary keys from JWT metadata.

Before rollout, run backend coverage, frontend typecheck/tests/build, and validate
the built worker has no HTML precache or navigation fallback (`npm run build`
checks the generated worker, including plugin defaults). Deploy the reviewed
release image pinned by digest only after the ingress/provider configuration is
ready. Rollback needs the prior image and private configuration snapshot; an old
release with no application authentication must stay behind the same protected
ingress. Keep a backup of the data and stable session key before any cutover.

Local development (`./deploy.sh dev`, or `FLASK_ENV=development`/`testing`) defaults to
`AUTH_MODE=development`, without an IdP. Keep it local; do not use that mode for a
hosted production deployment. `FLASK_ENV` must be explicit outside Docker/Compose;
an unset environment fails startup. Development ports bind loopback and startup
logs a warning that workspace authentication is disabled.
