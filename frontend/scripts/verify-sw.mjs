import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Validate the generated worker, including defaults added by the PWA plugin.
const source = readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8");
const entries = [];
const routes = [];
let cleaned = false;
let claimed = false;
let activated = false;
const disallowNavigation = () => {
  throw new Error("Service-worker navigations must reach the authenticated server");
};
const workbox = {
  clientsClaim() {
    claimed = true;
  },
  precacheAndRoute(values) {
    entries.push(...values);
  },
  cleanupOutdatedCaches() {
    cleaned = true;
  },
  createHandlerBoundToURL: disallowNavigation,
  NavigationRoute: class {
    constructor() {
      disallowNavigation();
    }
  },
  registerRoute(match, handler, method) {
    routes.push({ match, handler, method });
  },
  CacheFirst: class {
    constructor(options) {
      this.options = options;
    }
  },
  ExpirationPlugin: class {},
  CacheableResponsePlugin: class {},
};
const define = (_dependencies, factory) => factory(workbox);
runInNewContext(
  source,
  {
    self: {
      define,
      skipWaiting() {
        activated = true;
      },
    },
    define,
  },
  { timeout: 1000 },
);

const publicAsset =
  /^\/static\/(?:manifest\.webmanifest|apple-touch-icon\.png|icons\/icon-(?:192|512|512-maskable)\.png|assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2|png))$/;
assert(entries.length > 0, "Expected public precache assets");
for (const { url } of entries) {
  assert(publicAsset.test(url), `Private or unsupported precache URL: ${url}`);
}
assert(cleaned, "Obsolete precache entries, including legacy HTML, must be removed");
assert(activated, "Updated worker must skip waiting so the legacy navigation fallback is replaced");
assert(claimed, "Updated worker must claim existing clients during the auth cutover");
assert.equal(routes.length, 2, "Only the two external Google Fonts runtime caches are expected");
for (const { match, method } of routes) {
  assert.equal(method, "GET");
  assert(
    match.test("https://fonts.googleapis.com/css2") ||
      match.test("https://fonts.gstatic.com/font.woff2"),
  );
  for (const url of [
    "https://saita.home.theforceiswith.me/",
    "https://saita.home.theforceiswith.me/api/items",
    "https://saita.home.theforceiswith.me/d/1",
    "https://auth.theforceiswith.me/",
  ]) {
    assert(!match.test(url), `Worker runtime cache matches private URL: ${url}`);
  }
}
console.log(
  `Verified service-worker authentication safety (${entries.length} public assets; no navigation/HTML/API caching).`,
);
