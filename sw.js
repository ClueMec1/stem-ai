// sw.js — deliberately minimal. It caches the app shell (the HTML/CSS/JS
// files) so the app installs and opens instantly, but live data (chat,
// calendar, links) always comes fresh from Firestore, not the cache.

const CACHE = "fam-board-shell-v1";
const SHELL_FILES = [
  "./index.html",
  "./passcode.html",
  "./join.html",
  "./host.html",
  "./chat.html",
  "./calendar.html",
  "./links.html",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Never cache Firestore/Firebase network calls — only app-shell files.
  if (event.request.url.includes("firestore.googleapis.com")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
