'use client';

// Avisos push en la app de la alumna.
//
// `lib/notifications/push-client.ts` ya sabe suscribir un dispositivo, pero
// registra `/sw.js` SIN scope. La app registra el suyo acotado a
// `/portal/<slug>/` (components/student/RegistroSW.tsx) precisamente para que
// el SW no controle también el panel y la landing; un segundo registro sin
// scope desharía eso. Aquí se reutiliza el registro acotado y se manda la
// suscripción al MISMO endpoint que usa el panel: misma tabla
// `push_subscription`, misma clave VAPID, mismo motor. No hay un segundo
// sistema de push.

import { portalAuthHeader } from '@/lib/api-client';
import { esIOS, esStandalone, estadoPermiso, pushSoportado, urlBase64ToUint8Array } from '@/lib/notifications/push-client';
import type { ContextoPush } from '@/lib/student/push-estado';

export type ResultadoPush =
  | { ok: true }
  | { ok: false; motivo: 'unsupported' | 'denied' | 'sin-clave' | 'error'; detalle?: string };

// Mismo scope que RegistroSW: si cambia allí tiene que cambiar aquí.
function scopeDe(slug: string): string {
  return `/portal/${encodeURIComponent(slug)}/`;
}

// `navigator.serviceWorker.ready` no resuelve nunca si ningún SW va a controlar
// la página (desarrollo, o registro fallido). Un interruptor que se queda en
// «activando…» para siempre es peor que un error: se acota.
function conPlazo<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('el service worker no ha arrancado a tiempo')), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

async function registroActivo(slug: string): Promise<ServiceWorkerRegistration | null> {
  const scope = scopeDe(slug);
  let reg = await navigator.serviceWorker.getRegistration(scope);
  if (!reg) {
    // En producción RegistroSW ya lo ha hecho al montar la app; en desarrollo no
    // se registra (cachearía el HTML de Next). Registrarlo aquí bajo demanda con
    // el mismo fichero y el mismo scope no duplica nada.
    try {
      reg = await navigator.serviceWorker.register('/sw.js', { scope });
    } catch {
      return null;
    }
  }
  if (!reg.active) await conPlazo(navigator.serviceWorker.ready, 10_000);
  return reg;
}

/** Lo que el navegador sabe de los avisos en ESTE dispositivo. */
export async function contextoPushStudent(slug: string): Promise<ContextoPush> {
  const permiso = estadoPermiso();
  let suscrita = false;
  if (permiso === 'granted') {
    try {
      const reg = await navigator.serviceWorker.getRegistration(scopeDe(slug));
      suscrita = !!(await reg?.pushManager.getSubscription());
    } catch {
      suscrita = false;
    }
  }
  return {
    permiso,
    esIOS: esIOS(),
    esStandalone: esStandalone(),
    hayClave: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    suscrita,
  };
}

/** Pide permiso, se suscribe con el SW acotado y guarda la suscripción en el servidor. */
export async function activarPushStudent(studioId: string, slug: string): Promise<ResultadoPush> {
  if (!pushSoportado()) return { ok: false, motivo: 'unsupported' };
  const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!clave) return { ok: false, motivo: 'sin-clave' };

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'denied' };

  try {
    const reg = await registroActivo(slug);
    if (!reg) return { ok: false, motivo: 'error', detalle: 'no se ha podido registrar el service worker' };
    // Una suscripción previa con OTRA clave VAPID hace que subscribe() lance
    // InvalidStateError: se cancela antes (mismo cuidado que en el panel).
    const previa = await reg.pushManager.getSubscription();
    if (previa) { try { await previa.unsubscribe(); } catch { /* da igual */ } }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(clave) as BufferSource,
    });
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    });
    if (!res.ok) {
      // Si el servidor no la ha guardado, el navegador no puede quedarse
      // suscrito: la pantalla diría «activado» y no llegaría nunca nada.
      try { await sub.unsubscribe(); } catch { /* da igual */ }
      return { ok: false, motivo: 'error', detalle: `el servidor respondió ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: 'error', detalle: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

/** Borra la suscripción del servidor y del navegador. `false` si el servidor no la ha borrado. */
export async function desactivarPushStudent(slug: string): Promise<boolean> {
  if (!pushSoportado()) return true;
  try {
    const reg = await navigator.serviceWorker.getRegistration(scopeDe(slug));
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return true;
    const res = await fetch('/api/notifications/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    // Se cancela en el navegador aunque el servidor haya fallado: una fila
    // huérfana la limpia el motor al recibir 410; una suscripción viva sin
    // fila sería el caso contrario, y ese no se limpia solo.
    await sub.unsubscribe();
    return res.ok;
  } catch {
    return false;
  }
}
