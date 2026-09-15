// Plaza fija y recuperaciones (F2, el caso canónico). Sin imports ni `@/`.
//
// El backend las tiene enteras (`plazas_fijas`, `recuperaciones`,
// `crear_recuperacion` al cancelar una ocurrencia) y el payload las trae; la
// app de la alumna las ignoraba. Aquí solo se proyecta: quién tiene plaza, si
// está activa y cuándo es la próxima; y cuántas recuperaciones puede usar y
// cuándo caduca la primera. NADA de aquí decide una reserva: eso lo hace el
// servidor con su propia regla.

export interface PlazaFijaMin {
  /** Hace falta para pedir una pausa de ESTA plaza. */
  id?: string;
  diaSemana: number;          // 0=domingo … 6=sábado
  horaInicio: string;         // 'HH:MM[:SS]'
  salaId: string;
  tipoClaseId: string | null;
  vigenciaDesde: string;      // YYYY-MM-DD
  vigenciaHasta: string | null;
  estado: 'ACTIVA' | 'PAUSADA' | 'BAJA';
  /** Pausa con fechas (YYYY-MM-DD, ambas incluidas): esas semanas no se reserva. */
  pausaDesde?: string | null;
  pausaHasta?: string | null;
}

export interface RecuperacionMin { id?: string; caducaEl: string; estado: 'DISPONIBLE' | 'USADA' | 'CADUCADA' | 'ANULADA' }

/** Una petición suya sin contestar (migr 20260915231920): CREAR con su franja, PAUSAR con su plaza y fechas. */
export interface PeticionPlazaFijaMin {
  id: string;
  tipo: 'CREAR' | 'PAUSAR';
  plazaId: string | null;
  diaSemana: number | null;
  horaInicio: string | null;
  salaId: string | null;
  desde: string | null;
  hasta: string | null;
}

export interface PlazaFijaVista {
  id: string | null;
  diaSemana: number;
  hora: string;               // 'HH:MM'
  salaId: string;
  tipoClaseId: string | null;
  estado: 'ACTIVA' | 'PAUSADA';
  /** YYYY-MM-DD de la próxima clase de esta plaza (hoy incluido si la hora no ha pasado), saltándose la pausa. */
  proximaFecha: string | null;
  /**
   * El horario publicado llega más allá de su próxima semana y en su hueco no
   * hay ninguna clase: la serie se acabó o se movió. Sin esto la app le
   * enseñaba una «próxima» que no existía.
   */
  sinClase: boolean;
  vigenciaHasta: string | null;
  /** Pausa con fechas que aún no ha terminado; `enCurso` = hoy está dentro. */
  pausa: { desde: string; hasta: string; enCurso: boolean } | null;
  /** La pausa que ha pedido y el estudio aún no ha contestado. */
  pausaPedida: { id: string; desde: string; hasta: string } | null;
}

/** Una clase del horario publicado, ya en fecha y hora del estudio. */
export interface SesionSlotMin { fecha: string; hora: string; salaId: string; tipoClaseId: string; cancelada: boolean }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dow(iso: string): number { return new Date(`${iso}T12:00:00`).getDay(); }

/**
 * TODAS las plazas fijas vigentes de la socia, lunes primero. Antes se enseñaba
 * una sola: quien venía lunes y miércoles veía solo una de las dos.
 *
 * La próxima fecha sale del horario publicado cuando llega (`sesiones`): la
 * primera clase de verdad en su hueco. Si el horario no llega tan lejos, se
 * cuenta por calendario, que es lo único que se puede saber.
 */
export function proyectarPlazasFijas(
  plazas: PlazaFijaMin[], hoyISO: string, horaAhora = '00:00', sesiones?: SesionSlotMin[],
  peticiones: PeticionPlazaFijaMin[] = [],
): PlazaFijaVista[] {
  const vigentes = plazas.filter((p) => p.estado !== 'BAJA' && p.vigenciaDesde <= sumarDias(hoyISO, 7) && (!p.vigenciaHasta || p.vigenciaHasta >= hoyISO));
  const horizonte = (sesiones ?? []).reduce<string | null>((max, s) => (max === null || s.fecha > max ? s.fecha : max), null);
  const vistas: PlazaFijaVista[] = [];
  for (const p of vigentes) {
    // El filtro de arriba ya descartó las BAJA, pero el tipo no lo sabe.
    if (p.estado === 'BAJA') continue;
    const hora = p.horaInicio.slice(0, 5);
    const pausaVigente = p.pausaDesde && p.pausaHasta && p.pausaHasta >= hoyISO
      ? { desde: p.pausaDesde, hasta: p.pausaHasta, enCurso: p.pausaDesde <= hoyISO }
      : null;
    const cuenta = (fecha: string) => fecha >= p.vigenciaDesde && (!p.vigenciaHasta || fecha <= p.vigenciaHasta)
      && !(pausaVigente && fecha >= pausaVigente.desde && fecha <= pausaVigente.hasta);
    let proximaFecha: string | null = null;
    let sinClase = false;
    if (p.estado === 'ACTIVA') {
      let delta = (p.diaSemana - dow(hoyISO) + 7) % 7;
      if (delta === 0 && hora < horaAhora) delta = 7;
      let fecha = sumarDias(hoyISO, delta);
      // Las semanas en pausa no se le reservan: su próxima es la primera después.
      while (pausaVigente && fecha >= pausaVigente.desde && fecha <= pausaVigente.hasta) fecha = sumarDias(fecha, 7);
      const porCalendario = (fecha >= p.vigenciaDesde && (!p.vigenciaHasta || fecha <= p.vigenciaHasta)) ? fecha : null;
      proximaFecha = porCalendario;
      if (sesiones) {
        const enSuHueco = sesiones
          .filter((s) => !s.cancelada && s.salaId === p.salaId && s.hora === hora && dow(s.fecha) === p.diaSemana
            && (!p.tipoClaseId || s.tipoClaseId === p.tipoClaseId)
            && (s.fecha > hoyISO || (s.fecha === hoyISO && s.hora >= horaAhora))
            && cuenta(s.fecha))
          .map((s) => s.fecha)
          .sort();
        if (enSuHueco.length > 0) proximaFecha = enSuHueco[0];
        else if (porCalendario && horizonte && porCalendario <= horizonte) { proximaFecha = null; sinClase = true; }
      }
    }
    const pedida = p.id ? peticiones.find((x) => x.tipo === 'PAUSAR' && x.plazaId === p.id && x.desde && x.hasta) : undefined;
    vistas.push({
      id: p.id ?? null,
      diaSemana: p.diaSemana, hora, salaId: p.salaId, tipoClaseId: p.tipoClaseId, estado: p.estado,
      proximaFecha, sinClase, vigenciaHasta: p.vigenciaHasta, pausa: pausaVigente,
      pausaPedida: pedida ? { id: pedida.id, desde: pedida.desde as string, hasta: pedida.hasta as string } : null,
    });
  }
  return vistas.sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7) || a.hora.localeCompare(b.hora));
}

export function nombreDia(diaSemana: number): string { return DIAS[diaSemana] ?? ''; }

export type PlazaFijaEnClase =
  | { estado: 'PUEDE_PEDIR' }
  | { estado: 'PEDIDA'; peticionId: string }
  | { estado: 'TIENE_PLAZA' }
  | { estado: 'NO_SE_REPITE' };

/**
 * Qué ofrecer en la ficha de una clase sobre su plaza fija. Solo se pide en una
 * clase que se repite (otra clase en su misma sala, día y hora), y no si ya la
 * tiene —activa o en pausa— o ya la ha pedido. El servidor lo vuelve a comprobar
 * todo al pedir y al dar la plaza: esto solo decide si enseñar el botón.
 */
export function plazaFijaEnClase(
  clase: { id: string; fecha: string; hora: string; salaId: string },
  sesiones: { id: string; fecha: string; hora: string; salaId: string; cancelada: boolean }[],
  plazas: PlazaFijaMin[],
  peticiones: PeticionPlazaFijaMin[],
): PlazaFijaEnClase {
  const dia = dow(clase.fecha);
  const mismaFranja = (d: number | null, hora: string | null, sala: string | null) =>
    d === dia && (hora ?? '').slice(0, 5) === clase.hora && sala === clase.salaId;
  if (plazas.some((p) => p.estado !== 'BAJA' && mismaFranja(p.diaSemana, p.horaInicio, p.salaId))) return { estado: 'TIENE_PLAZA' };
  const pedida = peticiones.find((p) => p.tipo === 'CREAR' && mismaFranja(p.diaSemana, p.horaInicio, p.salaId));
  if (pedida) return { estado: 'PEDIDA', peticionId: pedida.id };
  const repite = sesiones.some((s) => s.id !== clase.id && s.fecha !== clase.fecha && !s.cancelada
    && s.salaId === clase.salaId && s.hora === clase.hora && dow(s.fecha) === dia);
  return repite ? { estado: 'PUEDE_PEDIR' } : { estado: 'NO_SE_REPITE' };
}

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
