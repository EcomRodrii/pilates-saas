'use client';

import { portalAuthHeader } from '@/lib/api-client';
import { getClases, getReservas } from '@/lib/student/datos';
import type {
  BajaConClase, ClaseQueDa, ClaseQueReserva, EstadoEnLista, ListaDeClase, OfertaSustitucion,
} from '@/lib/student/agenda-instructora';
import type { AusenciaVista, PerfilInstructora, TipoAusencia } from '@/lib/student/perfil-instructora';
import { normalizarValoraciones } from '@/lib/student/valoraciones-instructora';
import { normalizarRevision, type CategoriaBaja } from '@/lib/student/baja-instructora';
import type { OpcionesNuevaClase } from '@/lib/student/nueva-clase';
import type { AlumnaResumen, FichaAlumna } from '@/lib/student/alumnas-instructora';
import type { SaludAlumna } from '@/lib/datos-salud/salud-para-instructora';
import type { HiloInstructora } from '@/lib/student/mensajes-instructora';
import type { ResultadoAbrir, ResultadoEnviar } from '@/lib/student/mensajeria';
import type { RowMensajes } from '@/lib/db-types';
import { mensajeSeguro } from '@/lib/errores';

// Adaptador de datos de la instructora en la app. Delgado a propósito, como
// `datos.ts`: pide y devuelve; lo que decide vive en el servidor.

export interface AgendaInstructoraVista {
  clases: ClaseQueDa[];
  bajas: BajaConClase[];
  /** Si el estudio le deja crear sus clases. Sin el dato, no se ofrece. */
  puedeCrearClases: boolean;
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
  const conRevision = <T extends { revision?: unknown }>(b: T) => ({ ...b, revision: normalizarRevision(b.revision) });
  return {
    clases: Array.isArray(d.clases) ? d.clases.map((c) => (c.baja ? { ...c, baja: conRevision(c.baja) } : c)) : [],
    bajas: Array.isArray(d.bajas) ? d.bajas.map(conRevision) : [],
    puedeCrearClases: d.puedeCrearClases === true,
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
export async function pedirBaja(
  slug: string, sesionId: string, motivo: string, categoria: CategoriaBaja | null = null,
): Promise<ResultadoPedirBaja> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
  try {
    const res = await fetch('/api/portal/instructora/baja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ slug, sesionId, motivo: motivo.trim() || null, categoria }),
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

async function postInstructora(
  ruta: 'ofertas' | 'lista' | 'perfil' | 'ausencias' | 'clases' | 'alumnas' | 'mensajes', cuerpo: Record<string, unknown>,
): Promise<Response> {
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

/** Sus estudios y su tarifa. Nunca da por hecha la forma de la respuesta. */
export async function getPerfilInstructora(slug: string): Promise<PerfilInstructora> {
  const res = await postInstructora('perfil', { slug });
  if (!res.ok) throw new Error(`instructora/perfil ${res.status}`);
  const d = await res.json() as Partial<PerfilInstructora>;
  return {
    estudios: Array.isArray(d.estudios) ? d.estudios : [],
    tarifa: d.tarifa && typeof d.tarifa === 'object' ? d.tarifa : null,
    valoraciones: normalizarValoraciones(d.valoraciones),
  };
}

export async function getAusenciasInstructora(slug: string): Promise<AusenciaVista[]> {
  const res = await postInstructora('ausencias', { slug, accion: 'leer' });
  if (!res.ok) throw new Error(`instructora/ausencias ${res.status}`);
  const d = await res.json() as { items?: unknown };
  return Array.isArray(d.items) ? d.items as AusenciaVista[] : [];
}

export type ResultadoCrearAusencia =
  | { ok: true; clasesAfectadas: number }
  | { ok: false; error: string; sesionCaducada?: boolean };

/** Solo da por guardada la ausencia que el servidor confirma. No lanza nunca. */
export async function crearAusenciaInstructora(
  slug: string, datos: { tipo: TipoAusencia; desde: string; hasta: string; motivo: string },
): Promise<ResultadoCrearAusencia> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
  try {
    const res = await postInstructora('ausencias', { slug, accion: 'crear', ...datos, motivo: datos.motivo.trim() || null });
    if (res.status === 401) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
    const d = await res.json().catch(() => ({})) as { ok?: boolean; clasesAfectadas?: unknown; error?: string };
    if (!res.ok || !d.ok) return { ok: false, error: d.error || 'No hemos podido guardar tu ausencia. Vuelve a intentarlo.' };
    return { ok: true, clasesAfectadas: typeof d.clasesAfectadas === 'number' ? d.clasesAfectadas : 0 };
  } catch {
    return { ok: false, error: 'Sin conexión: no se ha guardado tu ausencia.' };
  }
}

export async function borrarAusenciaInstructora(
  slug: string, id: string,
): Promise<{ ok: true } | { ok: false; error: string; sesionCaducada?: boolean }> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
  try {
    const res = await postInstructora('ausencias', { slug, accion: 'borrar', id });
    if (res.status === 401) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
    const d = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!res.ok || !d.ok) return { ok: false, error: d.error || 'No hemos podido quitar la ausencia. Vuelve a intentarlo.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión: la ausencia sigue guardada.' };
  }
}

/** Tipos de clase y salas para crear una clase, si el estudio le deja. */
export async function getOpcionesNuevaClase(slug: string): Promise<OpcionesNuevaClase> {
  const res = await postInstructora('clases', { slug, accion: 'opciones' });
  if (!res.ok) throw new Error(`instructora/clases ${res.status}`);
  const d = await res.json() as Partial<OpcionesNuevaClase>;
  return {
    puedeCrear: d.puedeCrear === true,
    tipos: Array.isArray(d.tipos) ? d.tipos : [],
    salas: Array.isArray(d.salas) ? d.salas : [],
  };
}

export type ResultadoCrearClaseApp =
  | { ok: true; sesionId: string }
  | { ok: false; error: string; sesionCaducada?: boolean };

/** Crea su clase. Solo la da por creada si el servidor lo confirma. No lanza nunca. */
export async function crearClaseInstructora(
  slug: string, datos: { tipoClaseId: string; salaId: string; fecha: string; hora: string },
): Promise<ResultadoCrearClaseApp> {
  const auth = await portalAuthHeader();
  if (!auth.Authorization) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
  try {
    const res = await postInstructora('clases', { slug, accion: 'crear', ...datos });
    if (res.status === 401) return { ok: false, error: SESION_CADUCADA, sesionCaducada: true };
    const d = await res.json().catch(() => ({})) as { ok?: boolean; sesionId?: unknown; error?: string };
    if (!res.ok || !d.ok || typeof d.sesionId !== 'string') {
      return { ok: false, error: d.error || 'No hemos podido crear la clase. Vuelve a intentarlo.' };
    }
    return { ok: true, sesionId: d.sesionId };
  } catch {
    return { ok: false, error: 'Sin conexión: la clase no se ha creado.' };
  }
}

/** Sus alumnas (de sus clases de los últimos 30 días y los próximos 30). */
export async function getAlumnasInstructora(slug: string): Promise<AlumnaResumen[]> {
  const res = await postInstructora('alumnas', { slug, accion: 'listar' });
  if (!res.ok) throw new Error(`instructora/alumnas ${res.status}`);
  const d = await res.json() as { alumnas?: unknown };
  return Array.isArray(d.alumnas) ? d.alumnas as AlumnaResumen[] : [];
}

/** La ficha mínima de una alumna suya. `null` si no existe o no es su alumna. */
export async function getFichaAlumna(slug: string, socioId: string): Promise<FichaAlumna | null> {
  const res = await postInstructora('alumnas', { slug, accion: 'ficha', socioId });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`instructora/alumnas ${res.status}`);
  const d = await res.json() as Partial<FichaAlumna>;
  if (!d.socioId) return null;
  return {
    socioId: d.socioId,
    nombre: d.nombre ?? '',
    fotoUrl: d.fotoUrl ?? null,
    primeraClase: d.primeraClase === true,
    tieneCuenta: d.tieneCuenta === true,
    proximas: Array.isArray(d.proximas) ? d.proximas : [],
    pasadas: Array.isArray(d.pasadas) ? d.pasadas : [],
  };
}

/**
 * Los avisos de salud de una alumna suya y sus propias notas. Abrirlo queda
 * registrado en el estudio. `null` si no existe o no es su alumna.
 */
export async function getSaludAlumna(slug: string, socioId: string): Promise<SaludAlumna | null> {
  const res = await postInstructora('alumnas', { slug, accion: 'salud', socioId });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`instructora/alumnas:salud ${res.status}`);
  const d = await res.json() as Partial<Extract<SaludAlumna, { consentimiento: 'VIGENTE' }>> & { consentimiento?: string };
  if (d.consentimiento !== 'VIGENTE') return { consentimiento: 'SIN_CONSENTIMIENTO' };
  return {
    consentimiento: 'VIGENTE',
    semaforo: d.semaforo === 'ROJO' || d.semaforo === 'AMBAR' ? d.semaforo : 'VERDE',
    avisos: Array.isArray(d.avisos) ? d.avisos : [],
    notas: Array.isArray(d.notas) ? d.notas : [],
  };
}

// ── Mensajes con sus alumnas ────────────────────────────────────────────────

async function errorDe(res: Response, respaldo: string): Promise<string> {
  const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
  return cuerpo?.error ? mensajeSeguro(cuerpo.error, respaldo) : respaldo;
}

/** Su bandeja: sus conversaciones con alumnas de este estudio. */
export async function getHilosInstructora(slug: string): Promise<HiloInstructora[]> {
  const res = await postInstructora('mensajes', { slug, accion: 'hilos' });
  if (!res.ok) throw new Error(`instructora/mensajes:hilos ${res.status}`);
  const d = await res.json() as { hilos?: HiloInstructora[] };
  return Array.isArray(d.hilos) ? d.hilos : [];
}

/** Abre (o reutiliza) su conversación con una alumna suya. */
export async function escribirAAlumna(slug: string, socioId: string): Promise<ResultadoAbrir> {
  try {
    const res = await postInstructora('mensajes', { slug, accion: 'abrir', socioId });
    if (!res.ok) return { ok: false, error: await errorDe(res, 'No hemos podido abrir la conversación.') };
    const d = await res.json() as { id?: string };
    return d.id ? { ok: true, id: d.id } : { ok: false, error: 'No hemos podido abrir la conversación.' };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

export async function getMensajesHilo(slug: string, conversacionId: string): Promise<RowMensajes[]> {
  const res = await postInstructora('mensajes', { slug, accion: 'mensajes', conversacionId });
  if (!res.ok) throw new Error(`instructora/mensajes:mensajes ${res.status}`);
  const d = await res.json() as { mensajes?: RowMensajes[] };
  return Array.isArray(d.mensajes) ? d.mensajes : [];
}

export async function enviarEnHiloInstructora(slug: string, conversacionId: string, cuerpo: string): Promise<ResultadoEnviar> {
  try {
    const res = await postInstructora('mensajes', { slug, accion: 'enviar', conversacionId, cuerpo });
    if (!res.ok) return { ok: false, error: await errorDe(res, 'No se ha podido enviar el mensaje.') };
    const d = await res.json() as { mensaje: RowMensajes };
    return { ok: true, mensaje: d.mensaje };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

/** Best-effort: si falla, la bandeja la sigue enseñando sin leer, que es el fallo seguro. */
export async function marcarHiloLeidoInstructora(slug: string, conversacionId: string): Promise<void> {
  try {
    await postInstructora('mensajes', { slug, accion: 'leido', conversacionId });
  } catch { /* best-effort */ }
}
