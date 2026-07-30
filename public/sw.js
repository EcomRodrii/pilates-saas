/* Service Worker de Tentare — Web Push (Notification Engine, PR2).
   Muestra la notificación al recibir un push y, al pulsarla, abre el recurso
   (deep link) enfocando una pestaña existente si la hay. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'Tentare';
  const options = {
    body: data.body || '',
    // El icono era SIEMPRE el genérico de Tentare. Si el estudio tiene su
    // propio logo subido (Configuración → Apariencia), el servidor lo manda
    // en el payload y se usa aquí; si no, cae al genérico. El badge (icono
    // pequeño de Android, normalmente lo enmascara el propio sistema) se
    // queda con el genérico a propósito — no aporta nada personalizarlo ahí.
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
