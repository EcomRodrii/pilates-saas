'use client';

// Derechos RGPD de la alumna, lado cliente: descargar sus datos, pedir al
// estudio que los elimine (o limite/deje de usarlos) y oponerse al perfilado.
// Cada función dice lo que respondió el SERVIDOR — ninguna da nada por hecho.

import { portalAuthHeader } from '@/lib/api-client';
import { descargarBlob, nombreDeDescarga } from '@/lib/descargar-blob';
import type { SolicitudDerechosVista, TipoSolicitudDerechos } from '@/lib/socios/solicitudes-derechos';

export type Resultado = { ok: true } | { ok: false; error: string };

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const d = (await res.json().catch(() => null)) as { error?: string } | null;
  if (res.status === 429) return 'Has hecho demasiados intentos. Espera unos minutos.';
  return d?.error ?? porDefecto;
}

export async function descargarMisDatos(slug: string): Promise<Resultado> {
  try {
    const res = await fetch(`/api/public/mis-datos?slug=${encodeURIComponent(slug)}`, { headers: await portalAuthHeader() });
    if (!res.ok) return { ok: false, error: await mensajeDe(res, 'No hemos podido preparar tus datos.') };
    descargarBlob(await res.blob(), nombreDeDescarga(res, 'mis-datos.json'));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

export interface MisDerechos { excluirDePerfilado: boolean; solicitudes: SolicitudDerechosVista[] }

/**
 * Lanza si falla o si la respuesta no tiene la forma esperada: `useAsync` pinta
 * el error en vez de un estado inventado, y ninguna pantalla lee a ciegas un
 * `{}` como si trajera `solicitudes`.
 */
export async function getMisDerechos(slug: string): Promise<MisDerechos> {
  const res = await fetch(`/api/public/solicitud-derechos?slug=${encodeURIComponent(slug)}`, { headers: await portalAuthHeader() });
  if (!res.ok) throw new Error(`solicitud-derechos respondió ${res.status}`);
  const d = (await res.json().catch(() => null)) as { excluirDePerfilado?: unknown; solicitudes?: unknown } | null;
  if (!d || typeof d.excluirDePerfilado !== 'boolean' || !Array.isArray(d.solicitudes)) {
    throw new Error('solicitud-derechos devolvió una respuesta sin la forma esperada');
  }
  const solicitudes = d.solicitudes.filter((s): s is SolicitudDerechosVista =>
    !!s && typeof s === 'object'
    && typeof (s as SolicitudDerechosVista).tipo === 'string'
    && typeof (s as SolicitudDerechosVista).estado === 'string');
  return { excluirDePerfilado: d.excluirDePerfilado, solicitudes };
}

/**
 * `confirmacion` es la frase que escribió la alumna: el servidor la exige para
 * la supresión (`lib/student/confirmacion-eliminacion.ts`) y la ignora en el resto.
 */
export async function solicitarDerecho(slug: string, tipo: TipoSolicitudDerechos, confirmacion?: string):
Promise<{ ok: true; yaExistia: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/public/solicitud-derechos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ slug, tipo, confirmacion }),
    });
    if (!res.ok) return { ok: false, error: await mensajeDe(res, 'No hemos podido enviar tu solicitud.') };
    const d = (await res.json()) as { yaExistia?: boolean };
    return { ok: true, yaExistia: d.yaExistia === true };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

/** Devuelve el valor que quedó GUARDADO, o `null` si no se pudo guardar. */
export async function guardarOposicionPerfilado(slug: string, excluir: boolean): Promise<boolean | null> {
  try {
    const res = await fetch('/api/public/solicitud-derechos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ slug, excluirDePerfilado: excluir }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { excluirDePerfilado?: boolean };
    return typeof d.excluirDePerfilado === 'boolean' ? d.excluirDePerfilado : null;
  } catch {
    return null;
  }
}
