// ─────────────────────────────────────────────────────────────────────────────
// «Repetir octubre en noviembre» (P1.7): qué se propone, qué se marca de serie
// y cuántas clases salen. Puro: lo comparten la ruta, el diálogo y los tests.
//
// Lo que se repite son las SERIES (las clases que se repiten cada semana), con
// el motor de siempre (`renovar_serie` con `p_hasta`/`p_fechas`): conserva la
// plantilla, la instructora titular, las clases fijas de las alumnas, y se
// salta los cierres, la sala ocupada y lo que ya existe. Las clases sueltas no
// se copian, y el diálogo lo dice.
//
// Dos casillas: por CLASE (qué series) y por DÍA (qué fechas). Un festivo de la
// zona del estudio viene desmarcado salvo que se haya dicho «abrimos
// igualmente»; una serie en «no renovar» o que terminó antes de la última
// semana del mes, también, con su motivo: repetir el mes no resucita lo que la
// propietaria dejó terminar.
// ─────────────────────────────────────────────────────────────────────────────

import type { MotivoOmitida } from '../series-renovacion.ts';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** 'YYYY-MM' válido. */
export function esMes(mes: unknown): mes is string {
  return typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

export function mesSiguiente(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export function primerDia(mes: string): string {
  return `${mes}-01`;
}

/** Último día del mes (28, 29, 30 o 31), sin Date local. */
export function ultimoDia(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(dias).padStart(2, '0')}`;
}

export function nombreMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/** «Repetir octubre en noviembre». */
export function tituloRepetir(mes: string): string {
  return `Repetir ${nombreMes(mes)} en ${nombreMes(mesSiguiente(mes))}`;
}

export interface SerieParaRepetir {
  serieId: string;
  periodoVisto: number;
  tipoClaseId: string | null;
  salaId: string | null;
  /** Días de la semana (0 = domingo) y hora, para nombrarla. */
  dias: number[];
  hora: string;
  /** Todas las fechas que la serie tiene en el rango (lo que dijo la simulación). */
  fechas: string[];
  /** Las que no se pueden crear, con su motivo (cierre, ya existe, sala ocupada, pasada). */
  bloqueadas: { fecha: string; motivo: MotivoOmitida }[];
  /** Por qué viene desmarcada de serie; null = viene marcada. */
  desmarcadaPor: 'no_renovar' | 'terminada' | 'hueco_ocupado' | 'canceladas' | null;
  /** Fechas que se crearían sin instructora (la de siempre tiene otra clase a esa hora). */
  sinInstructora: number;
  /** La instructora de la serie ya no está en el equipo: se crearía sin instructora. */
  instructoraInactiva: boolean;
  /** La serie no se puede repetir (tipo archivado…); viene desmarcada y bloqueada. */
  error: string | null;
}

export interface PropuestaRepetir {
  mes: string;
  destino: string;
  /** Día del estudio en el que se hizo la propuesta. */
  hoy: string;
  /** «Cataluña», o null si no sabemos la comunidad (entonces no se marca ningún festivo). */
  zona: string | null;
  /** Los oficiales de la zona y, con `propio`, los que el estudio guardó en el módulo Festivos. */
  festivos: { fecha: string; nombre: string; propio?: boolean }[];
  /** Festivos con «abrimos igualmente»: vienen marcados. */
  abiertos: string[];
  series: SerieParaRepetir[];
  /** Clases sueltas del mes, que no se copian (para decirlo). */
  sueltas: number;
  /** Series que no caben en una tanda (más de MAX_SERIES): se dice, no se recortan en silencio. */
  seriesFuera: number;
  /** Años del rango sin festivos cargados: ahí no se puede marcar ninguno. */
  aniosSinFestivos: number[];
}

export function seriesMarcadasDeSerie(p: PropuestaRepetir): Set<string> {
  return new Set(p.series.filter((s) => !s.desmarcadaPor && !s.error && creables(s).length > 0).map((s) => s.serieId));
}

/** Las fechas de una serie que de verdad se pueden crear. */
export function creables(s: SerieParaRepetir): string[] {
  const no = new Set(s.bloqueadas.map((b) => b.fecha));
  return s.error ? [] : s.fechas.filter((f) => !no.has(f));
}

export interface DiaParaConfirmar {
  fecha: string;
  /** Clases que se pueden crear ese día con las series marcadas. */
  clases: number;
  festivo: string | null;
  abierto: boolean;
}

/** Los días con alguna clase creable de las series MARCADAS, en orden. */
export function diasDeLaPropuesta(p: PropuestaRepetir, seriesMarcadas: ReadonlySet<string>): DiaParaConfirmar[] {
  const porDia = new Map<string, number>();
  for (const s of p.series) {
    if (!seriesMarcadas.has(s.serieId)) continue;
    for (const f of creables(s)) porDia.set(f, (porDia.get(f) ?? 0) + 1);
  }
  const festivo = new Map(p.festivos.map((f) => [f.fecha, f.nombre]));
  const abiertos = new Set(p.abiertos);
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, clases]) => ({ fecha, clases, festivo: festivo.get(fecha) ?? null, abierto: abiertos.has(fecha) }));
}

/** Todos los días marcados salvo los festivos sin «abrimos igualmente». */
export function diasMarcadosDeSerie(p: PropuestaRepetir): Set<string> {
  const todos = diasDeLaPropuesta(p, new Set(p.series.map((s) => s.serieId)));
  return new Set(todos.filter((d) => !d.festivo || d.abierto).map((d) => d.fecha));
}

/** Por serie, las fechas que se van a pedir. Las series sin ninguna, fuera. */
export function planDeCreacion(
  p: PropuestaRepetir, seriesMarcadas: ReadonlySet<string>, diasMarcados: ReadonlySet<string>,
): { serieId: string; periodoVisto: number; fechas: string[] }[] {
  return p.series
    .filter((s) => seriesMarcadas.has(s.serieId))
    .map((s) => ({ serieId: s.serieId, periodoVisto: s.periodoVisto, fechas: creables(s).filter((f) => diasMarcados.has(f)) }))
    .filter((x) => x.fechas.length > 0);
}

/** Lo que dice el botón: la suma exacta de lo que se va a pedir. */
export function recuento(plan: ReturnType<typeof planDeCreacion>): number {
  return plan.reduce((n, s) => n + s.fechas.length, 0);
}

/** «Reformer · martes y jueves 18:30 · Sala 1». */
export function nombreSerieRepetir(
  s: Pick<SerieParaRepetir, 'dias' | 'hora' | 'tipoClaseId' | 'salaId'>,
  nombreTipo: (id: string) => string | undefined,
  nombreSala: (id: string) => string | undefined,
): string {
  const orden = (d: number) => (d === 0 ? 7 : d); // la semana empieza en lunes
  const dias = [...s.dias].sort((a, b) => orden(a) - orden(b)).map((d) => DIAS[d]);
  const listaDias = dias.length <= 1 ? (dias[0] ?? '') : `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
  const tipo = (s.tipoClaseId && nombreTipo(s.tipoClaseId)) || 'Clase';
  const sala = (s.salaId && nombreSala(s.salaId)) || 'Sala';
  return `${tipo} · ${listaDias} ${s.hora.slice(0, 5)} · ${sala}`;
}

/**
 * Las series que se enseñan: las que tienen alguna fecha en el rango o un error.
 * Una serie que ya llega más allá del mes (renovada para un año) no tiene nada
 * que proponer y solo se cuenta («N clases que se repiten ya llegan…»).
 */
export function seriesQueSeEnsenan(p: PropuestaRepetir): { visibles: SerieParaRepetir[]; yaCubiertas: number } {
  const visibles = p.series.filter((s) => s.error || s.fechas.length > 0);
  return { visibles, yaCubiertas: p.series.length - visibles.length };
}

/**
 * ¿La serie sigue hasta el final del mes de origen? Mira las fechas que le
 * faltan DENTRO de ese mes (después de su última clase):
 * - ninguna, o solo festivos y días cerrados → `null`, sigue: un viernes 25 de
 *   diciembre cerrado o desmarcado no es «terminó», es «ese día no hubo clase»;
 * - alguna libre (o ya pasada) → `'terminada'`: ahí podría haber habido clase y
 *   no la hubo;
 * - las demás, ocupadas por OTRA clase a su hora (`ya_existe`, `sala_ocupada`)
 *   → `'hueco_ocupado'`. No se sabe si terminó: puede ser un taller puesto en su
 *   hueco un día o una clase nueva que la sustituye (otro tipo, misma hora y
 *   sala). Viene desmarcada igual —repetir no resucita sola una serie que quizá
 *   se sustituyó—, pero diciendo lo que pasa, no «terminó».
 */
export function porQueNoSigue(
  s: Pick<SerieParaRepetir, 'fechas' | 'bloqueadas'>, finMes: string, festivos: ReadonlySet<string>,
): 'terminada' | 'hueco_ocupado' | null {
  const motivo = new Map(s.bloqueadas.map((b) => [b.fecha, b.motivo]));
  const faltan = s.fechas.filter((f) => f <= finMes && !festivos.has(f) && motivo.get(f) !== 'cierre');
  if (faltan.length === 0) return null;
  const ocupada = (f: string) => motivo.get(f) === 'ya_existe' || motivo.get(f) === 'sala_ocupada';
  return faltan.every(ocupada) ? 'hueco_ocupado' : 'terminada';
}

export function motivoDesmarcada(s: SerieParaRepetir): string | null {
  if (s.error) return s.error;
  if (s.desmarcadaPor === 'no_renovar') return 'Marcada «no renovar»';
  if (s.desmarcadaPor === 'terminada') return 'Su última clase del mes fue antes del final: márcala si sigue';
  if (s.desmarcadaPor === 'hueco_ocupado') return 'Al final del mes otra clase ocupa su hora y su sala: márcala si sigue';
  if (s.desmarcadaPor === 'canceladas') return 'Sus clases de este mes están canceladas';
  if (creables(s).length === 0) return 'Ya está creada o no se puede crear';
  return null;
}

export interface ResultadoRepetir {
  creadas: number;
  ids: string[];
  primeraFecha: string | null;
  /** Series que no se pudieron repetir (error de esa serie); las demás sí. */
  fallidas: number;
  /** Fechas que pedían esas series fallidas. */
  pedidasFallidas: number;
  pedidas: number;
  /** Clases creadas sin instructora: hay que asignarla en el calendario. */
  sinInstructora: number;
}

/** «16 clases creadas en noviembre» y, si hace falta, lo que no salió. */
export function textoTrasRepetir(r: ResultadoRepetir, destino: string): string {
  // Si se marcó a mano una serie que paró antes de fin de mes, también se crean
  // los días que le quedaban en el mes de origen: «en octubre y noviembre».
  const [a, m] = destino.split('-').map(Number);
  const origen = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  const mes = r.primeraFecha !== null && r.primeraFecha < `${destino}-01`
    ? `${nombreMes(origen)} y ${nombreMes(destino)}`
    : nombreMes(destino);
  const sinInstr = (r.sinInstructora ?? 0) > 0
    ? [r.sinInstructora === 1 ? '1 queda sin instructora: asígnala en el calendario' : `${r.sinInstructora} quedan sin instructora: asígnalas en el calendario`]
    : [];
  const base = r.creadas === 1 ? `1 clase creada en ${mes}` : `${r.creadas} clases creadas en ${mes}`;
  if (r.creadas === r.pedidas && r.fallidas === 0) return [base, ...sinInstr].join(' · ');
  const partes = [r.creadas === 0 ? `No se ha creado ninguna clase en ${mes}` : `${r.creadas} de ${r.pedidas} clases creadas en ${mes}`];
  if (r.fallidas > 0) partes.push(r.fallidas === 1 ? 'una clase semanal no se ha podido repetir' : `${r.fallidas} clases semanales no se han podido repetir`);
  // Lo que falta aparte de las series que fallaron: lo omitió el servidor al crear.
  if (r.creadas < r.pedidas - (r.pedidasFallidas ?? 0)) partes.push('otras ya estaban, la sala estaba ocupada o ese día está cerrado');
  return [...partes, ...sinInstr].join(' · ');
}
