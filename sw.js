const CACHE_NAME = "birapp-static-v6";
const NETWORK_TIMEOUT_MS = 2800;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/icon-cheers.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function timeoutReject(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("sw-network-timeout")), ms);
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca cachear llamadas API ni requests externos (Google Apps Script, Gemini API, Google Fonts)
  if (url.origin !== self.location.origin || url.searchParams.has("action")) {
    return;
  }

  // Red con timeout corto (2.8s): si hay buena señal actualiza al instante; si el bar tiene 3G lento, entrega caché rápido
  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok && (response.type === "basic" || response.type === "default")) {
      const cloned = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
    }
    return response;
  });

  event.waitUntil(networkPromise.catch(() => {}));

  event.respondWith(
    Promise.race([networkPromise, timeoutReject(NETWORK_TIMEOUT_MS)]).catch(async (err) => {
      const cached = await caches.match(request);
      if (cached) return cached;

      if (err && err.message === "sw-network-timeout") {
        try {
          return await networkPromise;
        } catch (_) {}
      }

      if (request.mode === "navigate") {
        const shellFallback = await caches.match("./index.html");
        if (shellFallback) return shellFallback;
      }

      throw err;
    })
  );
});
