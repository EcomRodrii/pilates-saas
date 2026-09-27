// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — Web Push en el navegador (PR2).
// Registra el Service Worker, pide permiso, se suscribe con la clave pública
// VAPID y guarda la suscripción en el servidor. En iPhone requiere que la PWA
// esté INSTALADA (Añadir a pantalla de inicio) y iOS 16.4+.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContextoPush } from '../student/push-estado.ts';

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

export function urlBase64ToUint8Array(base64: string): Uint8Array {
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

// iPhone/iPad: Web Push solo funciona si la PWA está INSTALADA (Añadir a inicio)
// e iOS 16.4+. En una pestaña normal de Safari, PushManager no existe, así que
// `pushSoportado()` da false y no se distingue de "navegador incompatible". Estas
// dos permiten mostrar la pista de "Añadir a inicio" solo cuando de verdad aplica.
export function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS moderno se presenta como Mac; se distingue por el táctil.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function esStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

// ── Estado VERDADERO de los avisos en este dispositivo ──────────────────────
//
// Antes la pantalla decía «activados» con solo mirar `Notification.permission`:
// permiso concedido no es suscripción, y suscripción del navegador no es fila en
// el servidor. Las tres cosas tienen que ser verdad a la vez.

/** `true`/`false` = respuesta del servidor; `null` = no se pudo preguntar (sin red). */
export async function suscripcionRegistradaEnServidor(endpoint: string, getHeaders: Headers): Promise<boolean | null> {
  try {
    const res = await fetch(`/api/notifications/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { headers: { ...(await getHeaders()) } });
    if (!res.ok) return null;
    return ((await res.json()) as { registrada?: boolean }).registrada === true;
  } catch { return null; }
}

/** Vuelve a mandar al servidor una suscripción que el navegador ya tiene. */
export async function registrarSuscripcionEnServidor(studioId: string, sub: PushSubscription, getHeaders: Headers): Promise<boolean> {
  try {
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getHeaders()) },
      body: JSON.stringify({ studioId, subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    });
    return res.ok;
  } catch { return false; }
}

/**
 * Lo que sabe el navegador Y el servidor. Si el navegador está suscrito pero el
 * servidor no lo sabe, se intenta repararlo en el acto: con el permiso ya dado no
 * hace falta preguntar nada. Solo si la reparación falla se dice «sin activar».
 */
export async function confirmarSuscripcion(
  reg: ServiceWorkerRegistration | null | undefined, studioId: string | null, getHeaders: Headers,
): Promise<boolean> {
  let sub: PushSubscription | null = null;
  try { sub = (await reg?.pushManager.getSubscription()) ?? null; } catch { sub = null; }
  if (!sub) return false;
  const enServidor = await suscripcionRegistradaEnServidor(sub.endpoint, getHeaders);
  if (enServidor === null || enServidor) return true; // sin red: no se contradice al navegador
  if (!studioId) return false;
  return registrarSuscripcionEnServidor(studioId, sub, getHeaders);
}

/** Contexto para el PANEL (service worker de scope raíz). */
export async function contextoPushPanel(studioId: string, getHeaders: Headers): Promise<ContextoPush> {
  const permiso = estadoPermiso();
  let suscrita = false;
  if (permiso === 'granted') {
    try { suscrita = await confirmarSuscripcion(await navigator.serviceWorker.getRegistration(), studioId, getHeaders); } catch { suscrita = false; }
  }
  return { permiso, esIOS: esIOS(), esStandalone: esStandalone(), hayClave: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, suscrita };
}

/**
 * Al cerrar sesión: este dispositivo deja de recibir los avisos de esa cuenta.
 * Se borra la fila del servidor (no la suscripción del navegador, para que al
 * volver a entrar no haya que pedir permiso otra vez). Hay que llamarla ANTES de
 * `signOut`: sin sesión el servidor no sabría de quién es la fila. Best-effort.
 */
export async function soltarDispositivoEnServidor(getHeaders: Headers): Promise<void> {
  if (!pushSoportado()) return;
  try {
    const cabeceras = await getHeaders();
    if (!cabeceras.Authorization) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const sub = await reg.pushManager.getSubscription();
      if (!sub) continue;
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...cabeceras },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    }
  } catch { /* cerrar sesión no puede depender de esto */ }
}
