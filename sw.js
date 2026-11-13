// Service worker: rende l'app utilizzabile offline su iPad e Mac.
// FILE GENERATO da tools/genera-sw.py a partire da tools/sw-template.js: modifica il modello, non questo file.
//
// Al primo avvio salva sul dispositivo tutti i file dell'app; da lì in poi li serve dalla memoria locale
// (avvio istantaneo, anche senza connessione). Quando si pubblica una nuova versione, il nuovo service worker
// scarica i file aggiornati in sottofondo e aspetta che l'utente tocchi «Aggiorna».

const VERSION = '1ec99dc903';
const FILES = [
  "./",
  "css/style.css",
  "icons/apple-touch-icon.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "index.html",
  "js/core/blobs.js",
  "js/core/camera.js",
  "js/core/electric.js",
  "js/core/history.js",
  "js/core/icons.js",
  "js/core/ink.js",
  "js/core/inspector.js",
  "js/core/lasso.js",
  "js/core/look.js",
  "js/core/math.js",
  "js/core/panels.js",
  "js/core/plot.js",
  "js/core/pwa.js",
  "js/core/render.js",
  "js/core/shapes.js",
  "js/core/store.js",
  "js/core/ui.js",
  "js/experiments/board.js",
  "js/experiments/builder.js",
  "js/experiments/charges.js",
  "js/experiments/circular.js",
  "js/experiments/incline.js",
  "js/experiments/projectile.js",
  "js/experiments/registry.js",
  "js/experiments/relative.js",
  "js/main.js",
  "manifest.webmanifest",
  "vendor/katex/contrib/auto-render.min.js",
  "vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
  "vendor/katex/katex.min.css",
  "vendor/katex/katex.min.js",
  "vendor/planck/planck.mjs"
];
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
