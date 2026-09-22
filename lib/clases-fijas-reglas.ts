// Clases fijas del estudio: las reglas que no dependen de la base de datos.
//
// Una «clase fija» es una OFERTA con nombre («Reformer · martes y jueves») que el
// estudio arma con clases que ya se repiten en su horario. La alumna la pide y,
// cuando el estudio la aprueba, recibe una plaza fija (`plazas_fijas`) por cada
// franja de la oferta, hasta la fecha que eligió. Aquí vive lo que se decide sin
// tocar datos: las duraciones que se pueden ofrecer, hasta cuándo llega cada una,
// cuántas plazas quedan y en qué estado está la oferta para una alumna.
//
// Sin imports de servidor ni `@/`: lo lee el panel, la app de la alumna y el
// servidor, y los tres tienen que decir lo mismo. Todo el tiempo entra por
// parámetro, en fechas `YYYY-MM-DD` de la zona del estudio.

/** Duraciones que un estudio puede ofrecer, en meses. Cerradas a propósito: tres toques en el móvil y una fecha que se puede explicar. */
export const DURACIONES_MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24] as const;
export const DURACIONES_POR_DEFECTO = [1, 3, 6];
export const MAX_DURACIONES = 6;
export const MAX_NOMBRE = 60;
export const MAX_DESCRIPCION = 500;
export const MAX_FRANJAS = 12;

const PERMITIDAS = new Set<number>(DURACIONES_MESES);

/**
 * Las duraciones que llegan de fuera (el body de una ruta) → una lista válida, sin
 * repetidas y de menor a mayor. `null` si no hay ninguna válida o se pasa del tope:
 * quien llama contesta 400, no «arregla» lo que le mandaron.
 */
export function normalizarDuraciones(entrada: unknown): number[] | null {
  if (!Array.isArray(entrada)) return null;
  const limpias = new Set<number>();
  for (const v of entrada) {
    if (typeof v !== 'number' || !Number.isInteger(v) || !PERMITIDAS.has(v)) return null;
    limpias.add(v);
  }
  if (limpias.size < 1 || limpias.size > MAX_DURACIONES) return null;
  return [...limpias].sort((a, b) => a - b);
}

const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');
const diasDelMes = (año: number, mes: number) => new Date(Date.UTC(año, mes, 0)).getUTCDate();

/**
 * Hasta cuándo llega una clase fija pedida hoy con esa duración: el mismo día,
 * `meses` meses después. Si ese día no existe (31 de enero + 1 mes) se queda en el
 * último del mes (28 o 29 de febrero, y no 3 de marzo).
 */
export function vigenciaHastaDeDuracion(desde: string, meses: number): string {
  const m = ymd.exec(desde);
  if (!m || !Number.isInteger(meses) || meses < 1) throw new Error(`fecha o duración no válidas: ${desde} / ${meses}`);
  const año0 = Number(m[1]);
  const mes0 = Number(m[2]) - 1 + meses;
  const año = año0 + Math.floor(mes0 / 12);
  const mes = (mes0 % 12) + 1;
  const dia = Math.min(Number(m[3]), diasDelMes(año, mes));
  return `${año}-${pad(mes)}-${pad(dia)}`;
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «Martes 10:00» — para decir de qué franja se habla cuando una oferta tiene varias. */
export function textoFranja(diaSemana: number, hora: string): string {
  const dia = NOMBRES_DIA[diaSemana] ?? '';
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${hora.slice(0, 5)}`.trim();
}

/** Los cuatro momentos del día en los que se agrupan las clases fijas, para filtrar. */
export const FRANJAS_HORARIAS = ['Mañana', 'Mediodía', 'Tarde', 'Noche'] as const;
export type FranjaHoraria = (typeof FRANJAS_HORARIAS)[number];

/**
 * A qué momento del día pertenece una hora — para filtrar, no para mostrar (la
 * hora exacta se sigue enseñando siempre). Cortes fijos, iguales para cualquier
 * estudio: mañana hasta mediodía, mediodía hasta media tarde, tarde hasta la
 * caída del sol, noche en adelante — el reparto habitual de un horario de
 * Pilates, no el horario de apertura de CADA estudio (uno que abre a las 7 y
 * otro a las 9 igual quieren "mañana" para las dos primeras horas del día).
 */
export function franjaHorariaDe(hora: string): FranjaHoraria {
  const h = Number(hora.slice(0, 2));
  if (h < 12) return 'Mañana';
  if (h < 15) return 'Mediodía';
  if (h < 18) return 'Tarde';
  return 'Noche';
}

/** «1 mes», «3 meses», «1 año», «18 meses», «2 años». */
export function etiquetaDuracion(meses: number): string {
  if (meses === 1) return '1 mes';
  if (meses % 12 === 0) return meses === 12 ? '1 año' : `${meses / 12} años`;
  return `${meses} meses`;
}

/** Una franja de la oferta ya resuelta contra el horario vivo (la última clase de su serie ese día). */
export interface FranjaResuelta {
  serieId: string;
  diaSemana: number;
  /** 'HH:MM' local. */
  hora: string;
  tipoClaseId: string;
  salaId: string;
  instructorId: string | null;
  /** La próxima clase de esa serie ese día: desde ella se valida y se da la plaza. */
  proximaSesionId: string;
  /** Última clase programada (YYYY-MM-DD). */
  ultimaFecha: string;
  aforo: number;
  /** Plazas fijas activas o en pausa que ya tiene esa franja (de cualquier alumna). */
  ocupadas: number;
}

/** Lo mínimo que se lee de una tarjeta del Horario (`lib/horario-fijo.ts`) para resolver una franja. */
export interface TarjetaMin {
  serieId: string;
  diaSemana: number;
  hora: string;
  tipoClaseId: string;
  salaId: string;
  instructorId: string | null;
  proximaSesionId: string;
  ultimaFecha: string;
  aforo: number;
  plazasFijas: unknown[];
}

/**
 * Las franjas de una oferta contra el horario vivo. Una franja cuya serie ya no
 * tiene clases futuras ese día NO aparece: la oferta lo ve como «sin clases» en
 * vez de inventarse una hora.
 */
export function resolverFranjas(franjas: { serieId: string; diaSemana: number }[], tarjetas: TarjetaMin[]): FranjaResuelta[] {
  return franjas.flatMap((f): FranjaResuelta[] => {
    const t = tarjetas.find(x => x.serieId === f.serieId && x.diaSemana === f.diaSemana);
    return t ? [{
      serieId: t.serieId, diaSemana: t.diaSemana, hora: t.hora, tipoClaseId: t.tipoClaseId, salaId: t.salaId,
      instructorId: t.instructorId, proximaSesionId: t.proximaSesionId, ultimaFecha: t.ultimaFecha,
      aforo: t.aforo, ocupadas: t.plazasFijas.length,
    }] : [];
  });
}

/** Cuántas plazas caben en esa franja: el tope que puso el estudio, y nunca más que el aforo. */
export function cupoDeFranja(franja: Pick<FranjaResuelta, 'aforo'>, tope: number | null): number {
  return Math.max(0, tope == null ? franja.aforo : Math.min(tope, franja.aforo));
}

/**
 * Plazas libres de la oferta: la franja más llena manda (si una está llena, la
 * oferta está llena, aunque las demás tengan sitio). `null` sin franjas resueltas.
 */
export function plazasLibresDeClaseFija(franjas: FranjaResuelta[], tope: number | null): number | null {
  if (franjas.length === 0) return null;
  return Math.min(...franjas.map(f => cupoDeFranja(f, tope) - f.ocupadas));
}

export type EstadoOferta =
  /** Se puede pedir. */
  | 'DISPONIBLE'
  /** Alguna franja ya no tiene clases programadas (la serie se acabó y no se ha renovado). */
  | 'SIN_CLASES'
  /** No quedan plazas. */
  | 'COMPLETA'
  /** El estudio la cerró. */
  | 'CERRADA';

export function estadoOferta(
  o: { activa: boolean; franjasDefinidas: number; franjas: FranjaResuelta[]; tope: number | null },
): EstadoOferta {
  if (!o.activa) return 'CERRADA';
  if (o.franjasDefinidas === 0 || o.franjas.length < o.franjasDefinidas) return 'SIN_CLASES';
  const libres = plazasLibresDeClaseFija(o.franjas, o.tope);
  return libres !== null && libres <= 0 ? 'COMPLETA' : 'DISPONIBLE';
}

/**
 * Hasta cuándo hay clases programadas en TODAS las franjas: la fecha más temprana
 * de las últimas. Pedir la clase fija «hasta» más allá de esa fecha se puede —el
 * estudio renueva sus series—, pero la pantalla tiene que decir hasta cuándo hay
 * clases de verdad.
 */
export function programadaHasta(franjas: FranjaResuelta[]): string | null {
  if (franjas.length === 0) return null;
  return franjas.map(f => f.ultimaFecha).sort()[0];
}

/** Lo que la alumna ya tiene respecto a una oferta. */
export type EstadoAlumnaOferta = 'LIBRE' | 'PEDIDA' | 'LA_TIENE' | 'PARCIAL';

type PlazaMin = { diaSemana: number; horaInicio: string; salaId: string; tipoClaseId: string | null; estado: string; vigenciaHasta: string | null };
type FranjaHueco = Pick<FranjaResuelta, 'diaSemana' | 'hora' | 'salaId' | 'tipoClaseId'>;

/**
 * Las franjas de la oferta que las plazas fijas de la alumna ya cubren. Se casa por
 * hueco (sala, día, hora, y tipo si la plaza lo fija), igual que el motor: una
 * plaza de baja o vencida no cuenta y una en pausa sí.
 */
export function franjasYaCubiertas<F extends FranjaHueco>(franjas: F[], plazas: PlazaMin[], hoy: string): F[] {
  const vivas = plazas.filter(p => (p.estado === 'ACTIVA' || p.estado === 'PAUSADA') && (!p.vigenciaHasta || p.vigenciaHasta >= hoy));
  return franjas.filter(f => vivas.some(p =>
    p.diaSemana === f.diaSemana && p.horaInicio.slice(0, 5) === f.hora && p.salaId === f.salaId
    && (!p.tipoClaseId || p.tipoClaseId === f.tipoClaseId)));
}

/**
 * Las plazas fijas de la alumna cuya fecha «hasta» ya pasó y que siguen ocupando el
 * hueco de una de las franjas que se le van a dar. Nadie las pasa a baja al vencer, y
 * el índice único de franja (`estado <> 'BAJA'`) rechazaría la nueva: pedir otra vez
 * una clase fija que venció es justo el caso normal, así que se apartan antes de escribir.
 */
export function plazasVencidasQueEstorban(
  plazas: (PlazaMin & { id: string })[], franjas: { diaSemana: number; horaInicio: string; salaId: string }[], hoy: string,
): string[] {
  return plazas
    .filter(p => (p.estado === 'ACTIVA' || p.estado === 'PAUSADA') && !!p.vigenciaHasta && p.vigenciaHasta < hoy)
    .filter(p => franjas.some(f => f.diaSemana === p.diaSemana && f.horaInicio.slice(0, 5) === p.horaInicio.slice(0, 5) && f.salaId === p.salaId))
    .map(p => p.id);
}

export const franjasQueYaTiene = (franjas: FranjaHueco[], plazas: PlazaMin[], hoy: string): number =>
  franjasYaCubiertas(franjas, plazas, hoy).length;

/** Cuántos días antes del vencimiento se avisa y se deja ampliar. Un solo número: lo comparten el cron y la app. */
export const DIAS_AVISO_CLASE_FIJA_TERMINA = 14;

/**
 * Hasta cuándo le dura la clase fija a la alumna: la `vigenciaHasta` más próxima entre
 * las plazas que cubren TODAS las franjas de la oferta. `null` si no la tiene entera, o
 * si alguna de las que la cubren no tiene fecha (dada a mano, sin vencimiento) — no hay
 * nada que avisar ni que ampliar.
 */
export function vigenciaMinDeOferta<F extends FranjaHueco>(franjas: F[], plazas: PlazaMin[], hoy: string): string | null {
  const vivas = plazas.filter(p => (p.estado === 'ACTIVA' || p.estado === 'PAUSADA') && (!p.vigenciaHasta || p.vigenciaHasta >= hoy));
  const vencimientos: string[] = [];
  for (const f of franjas) {
    const cubridora = vivas.find(p =>
      p.diaSemana === f.diaSemana && p.horaInicio.slice(0, 5) === f.hora && p.salaId === f.salaId
      && (!p.tipoClaseId || p.tipoClaseId === f.tipoClaseId));
    if (!cubridora || !cubridora.vigenciaHasta) return null;
    vencimientos.push(cubridora.vigenciaHasta);
  }
  return vencimientos.length > 0 ? vencimientos.sort()[0] : null;
}

/**
 * La fecha «hasta» tras ampliar: nunca acorta lo que ya tenía. Mismo cálculo que pedirla
 * por primera vez (`vigenciaHastaDeDuracion` desde hoy) — «3 meses más» es la misma
 * duración del catálogo, medida desde hoy, igual que al pedirla.
 */
export function nuevaVigenciaAmpliar(actual: string | null, hoy: string, meses: number): string {
  const candidata = vigenciaHastaDeDuracion(hoy, meses);
  return actual && actual > candidata ? actual : candidata;
}

export function estadoAlumnaOferta(o: { franjas: number; yaTiene: number; pedida: boolean }): EstadoAlumnaOferta {
  if (o.franjas > 0 && o.yaTiene >= o.franjas) return 'LA_TIENE';
  if (o.pedida) return 'PEDIDA';
  return o.yaTiene > 0 ? 'PARCIAL' : 'LIBRE';
}

// ─── Lo que viaja entre servidor y pantallas ─────────────────────────────────

export interface OfertaAlumna {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: Exclude<EstadoOferta, 'CERRADA'>;
  /** Solo el número: nunca quién las tiene. */
  plazasLibres: number | null;
  duraciones: { meses: number; etiqueta: string; hasta: string }[];
  franjas: { diaSemana: number; hora: string; tipoClaseId: string; salaId: string; tipo: string; sala: string; instructora: string | null; logoUrl: string | null }[];
  /** Hasta cuándo hay clases programadas en todas las franjas. */
  programadaHasta: string | null;
}

/**
 * Una clase que ya se repite en el horario y que NO está envuelta en ninguna
 * oferta con nombre — «Lunes 18:00 · Reformer», sin más. Mismo mecanismo que
 * pedir una clase fija desde la ficha de una clase suelta (`plazas_fijas`,
 * `solicitudes_plaza_fija` tipo `CREAR`), solo que aquí se ven TODAS juntas en
 * vez de tener que entrar clase a clase para encontrarlas.
 */
export interface FranjaSuelta {
  serieId: string;
  diaSemana: number;
  /** 'HH:MM' local. */
  hora: string;
  tipoClaseId: string;
  salaId: string;
  instructorId: string | null;
  tipo: string;
  sala: string;
  instructora: string | null;
  logoUrl: string | null;
  /** La próxima clase de esa serie ese día: por ahí se pide y se da la plaza. */
  proximaSesionId: string;
  /** Última clase programada (YYYY-MM-DD). */
  ultimaFecha: string;
}

export interface CatalogoClasesFijas {
  ofertas: OfertaAlumna[];
  /** Solo si el estudio deja pedir plaza fija desde la app (`plaza_fija_solicitar_desde_app`):
   *  sin ese ajuste, vacío — es el mismo permiso que ya gobierna pedirla clase a clase. */
  sueltas: FranjaSuelta[];
  /** Sus peticiones pendientes (vacío sin sesión de alumna). Pedirla por primera vez y
   *  ampliar lo que ya tiene son peticiones distintas: la pantalla necesita saber cuál es cuál. */
  pedidas: { claseFijaId: string; solicitudId: string; duracionMeses: number; hasta: string; tipo: 'CREAR_CLASE_FIJA' | 'AMPLIAR_CLASE_FIJA' }[];
}

export interface OfertaStaff {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  /** Sin pasar por la bandeja de Inicio: se resuelve al pedirla, si cabe y su cuota no lo impide. */
  aprobacionAutomatica: boolean;
  duracionesMeses: number[];
  plazas: number | null;
  franjas: { serieId: string; diaSemana: number; resuelta: boolean }[];
  estado: EstadoOferta;
  plazasLibres: number | null;
  programadaHasta: string | null;
  pendientes: number;
}
