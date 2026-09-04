const CACHE_VERSION = "baithak-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/icon.png" ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/favicon.png" ||
    url.pathname === "/logo.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/photos/")) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match(request);
          return (
            cached ||
            new Response(
              "<!DOCTYPE html><html><body style='background:#071014;color:#f4e8c8;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>You're offline. The parlor will wait.</body></html>",
              { headers: { "Content-Type": "text/html" } }
            )
          );
        })
    );
  }
});

function parsePushPayload(event) {
  const fallback = { title: "Baithak", body: "The table is calling.", url: "/lobby" };
  if (!event.data) return fallback;
  try {
    const data = event.data.json();
    return {
      title: data.title || fallback.title,
      body: data.body || fallback.body,
      url: data.url || "/lobby",
      icon: data.icon,
    };
  } catch (_err) {
    try {
      const text = event.data.text();
      return { ...fallback, body: text || fallback.body };
    } catch (_inner) {
      return fallback;
    }
  }
}

self.addEventListener("push", (event) => {
  const data = parsePushPayload(event);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icon-192.png",
      badge: "/favicon.png",
      data: { url: data.url },
      tag: data.url || "baithak",
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const applicationServerKey =
          event.oldSubscription?.options?.applicationServerKey ||
          event.newSubscription?.options?.applicationServerKey;
        if (!applicationServerKey) return;
        const subscription =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          }));
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch (_err) {
        /* next authenticated open rebinds via syncPushSubscription */
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/lobby";
  const urlToOpen = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.postMessage({ type: "baithak-nav", url: path });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
