const RELEASE = "6f13c2257746";
const CACHE = "beauty-plus-admin-" + RELEASE;
const SHELL = [
  "/admin/",
  "/admin/index.html",
  "/admin/pos.html",
  "/assets/pos.css?v=" + RELEASE,
  "/assets/pos.js?v=" + RELEASE,
  "/assets/admin.css?v=" + RELEASE,
  "/assets/admin.js?v=" + RELEASE,
  "/admin/icons/icon-192.png",
  "/admin/icons/icon-512.png",
];
const PATHS = new Set(
  SHELL.map((url) => new URL(url, self.location.origin).pathname),
);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("beauty-plus-admin-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !PATHS.has(url.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (response.ok)
          await (await caches.open(CACHE)).put(event.request, response.clone());
        return response;
      } catch {
        return (
          (await caches.match(event.request, { ignoreSearch: true })) ||
          new Response("You are offline. Reconnect to manage the studio.", {
            status: 503,
          })
        );
      }
    })(),
  );
});
self.addEventListener("push", (event) => {
  let data = {
    title: "Beauty Plus update",
    body: "Open your studio for the latest update.",
    url: "/admin/index.html#notifications",
  };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/admin/icons/icon-192.png",
      badge: "/admin/icons/icon-192.png",
      tag: data.tag || "beauty-plus-update",
      data: { url: data.url },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/admin/index.html#notifications",
    self.location.origin,
  );
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith("/admin/")
  )
    return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients)
          if (new URL(client.url).pathname.startsWith("/admin/")) {
            await client.navigate(url.href);
            return client.focus();
          }
        return self.clients.openWindow(url.href);
      }),
  );
});
