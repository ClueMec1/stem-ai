const CACHE = 'c4x-single-v6';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return; // Firebase and the solver always go live
  e.respondWith(fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
});

// ---------- notifications while the app is closed (Firebase Cloud Messaging) ----------
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyByDZXSnvDcEWigjDXcUxsAwWfkfB-hXmo',
    authDomain: 'project-3333600848385438143.firebaseapp.com',
    projectId: 'project-3333600848385438143',
    messagingSenderId: '492552413084',
    appId: '1:492552413084:web:95453150b6f5f5972f3259'
  });
  firebase.messaging().onBackgroundMessage(payload => {
    const d = payload.data || {};
    return self.registration.showNotification(d.title || 'Connect 4', {
      body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
      tag: d.tag || 'c4', renotify: true, vibrate: [100, 50, 100], data: { url: d.url || './' }
    });
  });
} catch (e) { /* offline at startup: the game still works, only closed-app alerts wait */ }

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
