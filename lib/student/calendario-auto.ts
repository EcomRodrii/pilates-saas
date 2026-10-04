import type { Clase, Reserva } from './tipos.ts';

// «Mis reservas en mi calendario» (Perfil, solo en la app de iOS). Puro: qué
// eventos crear y cuáles quitar. Quien habla con el calendario es
// `lib/student/calendario-dispositivo.ts`.
//
// La memoria de qué evento creó la app para cada clase vive EN EL DISPOSITIVO
// (localStorage, por estudio): el calendario es del iPhone, no de la cuenta, y
// en otro móvil no hay nada que borrar. La clave es la CLASE (sesión), no la
// reserva: una alumna tiene como mucho una reserva por clase, y así «+ Calendario»
// de la ficha —que conoce la clase, no siempre la reserva— apunta en la misma
// memoria y la sincronización no la duplica.

/** claseId → id del evento en el calendario del iPhone. */
export type MapaEventos = Record<string, string>;

export interface PlanCalendario {
  crear: Clase[];
  /** Pares [claseId, eventoId] a quitar del calendario y de la memoria. */
  quitar: Array<[string, string]>;
  /** Clases ya pasadas: salen de la memoria, su evento se queda (es su historial). */
  olvidar: string[];
}

/**
 * Lo que hay que hacer para que el calendario tenga exactamente sus reservas
 * CONFIRMADAS que aún no han empezado.
 *
 * Se quita: lo apuntado cuya reserva ya no está confirmada (canceló, la quitó el
 * estudio, pasó a lista de espera). Lo que no se ve en el catálogo (ni la clase
 * ni su reserva) no se toca: no saber no es «ya no está». NO se quita lo que ya pasó: es su historial, y borrarlo de su
 * calendario sería tocar algo que ya es suyo. Lo pasado solo sale de la memoria.
 */
export function planCalendario(
  reservas: Reserva[], clases: Clase[], mapa: MapaEventos, ahoraMs: number,
): PlanCalendario {
  const porId = new Map(clases.map((c) => [c.id, c]));
  const vigentes = new Set(
    reservas
      .filter((r) => r.estado === 'confirmada')
      .map((r) => porId.get(r.claseId))
      .filter((c): c is Clase => Boolean(c) && new Date(c!.inicio).getTime() > ahoraMs)
      .map((c) => c.id),
  );
  const crear = [...vigentes].filter((id) => !mapa[id]).map((id) => porId.get(id)!);
  const quitar: Array<[string, string]> = [];
  const olvidar: string[] = [];
  const confirmadas = new Set(reservas.filter((r) => r.estado === 'confirmada').map((r) => r.claseId));
  const conReserva = new Set(reservas.map((r) => r.claseId));
  for (const [claseId, eventoId] of Object.entries(mapa)) {
    if (vigentes.has(claseId)) continue;
    const c = porId.get(claseId);
    if (c && new Date(c.inicio).getTime() <= ahoraMs) { olvidar.push(claseId); continue; }
    // Ni la clase ni ninguna reserva suya a la vista (el catálogo trae una
    // ventana de fechas, y «+ Calendario» puede apuntar una clase de más
    // adelante): sin saber nada, no se toca. Basta con que haya una reserva NO
    // confirmada de esa clase, o la clase futura sin reserva confirmada.
    if (!c && !conReserva.has(claseId)) continue;
    if (confirmadas.has(claseId) && !c) continue;
    quitar.push([claseId, eventoId]);
  }
  return { crear, quitar, olvidar };
}

const clave = (slug: string) => `tentare:calendario:${slug}`;

export function leerAjuste(slug: string): { activo: boolean; mapa: MapaEventos } {
  try {
    const raw = window.localStorage.getItem(clave(slug));
    if (!raw) return { activo: false, mapa: {} };
    const v = JSON.parse(raw) as { activo?: unknown; mapa?: unknown };
    const mapa: MapaEventos = {};
    if (v.mapa && typeof v.mapa === 'object') {
      for (const [k, id] of Object.entries(v.mapa as Record<string, unknown>)) if (typeof id === 'string') mapa[k] = id;
    }
    return { activo: v.activo === true, mapa };
  } catch {
    return { activo: false, mapa: {} };
  }
}

export function guardarAjuste(slug: string, a: { activo: boolean; mapa: MapaEventos }): void {
  try { window.localStorage.setItem(clave(slug), JSON.stringify(a)); } catch { /* sin almacenamiento, sin memoria */ }
}
