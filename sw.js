// Guarda el casco de la app para que abra sin conexión.
//
// Va primero a la red y solo cae al caché cuando no hay señal: así, mientras
// desarrollas, siempre ves la última versión. Sube CACHE de versión si cambias
// la lista de archivos.
//
// El trabajador solo se registra en contexto seguro: https o localhost. Sobre
// http en una IP de la red local el navegador lo ignora y la app funciona
// igual, pero sin instalación ni modo sin conexión.
const CACHE = 'que-comemos-v25';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './src/app.js', './src/model.js', './src/storage.js', './src/demo.js',
  './src/brand.js', './src/onboarding.js', './src/nombres.js', './src/migrate.js', './src/ui-kit.js',
  './src/catalog-seed.js', './src/setup.js', './src/assistant.js',
  './src/device.js', './src/text-parse.js', './src/chat-ui.js', './src/bulk-entry.js',
  './src/voz.js', './src/fallos.js', './src/hogar.js',
  './src/nube.js', './src/config-nube.js', './src/sesion.js', './src/sincronizar.js', './src/page-cuenta.js',
  './src/routines.js', './src/page-mes.js', './src/page-compra.js', './src/page-mas.js', './src/legal.js',
  './src/styles.css', './src/sidebar.css', './src/onboarding.css', './src/quick-add.css', './src/calendar.css', './src/theme.css', './src/setup.css', './src/chat.css', './src/bulk.css', './src/plan.css', './src/voz.css', './src/cuenta.css', './src/hogar.css',
  './src/isotipo.png', './src/icon-192.png', './src/icon-512.png',
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
        // Solo se guarda lo que salió bien. Guardar un 404 o un 500 deja esa
        // respuesta en el caché para siempre, y el día que falte la red la app
        // sirve un error viejo en vez del archivo bueno que sí llegó a existir.
        if (response.ok) {
          const copia = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copia));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => {
        if (hit) return hit;
        // Devolver index.html cuando falla un módulo de JavaScript no arregla
        // nada: el navegador recibe HTML donde esperaba código y el error que
        // enseña no se parece en nada al problema real. El respaldo a la página
        // solo tiene sentido cuando se estaba navegando.
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Sin conexión y sin copia guardada' });
      }))
  );
});
