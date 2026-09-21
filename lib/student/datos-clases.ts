'use client';

import { portalAuthHeader } from '@/lib/api-client';
import type { EstadoClases, ModoConfirmar } from '@/lib/fichaje/clases-impartidas';

// Adaptador de las clases impartidas en la app de la instructora. Delgado: pide y
// devuelve; lo que decide vive en `/api/portal/instructora/clases`.

export type { EstadoClases, ModoConfirmar };

const VACIO: EstadoClases = { relacion: null, actual: null, pendientes: [] };

function normalizar(e: Partial<EstadoClases> | undefined): EstadoClases {
  if (!e) return VACIO;
  return {
    relacion: e.relacion === 'CONTRATADA' || e.relacion === 'AUTONOMA' ? e.relacion : null,
    actual: e.actual && typeof e.actual.id === 'string' ? e.actual : null,
    pendientes: Array.isArray(e.pendientes) ? e.pendientes : [],
  };
}

async function llamar(slug: string, cuerpo: Record<string, unknown>) {
  const res = await fetch('/api/portal/instructora/clases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify({ slug, ...cuerpo }),
  });
  const d = (await res.json().catch(() => ({}))) as { error?: string; estado?: Partial<EstadoClases>; errores?: { sesionId: string; error: string }[]; jornadaAbierta?: boolean };
  return { ok: res.ok, status: res.status, d };
}

export async function getEstadoClases(slug: string): Promise<EstadoClases> {
  const r = await llamar(slug, { accion: 'estado' });
  if (!r.ok) throw new Error(`instructora/clases ${r.status}`);
  return normalizar(r.d.estado);
}

export type Resultado = { ok: true; estado: EstadoClases; aviso?: string } | { ok: false; error: string; estado?: EstadoClases };

export async function empezarClase(slug: string, sesionId: string): Promise<Resultado> {
  try {
    const r = await llamar(slug, { accion: 'empezar', sesionId });
    if (!r.ok) return { ok: false, error: r.d.error ?? 'No hemos podido empezarla. Inténtalo de nuevo.' };
    return { ok: true, estado: normalizar(r.d.estado), aviso: r.d.jornadaAbierta ? 'También te hemos fichado la entrada.' : undefined };
  } catch {
    return { ok: false, error: 'Sin conexión: inténtalo cuando vuelvas a tener cobertura.' };
  }
}

export async function terminarAntes(slug: string, sesionId: string, fin: string): Promise<Resultado> {
  try {
    const r = await llamar(slug, { accion: 'terminar', sesionId, fin });
    if (!r.ok) return { ok: false, error: r.d.error ?? 'No hemos podido guardarlo. Inténtalo de nuevo.' };
    return { ok: true, estado: normalizar(r.d.estado) };
  } catch {
    return { ok: false, error: 'Sin conexión: inténtalo cuando vuelvas a tener cobertura.' };
  }
}

export async function confirmarClases(
  slug: string, items: { sesionId: string; modo: ModoConfirmar; inicio?: string; fin?: string }[],
): Promise<Resultado> {
  try {
    const r = await llamar(slug, { accion: 'confirmar', items });
    if (!r.ok) return { ok: false, error: r.d.error ?? 'No hemos podido guardarlo. Inténtalo de nuevo.' };
    const fallos = r.d.errores ?? [];
    // Las que sí se guardaron, guardadas quedan: se devuelve el estado nuevo también con fallos.
    return fallos.length > 0
      ? { ok: false, error: fallos[0].error, estado: normalizar(r.d.estado) }
      : { ok: true, estado: normalizar(r.d.estado) };
  } catch {
    return { ok: false, error: 'Sin conexión: inténtalo cuando vuelvas a tener cobertura.' };
  }
}
