// Plaza fija y recuperaciones (F2, el caso canónico). Sin imports ni `@/`.
//
// El backend las tiene enteras (`plazas_fijas`, `recuperaciones`,
// `crear_recuperacion` al cancelar una ocurrencia) y el payload las trae; la
// app de la alumna las ignoraba. Aquí solo se proyecta: quién tiene plaza, si
// está activa y cuándo es la próxima; y cuántas recuperaciones puede usar y
// cuándo caduca la primera. NADA de aquí decide una reserva: eso lo hace el
// servidor con su propia regla.

export interface PlazaFijaMin {
  diaSemana: number;          // 0=domingo … 6=sábado
  horaInicio: string;         // 'HH:MM[:SS]'
  salaId: string;
  tipoClaseId: string | null;
  vigenciaDesde: string;      // YYYY-MM-DD
  vigenciaHasta: string | null;
  estado: 'ACTIVA' | 'PAUSADA' | 'BAJA';
}

export interface RecuperacionMin { id?: string; caducaEl: string; estado: 'DISPONIBLE' | 'USADA' | 'CADUCADA' | 'ANULADA' }

export interface PlazaFijaVista {
  diaSemana: number;
  hora: string;               // 'HH:MM'
  salaId: string;
  tipoClaseId: string | null;
  estado: 'ACTIVA' | 'PAUSADA';
  /** YYYY-MM-DD de la próxima ocurrencia (hoy incluido si la hora no ha pasado). */
  proximaFecha: string | null;
  vigenciaHasta: string | null;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dow(iso: string): number { return new Date(`${iso}T12:00:00`).getDay(); }

/** La plaza fija vigente de la socia (la primera ACTIVA; si no, una PAUSADA), o null. */
export function proyectarPlazaFija(plazas: PlazaFijaMin[], hoyISO: string, horaAhora = '00:00'): PlazaFijaVista | null {
  const vigentes = plazas.filter((p) => p.estado !== 'BAJA' && p.vigenciaDesde <= sumarDias(hoyISO, 7) && (!p.vigenciaHasta || p.vigenciaHasta >= hoyISO));
  const p = vigentes.find((x) => x.estado === 'ACTIVA') ?? vigentes[0];
  // El filtro de arriba ya descartó las BAJA, pero el tipo no lo sabe.
  if (!p || p.estado === 'BAJA') return null;
  const hora = p.horaInicio.slice(0, 5);
  let proximaFecha: string | null = null;
  if (p.estado === 'ACTIVA') {
    let delta = (p.diaSemana - dow(hoyISO) + 7) % 7;
    if (delta === 0 && hora < horaAhora) delta = 7;
    const fecha = sumarDias(hoyISO, delta);
    proximaFecha = (fecha >= p.vigenciaDesde && (!p.vigenciaHasta || fecha <= p.vigenciaHasta)) ? fecha : null;
  }
  return { diaSemana: p.diaSemana, hora, salaId: p.salaId, tipoClaseId: p.tipoClaseId, estado: p.estado, proximaFecha, vigenciaHasta: p.vigenciaHasta };
}

export function nombreDia(diaSemana: number): string { return DIAS[diaSemana] ?? ''; }

export interface RecuperacionVista {
  caducaEl: string;
  /**
   * La recompensa con la que la consiguió, si vino de un canje. `null` si es
   * una recuperación normal (una clase que canceló a tiempo, el reparto
   * semanal…): ahí no hay nada que contar que ella no sepa ya.
   */
  deRecompensa: string | null;
}

export interface RecuperacionesVista {
  disponibles: number;
  proximaCaducidad: string | null;
  /** Las vivas, de la que antes caduca a la que menos. */
  detalle: RecuperacionVista[];
}

/**
 * De qué canje salió cada recuperación, para poder decirlo.
 *
 * ⚠️ El origen se toma del VÍNCULO (`reward_redemptions.recuperacion_id`), NUNCA
 * de `recuperaciones.motivo`. `motivo` es texto libre que escribe quien la
 * concede desde el panel: en producción hay uno que pone literalmente «mm».
 * Enseñárselo a la alumna sería enseñarle eso. Por eso el canje guarda la
 * clave — el texto nunca fue suficiente.
 */
export interface CanjeConRecuperacion { catalogItemId: string; recuperacionId?: string | null }

/** Recuperaciones que aún se pueden usar (DISPONIBLE y no caducada a fecha de hoy). */
export function proyectarRecuperaciones(
  recs: RecuperacionMin[],
  hoyISO: string,
  canjes: CanjeConRecuperacion[] = [],
  catalogo: { id: string; nombre: string }[] = [],
): RecuperacionesVista {
  const vivas = recs
    .filter((r) => r.estado === 'DISPONIBLE' && r.caducaEl >= hoyISO)
    .sort((a, b) => a.caducaEl.localeCompare(b.caducaEl));

  const nombre = new Map(catalogo.map((c) => [c.id, c.nombre]));
  const recompensaPorRecuperacion = new Map<string, string>();
  for (const c of canjes) {
    if (!c.recuperacionId) continue;
    const n = nombre.get(c.catalogItemId);
    if (n) recompensaPorRecuperacion.set(c.recuperacionId, n);
  }

  return {
    disponibles: vivas.length,
    proximaCaducidad: vivas[0]?.caducaEl ?? null,
    detalle: vivas.map((r) => ({
      caducaEl: r.caducaEl,
      deRecompensa: (r.id && recompensaPorRecuperacion.get(r.id)) ?? null,
    })),
  };
}
