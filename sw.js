// Guarda el casco de la app para que abra sin conexión.
//
// Va primero a la red y solo cae al caché cuando no hay señal: así, mientras
// desarrollas, siempre ves la última versión. Sube CACHE de versión si cambias
// la lista de archivos.
//
// El trabajador solo se registra en contexto seguro: https o localhost. Sobre
// http en una IP de la red local el navegador lo ignora y la app funciona
// igual, pero sin instalación ni modo sin conexión.
const CACHE = 'que-comemos-v3';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './src/app.js', './src/model.js', './src/storage.js', './src/demo.js',
  './src/brand.js', './src/onboarding.js',
  './src/styles.css', './src/sidebar.css', './src/onboarding.css', './src/quick-add.css', './src/calendar.css', './src/theme.css',
  './src/logo.svg', './src/icon-192.png',
  './src/fonts/montserrat-latin.woff2', './src/fonts/montserrat-latin-ext.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
  );
});
