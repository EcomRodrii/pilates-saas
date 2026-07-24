// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — Web Push en el navegador (PR2).
// Registra el Service Worker, pide permiso, se suscribe con la clave pública
// VAPID y guarda la suscripción en el servidor. En iPhone requiere que la PWA
// esté INSTALADA (Añadir a pantalla de inicio) y iOS 16.4+.
// ─────────────────────────────────────────────────────────────────────────────

type Headers = () => Promise<Record<string, string>>;

export function pushSoportado(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function estadoPermiso(): NotificationPermission | 'unsupported' {
  if (!pushSoportado()) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type ResultadoActivar =
  | { ok: true }
  | { ok: false; motivo: 'unsupported' | 'denied' | 'sin-clave' | 'error'; detalle?: string };

// Activa las notificaciones push en ESTE dispositivo.
export async function activarPush(studioId: string, getHeaders: Headers): Promise<ResultadoActivar> {
  if (!pushSoportado()) return { ok: false, motivo: 'unsupported' };
  const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!clave) return { ok: false, motivo: 'sin-clave' };

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'denied' };

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    // Si ya había una suscripción (posiblemente con OTRA clave VAPID de un intento
    // anterior), se cancela antes: subscribe() con distinta applicationServerKey
    // lanza InvalidStateError y el registro nunca llegaba al servidor.
    const previa = await reg.pushManager.getSubscription();
    if (previa) { try { await previa.unsubscribe(); } catch { /* da igual */ } }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(clave) as BufferSource,
    });
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getHeaders()) },
      body: JSON.stringify({ studioId, subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    });
    if (!res.ok) return { ok: false, motivo: 'error', detalle: `el servidor respondió ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: 'error', detalle: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

// Desactiva en este dispositivo (cancela la suscripción y la borra del servidor).
export async function desactivarPush(getHeaders: Headers): Promise<void> {
  if (!pushSoportado()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await getHeaders()) },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch { /* best-effort */ }
}
