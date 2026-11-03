// Service worker: rende l'app utilizzabile offline su iPad e Mac.
// FILE GENERATO da tools/genera-sw.py a partire da tools/sw-template.js: modifica il modello, non questo file.
//
// Al primo avvio salva sul dispositivo tutti i file dell'app; da lì in poi li serve dalla memoria locale
// (avvio istantaneo, anche senza connessione). Quando si pubblica una nuova versione, il nuovo service worker
// scarica i file aggiornati in sottofondo e aspetta che l'utente tocchi «Aggiorna».

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'fisica-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('message', e => {
  if (e.data === 'aggiorna') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('fisica-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      return (req.mode === 'navigate' && await cache.match('./')) || Response.error();
    }
  })());
});
