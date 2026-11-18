// Línea de Fuego — service worker: guarda el juego para que cargue rápido y funcione sin conexión
// Archivos del juego: primero la red (siempre la última versión) y, sin conexión, la copia guardada.
// Three.js desde el CDN: versión fija, así que primero la copia guardada.
const CACHE = 'ldf-v2';
const CORE = ['./', 'index.html', 'juego.js', 'sonido.js', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png', 'apple-touch-icon.png', 'favicon.png'];
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const LIBS = ['build/three.module.js', 'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js', 'examples/jsm/postprocessing/UnrealBloomPass.js', 'examples/jsm/postprocessing/OutputPass.js', 'examples/jsm/postprocessing/Pass.js', 'examples/jsm/postprocessing/ShaderPass.js', 'examples/jsm/postprocessing/MaskPass.js', 'examples/jsm/shaders/CopyShader.js', 'examples/jsm/shaders/LuminosityHighPassShader.js', 'examples/jsm/shaders/OutputShader.js'].map(p => CDN + p);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);
    await Promise.all(LIBS.map(u => c.add(u).catch(() => { }))); // si alguna falla, se guardará al usarla
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.startsWith(CDN)) { // librería: copia guardada primero
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // juego: red primero, guardando la copia. 'no-cache' obliga a preguntar al servidor si hay versión nueva
  // (GitHub Pages pide guardar 10 minutos; así las actualizaciones se ven al momento y, si no cambió, la respuesta es mínima)
  e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
