import type { Clase, Reserva } from './tipos.ts';

// «Mis reservas en mi calendario» (Perfil, solo en la app de iOS). Puro: qué
// eventos crear, cambiar y quitar, y dónde se guarda la memoria. Quien habla con
// el calendario es `lib/student/calendario-dispositivo.ts`.
//
// La memoria de qué evento creó la app para cada clase vive EN EL DISPOSITIVO
// (localStorage) y es POR PERSONA Y ESTUDIO: en un iPad compartido, la memoria de
// una alumna no puede servirle a otra para borrar o crear nada. La clave es la
// CLASE (sesión), no la reserva: una alumna tiene como mucho una reserva por clase.

/** Lo que se escribe en el calendario de una clase. */
export interface DatosEvento {
  titulo: string;
  inicioMs: number;
  finMs: number;
  lugar?: string;
  notas?: string;
}

/** Un evento que creó la app: su id en el calendario y la huella con la que se creó. */
export interface EventoApuntado { id: string; huella: string }

/** claseId → el evento que la app creó para ella. */
export type MapaEventos = Record<string, EventoApuntado>;

/**
 * Lo que distingue un evento de otro a ojos de la alumna. Si el estudio mueve la
 * clase de hora (o le cambia el nombre), la huella cambia y el evento se pone al
 * día: si no, el calendario seguiría diciendo la hora vieja.
 */
export function huellaEvento(e: Pick<DatosEvento, 'titulo' | 'inicioMs' | 'finMs'>): string {
  return `${e.inicioMs}|${e.finMs}|${e.titulo}`;
}

export interface PlanCalendario {
  crear: Clase[];
  /** Clases cuyo evento existe pero con otra hora o título: [clase, eventoId]. */
  actualizar: Array<[Clase, string]>;
  /** Pares [claseId, eventoId] a quitar del calendario y de la memoria. */
  quitar: Array<[string, string]>;
  /** Clases que ya pasaron o a las que ya fue: salen de la memoria, su evento se queda (es su historial). */
  olvidar: string[];
}

const PASADAS: ReadonlySet<Reserva['estado']> = new Set(['asistida', 'no-asistida']);
const QUITADAS: ReadonlySet<Reserva['estado']> = new Set(['cancelada', 'en-espera']);

/**
 * Lo que hay que hacer para que el calendario tenga exactamente sus reservas
 * CONFIRMADAS que aún no han empezado, con su hora de verdad.
 *
 * Por clase apuntada en la memoria, según su reserva:
 *   · confirmada y por venir   → se queda (o se actualiza si cambió la huella);
 *   · asistida / no-asistida   → se OLVIDA, esté o no la clase en el catálogo: ya
 *     pasó, y ese evento es su historial (puede haber fichado antes de empezar);
 *   · cancelada / en espera    → se QUITA;
 *   · confirmada pero la clase ya empezó o ya no sale en el catálogo (el catálogo
 *     solo trae clases sin terminar) → se olvida;
 *   · sin reserva: si la clase futura SÍ se ve, se quita (ya no tiene reserva);
 *     si ni la clase ni la reserva se ven, no se toca: no saber no es «ya no está».
 */
export function planCalendario(
  reservas: Reserva[], clases: Clase[], mapa: MapaEventos, ahoraMs: number,
  datosDe: (c: Clase) => DatosEvento,
): PlanCalendario {
  const porId = new Map(clases.map((c) => [c.id, c]));
  const estadosDe = new Map<string, Set<Reserva['estado']>>();
  for (const r of reservas) {
    const s = estadosDe.get(r.claseId) ?? new Set<Reserva['estado']>();
    s.add(r.estado);
    estadosDe.set(r.claseId, s);
  }
  const porVenir = (c: Clase | undefined): c is Clase => Boolean(c) && new Date(c!.inicio).getTime() > ahoraMs;

  const vigentes = [...estadosDe.entries()]
    .filter(([id, s]) => s.has('confirmada') && porVenir(porId.get(id)))
    .map(([id]) => porId.get(id)!);

  const plan: PlanCalendario = { crear: [], actualizar: [], quitar: [], olvidar: [] };
  for (const c of vigentes) {
    const apuntado = mapa[c.id];
    if (!apuntado) plan.crear.push(c);
    else if (apuntado.huella !== huellaEvento(datosDe(c))) plan.actualizar.push([c, apuntado.id]);
  }
  const vigenteIds = new Set(vigentes.map((c) => c.id));
  for (const [claseId, apuntado] of Object.entries(mapa)) {
    if (vigenteIds.has(claseId)) continue;
    const estados = estadosDe.get(claseId);
    const clase = porId.get(claseId);
    if (estados && [...estados].some((e) => PASADAS.has(e))) { plan.olvidar.push(claseId); continue; }
    if (estados?.has('confirmada')) { plan.olvidar.push(claseId); continue; } // empezada o fuera del catálogo
    if (estados && [...estados].some((e) => QUITADAS.has(e))) { plan.quitar.push([claseId, apuntado.id]); continue; }
    // Sin reserva suya para esa clase.
    if (porVenir(clase)) plan.quitar.push([claseId, apuntado.id]);
    else if (clase) plan.olvidar.push(claseId);
    // Ni clase ni reserva a la vista: no se toca.
  }
  return plan;
}

export interface ResultadoSincronizacion {
  /** No se hizo nada: interruptor apagado, sin persona o sin saber quién es. */
  omitida: boolean;
  creados: number;
  actualizados: number;
  quitados: number;
  /** Eventos que debían crearse o cambiarse y el calendario no aceptó. */
  fallidos: number;
}

/** Lo que de verdad pasó, no un «ya están» por defecto. */
export function textoTrasActivar(r: ResultadoSincronizacion): string {
  if (r.omitida) return 'Activado. Tus próximas reservas irán apareciendo en tu calendario.';
  if (r.fallidos > 0 && r.creados === 0) return 'Activado, pero el calendario no ha aceptado tus reservas. Revisa el permiso en Ajustes.';
  if (r.fallidos > 0) return `Añadidas ${r.creados} de ${r.creados + r.fallidos} reservas a tu calendario.`;
  if (r.creados === 0) return 'Activado. Ahora mismo no tienes reservas que añadir.';
  return r.creados === 1 ? 'Tu reserva ya está en tu calendario' : `Tus ${r.creados} reservas ya están en tu calendario`;
}

// ─── La memoria en el dispositivo ──────────────────────────────────────────

export const PREFIJO_CALENDARIO = 'tentare:calendario:';

/** La clave de UNA persona en UN estudio. Sin persona no hay clave (no se guarda nada). */
export function claveCalendario(slug: string, persona: string | null): string | null {
  return persona ? `${PREFIJO_CALENDARIO}${slug}:${persona}` : null;
}

export interface AjusteCalendario { activo: boolean; mapa: MapaEventos }
type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const almacenDeLaVentana = (): Almacen | null => {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
};

export function leerAjuste(slug: string, persona: string | null, almacen: Almacen | null = almacenDeLaVentana()): AjusteCalendario {
  const clave = claveCalendario(slug, persona);
  if (!clave || !almacen) return { activo: false, mapa: {} };
  try {
    const raw = almacen.getItem(clave);
    if (!raw) return { activo: false, mapa: {} };
    const v = JSON.parse(raw) as { activo?: unknown; mapa?: unknown };
    const mapa: MapaEventos = {};
    if (v.mapa && typeof v.mapa === 'object') {
      for (const [k, e] of Object.entries(v.mapa as Record<string, unknown>)) {
        const x = e as { id?: unknown; huella?: unknown } | null;
        if (x && typeof x.id === 'string') mapa[k] = { id: x.id, huella: typeof x.huella === 'string' ? x.huella : '' };
      }
    }
    return { activo: v.activo === true, mapa };
  } catch {
    return { activo: false, mapa: {} };
  }
}

export function guardarAjuste(
  slug: string, persona: string | null, a: AjusteCalendario, almacen: Almacen | null = almacenDeLaVentana(),
): void {
  const clave = claveCalendario(slug, persona);
  if (!clave || !almacen) return;
  try { almacen.setItem(clave, JSON.stringify(a)); } catch { /* sin almacenamiento, sin memoria */ }
}

export function borrarAjuste(slug: string, persona: string | null, almacen: Almacen | null = almacenDeLaVentana()): void {
  const clave = claveCalendario(slug, persona);
  if (!clave || !almacen) return;
  try { almacen.removeItem(clave); } catch { /* nada que borrar */ }
}
