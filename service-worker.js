// Service Worker de SEGURIDAD TPC.
//
// Qué cachea: SOLO los archivos propios de la aplicación (HTML, CSS, JS,
// ícono) para que la app pueda abrir y mostrar su interfaz aunque el
// dispositivo pierda temporalmente la señal.
//
// Qué NUNCA cachea: ninguna llamada a Firebase (Authentication ni
// Firestore). Esas peticiones van a otro dominio (googleapis.com) y este
// Service Worker las ignora por completo (ver el filtro de "origin" más
// abajo) — así ningún dato de visitantes, paquetes u objetos queda
// guardado en la caché del dispositivo.
//
// Si subes una nueva versión de la aplicación, sube también este archivo
// con el número de CACHE_NAME incrementado (ver README, "Actualizaciones
// futuras") para que los dispositivos descarguen los archivos nuevos en
// lugar de seguir usando la copia guardada.
const CACHE_NAME = "seguridad-tpc-v7";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/styles/variables.css",
  "./src/styles/main.css",
  "./icons/logo-placeholder.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.error("[SW] Error precargando archivos:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // nunca intercepta Firebase ni el CDN

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
