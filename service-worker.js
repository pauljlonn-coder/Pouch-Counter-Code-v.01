// ─── Nic Counter Service Worker ──────────────────────────────────────────────
// Version hochzählen wenn App-Dateien sich ändern → erzwingt Update
const CACHE_NAME = 'nic-counter-v1';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css?v=18',
  './app.js',
  './manifest.json',
];

// Installation: alle Dateien in den Cache laden
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  // Sofort aktivieren, nicht auf alten SW warten
  self.skipWaiting();
});

// Aktivierung: alten Cache aufräumen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Cache-first, dann Netzwerk
// → App läuft offline, Updates kommen beim nächsten Neustart
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Im Hintergrund neue Version holen und Cache aktualisieren
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request);
    })
  );
});
