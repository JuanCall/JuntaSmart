const CACHE_NAME = 'cajamama-v1';
const assets = [
  './',
  './index.html',
  './cuentas.html',
  './nuevo.html',
  './perfil.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// Instalar el Service Worker y guardar los archivos visuales en caché
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(assets);
        })
    );
});

// Interceptar las peticiones de red
self.addEventListener('fetch', event => {
    // Si la petición es hacia nuestra API (el backend), NO usamos caché, vamos directo a internet
    if (event.request.url.includes('127.0.0.1') || event.request.url.includes('8000')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Para los archivos visuales (HTML, CSS), cargamos desde el celular para que sea rápido
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});