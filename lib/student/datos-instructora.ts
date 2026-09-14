'use client';

import { portalAuthHeader } from '@/lib/api-client';
import { getClases, getReservas } from '@/lib/student/datos';
import type {
  BajaConClase, ClaseQueDa, ClaseQueReserva, EstadoEnLista, ListaDeClase, OfertaSustitucion,
} from '@/lib/student/agenda-instructora';

// Adaptador de datos de la instructora en la app. Delgado a propósito, como
// `datos.ts`: pide y devuelve; lo que decide vive en el servidor.

export interface AgendaInstructoraVista {
  clases: ClaseQueDa[];
  bajas: BajaConClase[];
}

/** Sus clases y sus bajas entre dos días (YYYY-MM-DD, ambos incluidos). */
export async function getAgendaInstructora(slug: string, desde: string, hasta: string): Promise<AgendaInstructoraVista> {
  const auth = await portalAuthHeader();
  const res = await fetch('/api/portal/instructora/agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ slug, desde, hasta }),
  });
  if (!res.ok) throw new Error(`instructora/agenda ${res.status}`);
  // ⚠️ Nunca dar por hecha la forma de la respuesta: un `{}` no puede tumbar la
  // pantalla (lo aprendió el dashboard del panel con un e2e ajeno).
  const d = await res.json() as Partial<AgendaInstructoraVista>;
  return {
    clases: Array.isArray(d.clases) ? d.clases : [],
    bajas: Array.isArray(d.bajas) ? d.bajas : [],
  };
}

/**
 * Las clases a las que viene COMO ALUMNA, para la agenda única.
 *
 * Sale del mismo catálogo que usa la app de la alumna (ni una petición nueva):
 * solo tiene sentido si además tiene ficha de alumna en el estudio, y quien
 * llama lo decide con la sesión.
 */
export async function getClasesComoAlumna(slug: string, desde: string, hasta: string): Promise<ClaseQueReserva[]> {
  const [reservas, clases] = await Promise.all([getReservas(slug), getClases(slug)]);
  const porId = new Map(clases.map((c) => [c.id, c]));
  const filas: ClaseQueReserva[] = [];
  for (const r of reservas) {
    if (r.estado !== 'confirmada' && r.estado !== 'en-espera') continue;
    const c = porId.get(r.claseId);
    if (!c || c.fecha < desde || c.fecha > hasta) continue;
    filas.push({
      reservaId: r.id, claseId: c.id, inicio: c.inicio, fecha: c.fecha, hora: c.hora,
      tipo: c.nombre, sala: c.sala || null, enEspera: r.estado === 'en-espera',
    });
  }
  return filas;
}

const SESION_CADUCADA = 'Tu sesión ha caducado. Vuelve a entrar.';

export type ResultadoPedirBaja =
  | { ok: true; yaAvisada: boolean }
  | { ok: false; error: string; sesionCaducada?: boolean };

/**
 * «No puedo dar esta clase». No lanza nunca: cualquier fallo se traduce a un
 * mensaje que la pantalla sabe pintar, y nunca se da por hecha la baja sin la
 * respuesta del servidor (la clase sigue a su nombre hasta que él diga que sí).
 */
export async function pedirBaja(slug: string, sesionId: string, motivo: string): Promise<ResultadoPedirBaja> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
  try {
    const res = await fetch('/api/portal/instructora/baja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ slug, sesionId, motivo: motivo.trim() || null }),
    });
    if (res.status === 401) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
    const d = await res.json().catch(() => ({})) as { ok?: boolean; yaAvisada?: boolean; error?: string };
    if (!res.ok || !d.ok) {
      return { ok: false, error: d.error || 'No hemos podido avisar al estudio. Tu clase sigue a tu nombre: inténtalo de nuevo.' };
    }
    return { ok: true, yaAvisada: Boolean(d.yaAvisada) };
  } catch {
    return { ok: false, error: 'Sin conexión: no hemos podido avisar al estudio. Tu clase sigue a tu nombre.' };
  }
}

async function postDisponibilidad(slug: string, cuerpo: Record<string, unknown>): Promise<Response> {
  const auth = await portalAuthHeader();
  return fetch('/api/portal/instructora/disponibilidad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ slug, ...cuerpo }),
  });
}

/** Las franjas en las que ha dicho que puede cubrir (claves de `celdaKey`). */
export async function getDisponibilidadInstructora(slug: string): Promise<string[]> {
  const res = await postDisponibilidad(slug, { accion: 'leer' });
  if (!res.ok) throw new Error(`instructora/disponibilidad ${res.status}`);
  const d = await res.json() as { celdas?: unknown };
  return Array.isArray(d.celdas) ? d.celdas.filter((c): c is string => typeof c === 'string') : [];
}

/** Reemplaza su disponibilidad. Solo da por guardado lo que el servidor confirma. */
export async function guardarDisponibilidadInstructora(
  slug: string, celdas: readonly string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await postDisponibilidad(slug, { accion: 'guardar', celdas });
    const d = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (res.status === 401) return { ok: false, error: SESION_CADUCADA };
    if (!res.ok || !d.ok) return { ok: false, error: d.error || 'No hemos podido guardar tu disponibilidad. Vuelve a intentarlo.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión: no se ha guardado. Vuelve a intentarlo cuando tengas cobertura.' };
  }
}

async function postInstructora(ruta: 'ofertas' | 'lista', cuerpo: Record<string, unknown>): Promise<Response> {
  const auth = await portalAuthHeader();
  return fetch(`/api/portal/instructora/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(cuerpo),
  });
}

/** Lo que el motor le está pidiendo cubrir ahora mismo. */
export async function getOfertasInstructora(slug: string): Promise<OfertaSustitucion[]> {
  const res = await postInstructora('ofertas', { slug, accion: 'listar' });
  if (!res.ok) throw new Error(`instructora/ofertas ${res.status}`);
  const d = await res.json() as { ofertas?: unknown };
  return Array.isArray(d.ofertas) ? d.ofertas as OfertaSustitucion[] : [];
}

export type ResultadoOferta =
  | { ok: true }
  /** Con `motivo`, el servidor contestó (llega tarde, ya no le toca…); sin él, no se sabe si llegó. */
  | { ok: false; error: string; motivo?: string; sesionCaducada?: boolean };

/** «La cubro» / «No puedo». No lanza nunca y no da nada por hecho sin el servidor. */
export async function responderOferta(
  slug: string, sustitucionId: string, accion: 'aceptar' | 'rechazar',
): Promise<ResultadoOferta> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
  try {
    const res = await postInstructora('ofertas', { slug, accion, sustitucionId });
    if (res.status === 401) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
    const d = await res.json().catch(() => ({})) as { ok?: boolean; motivo?: string; error?: string };
    if (!res.ok || !d.ok) {
      return {
        ok: false,
        error: d.error || 'No hemos podido enviar tu respuesta. Vuelve a intentarlo.',
        motivo: typeof d.motivo === 'string' ? d.motivo : undefined,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión: no hemos podido enviar tu respuesta.' };
  }
}

/** La lista de una clase suya. `null` si no existe o ya no es suya. */
export async function getListaClase(slug: string, sesionId: string): Promise<ListaDeClase | null> {
  const res = await postInstructora('lista', { slug, sesionId, accion: 'leer' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`instructora/lista ${res.status}`);
  const d = await res.json() as Partial<ListaDeClase>;
  if (!d.clase) return null;
  return { clase: d.clase, alumnas: Array.isArray(d.alumnas) ? d.alumnas : [] };
}

export type ResultadoMarcarAsistencia =
  | { ok: true; estado: EstadoEnLista }
  | { ok: false; error: string; sesionCaducada?: boolean };

/** Marca «Asistió» o lo deshace. Lo que se pinta después es el estado que devuelve el servidor. */
export async function marcarAsistenciaEnLista(
  slug: string, sesionId: string, reservaId: string, accion: 'asistio' | 'deshacer',
): Promise<ResultadoMarcarAsistencia> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
  try {
    const res = await postInstructora('lista', { slug, sesionId, reservaId, accion });
    if (res.status === 401) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
    const d = await res.json().catch(() => ({})) as { ok?: boolean; estado?: string; error?: string };
    if (!res.ok || !d.ok || (d.estado !== 'asistio' && d.estado !== 'por-marcar')) {
      return { ok: false, error: d.error || 'No se ha guardado. Vuelve a intentarlo.' };
    }
    return { ok: true, estado: d.estado };
  } catch {
    return { ok: false, error: 'Sin conexión: no se ha guardado.' };
  }
}
