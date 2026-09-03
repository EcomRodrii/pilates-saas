/* Service Worker de Tentare.

   DOS responsabilidades, y conviene no confundirlas:

   1. Web Push (Notification Engine, PR2) — lo de siempre, intacto: muestra la
      notificación al recibir un push y abre su deep link al pulsarla.

   2. Caché de lectura de la Student PWA (app/portal/<slug>) — nuevo. Viene del
      `public/sw.js` del paquete de diseño, FUSIONADO aquí en vez de sustituir
      este fichero: reemplazarlo habría dejado sin avisos a todo el producto.

   ⚠️ REGLA QUE NO SE TOCA: solo se cachean GET, y solo de la app de la alumna.
   Nunca POST (reservar, cancelar, pagar), nunca `/api/`, nunca nada con
   `Authorization`. Una reserva servida de caché sería una reserva inventada.
*/

// ───────────────────────────────────────────────────────────────────────────
// 1. Web Push — sin cambios
// ───────────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'Tentare';
  const options = {
    body: data.body || '',
    // El icono era SIEMPRE el genérico de Tentare. El servidor manda ya
    // siempre uno propio del estudio (su logo si lo subió, si no un monograma
    // con su inicial y su color de marca — lib/monograma-estudio.ts): este
    // fallback a `/icon-192.png` solo cubre un payload viejo o incompleto, no
    // el camino normal. El badge (icono pequeño de Android, normalmente lo
    // enmascara el propio sistema) se queda con el genérico a propósito — no
    // aporta nada personalizarlo ahí.
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && 'focus' in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Caché de la Student PWA
//
// Estrategia: network-first con respaldo de caché, y `/portal/offline` cuando
// ni una ni otra. Network-first y no cache-first porque el horario y el aforo
// cambian por minutos: servir una clase llena desde caché haría que la alumna
// pulse «Reservar» para que el servidor la rechace.
// ───────────────────────────────────────────────────────────────────────────

const CACHE = 'tentare-student-v1';
const OFFLINE_URL = '/portal/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL])));
  // La pantalla offline tiene que estar disponible desde la primera visita.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** ¿Esta petición se puede guardar? Lista blanca, no lista negra. */
function cacheable(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  // Solo el propio origen: nada de terceros.
  if (url.origin !== self.location.origin) return false;
  // Solo la app de la alumna. El panel, la landing y /reservar quedan fuera:
  // este SW no estaba en su camino y meterlo ahí sería un cambio de
  // comportamiento que nadie ha pedido.
  if (!url.pathname.startsWith('/portal/')) return false;
  // Nunca las APIs: llevan datos de la socia y su frescura importa.
  if (url.pathname.startsWith('/api/')) return false;
  // Ni nada que viaje autenticado.
  if (request.headers.has('authorization')) return false;

  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!cacheable(request)) return;   // sin respondWith: va a la red tal cual

  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        // Solo se guardan respuestas completas y correctas. Un 404 o una
        // respuesta parcial en caché es peor que no tener nada.
        if (respuesta && respuesta.ok && respuesta.status === 200) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(request, copia));
        }
        return respuesta;
      })
      .catch(() =>
        caches.match(request).then((guardada) => {
          if (guardada) return guardada;
          // Navegación sin red y sin copia: la pantalla de respaldo.
          if (request.mode === 'navigate') return caches.match(OFFLINE_URL);
          return Response.error();
        }),
      ),
  );
});
