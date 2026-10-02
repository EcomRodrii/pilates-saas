// Los avisos de la alumna DENTRO de la app de iOS: el mismo circuito que la web
// (`POST /api/notifications/subscribe`, misma tabla, mismo motor), pero el
// dispositivo se registra con su token de APNs en vez de con un service worker
// (lib/notifications/apns.ts). Las funciones de lib/student/push.ts pasan por
// aquí cuando `esAppNativa()`; la pantalla y sus estados no cambian.
//
// Sin 'use client': módulo de funciones, solo lo llaman componentes de cliente.

import { portalAuthHeader } from '@/lib/student/api-publica';
import { datosRegistroToken, permisoPushNativo, registrarPushNativo } from '@/lib/nativo/puente';
import { tocaRenovarPush, type ContextoPush } from '@/lib/student/push-estado';

/** El endpoint con el que el servidor guardó ESTE dispositivo (`apns://…`). Uno por app y aparato. */
const CLAVE_ENDPOINT = 'tentare:push-nativo:endpoint';
const CLAVE_RENOVADO = 'tentare:push-nativo:renovado';

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
};

type Resultado = { ok: true } | { ok: false; motivo: 'unsupported' | 'denied' | 'sin-clave' | 'error'; detalle?: string };

/** Registra el token en APNs y lo guarda en el servidor para ESTE estudio. */
async function registrar(studioId: string): Promise<Resultado> {
  const t = await registrarPushNativo();
  if ('error' in t) return { ok: false, motivo: t.error === 'permiso-denegado' ? 'denied' : 'error', detalle: t.error };
  const nativo = await datosRegistroToken(t.token);
  if (!nativo) return { ok: false, motivo: 'error', detalle: 'sin identificador de la app' };
  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify({ studioId, nativo, userAgent: 'TentareApp iOS' }),
  });
  const datos = (await res.json().catch(() => null)) as { endpoint?: string } | null;
  if (!res.ok || !datos?.endpoint) return { ok: false, motivo: 'error', detalle: `el servidor respondió ${res.status}` };
  escribir(CLAVE_ENDPOINT, datos.endpoint);
  escribir(CLAVE_RENOVADO, String(Date.now()));
  return { ok: true };
}

export async function contextoPushNativo(): Promise<ContextoPush> {
  const permiso = await permisoPushNativo();
  let suscrita = false;
  const endpoint = leer(CLAVE_ENDPOINT);
  if (permiso === 'granted' && endpoint) {
    try {
      const res = await fetch(`/api/notifications/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { headers: await portalAuthHeader() });
      const d = (await res.json().catch(() => null)) as { registrada?: boolean } | null;
      // Sin red no se contradice a lo que sabe el aparato.
      suscrita = res.ok ? d?.registrada === true : true;
    } catch {
      suscrita = true;
    }
  }
  // Dentro de la app no hay «instálala» ni clave VAPID que falte: es la app.
  return { permiso, esIOS: true, esStandalone: true, hayClave: true, suscrita };
}

export const activarPushNativo = (studioId: string) => registrar(studioId);

async function borrarEnServidor(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch('/api/notifications/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ endpoint }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ella apaga los avisos de este dispositivo (el permiso de iOS no se retira desde aquí). */
export async function desactivarPushNativo(): Promise<boolean> {
  const endpoint = leer(CLAVE_ENDPOINT);
  if (!endpoint) return true;
  const ok = await borrarEnServidor(endpoint);
  // Sin la marca local, la renovación diaria no lo vuelve a encender.
  if (ok) escribir(CLAVE_ENDPOINT, null);
  return ok;
}

/**
 * Al cerrar sesión: este aparato deja de recibir los avisos de esa cuenta. Se
 * borra en el servidor pero se recuerda que aquí estaban activados, como en la
 * web: quien entre después los recupera sin que se le vuelva a preguntar.
 */
export async function soltarPushNativo(): Promise<void> {
  const endpoint = leer(CLAVE_ENDPOINT);
  if (endpoint) await borrarEnServidor(endpoint);
  escribir(CLAVE_RENOVADO, null);
}

/**
 * Al abrir la app, como mucho una vez al día, vuelve a mandar el token (iOS
 * puede cambiarlo). Solo si ya tenía los avisos activados aquí: nunca pregunta.
 */
export async function renovarPushNativo(studioId: string): Promise<void> {
  if (!leer(CLAVE_ENDPOINT) || (await permisoPushNativo()) !== 'granted') return;
  const ultima = Number(leer(CLAVE_RENOVADO) ?? 'NaN');
  if (!tocaRenovarPush(Number.isFinite(ultima) ? ultima : null, Date.now())) return;
  if (!(await portalAuthHeader()).Authorization) return;
  await registrar(studioId).catch(() => undefined);
}
