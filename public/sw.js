/* EuroCollection service worker: cache leggera per le immagini delle
   monete + pagina offline. Mai cache per navigazioni/API/action:
   quelle vanno sempre in rete (altrimenti si rompono i Server Component). */
const VERSION = "euro-collection-v1";
const IMAGE_CACHE = `${VERSION}-images`;
const SHELL_CACHE = `${VERSION}-shell`;
const IMAGE_HOSTS = ["www.ecb.europa.eu", "flagcdn.com"];
const MAX_IMAGES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/offline.html"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== IMAGE_CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) {
    await cache.delete(keys[0]);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Navigazioni: rete, con fallback offline. MAI cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // Solo immagini (nostre CDN monete/bandiere): cache-first con limite.
  const isImage = /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(url.pathname);
  if (isImage && IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          cache.put(request, res.clone()).catch(() => {});
          trimCache(cache, MAX_IMAGES).catch(() => {});
        }
        return res;
      })
    );
  }
});
