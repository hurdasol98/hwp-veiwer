// Cache the app shell only. HTML changes are fetched on every online visit;
// no release number needs to be kept in sync with the UI or manifest.
const PREFIX = "hwp-viewer-";
const SCOPE = new URL(self.registration.scope);
const CACHE = PREFIX + "shell-" + encodeURIComponent(SCOPE.href);
const CORE = new URL("index.html", SCOPE).href;
const MANIFEST = new URL("manifest.webmanifest", SCOPE).href;

function shellKey(request) {
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return null;
  if (url.pathname === new URL(CORE).pathname) return CORE;
  if (url.pathname === new URL(MANIFEST).pathname) return MANIFEST;
  if (request.mode === "navigate" && url.pathname === SCOPE.pathname) return CORE;
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          new Request(CORE, { cache: "reload" }),
          new Request(MANIFEST, { cache: "reload" }),
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE &&
                key.startsWith(PREFIX) &&
                key.endsWith(encodeURIComponent(SCOPE.href)),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const key = shellKey(event.request);
  if (!key) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 5000);
      try {
        const response = await fetch(key, { signal: abort.signal, cache: "no-cache" });
        if (response.ok) {
          await cache.put(key, response.clone());
          return response;
        }
        return (await cache.match(key)) || response;
      } catch (error) {
        return (await cache.match(key)) || Response.error();
      } finally {
        clearTimeout(timer);
      }
    })(),
  );
});
