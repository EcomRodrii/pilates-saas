// ─────────────────────────────────────────────────────────────────────────────
// El embudo del alta y sus cohortes por semana — lógica pura (sin red ni
// Supabase), para que `embudo.test.ts` pruebe lo mismo que pinta /interno.
//
// De dónde salen los datos: `embudo_activacion_detalle()` (migración
// 20261021020248_embudo_alta.sql), una fila por estudio con las marcas que ya
// existían (alta, email, estudio, primera clase, primera reserva) y los pasos de
// `embudo_alta`, que se apuntan desde este PR. Con 4-11 altas al mes un A/B no
// termina nunca: se comparan cohortes, la de antes del alta nueva y las semanas
// con ella.
//
// La regla que manda en todo el fichero: un dato que falta es «—», NUNCA 0. Un
// paso que todavía no se medía, o un día 7 al que la cohorte aún no ha llegado,
// no es «nadie lo hizo»: es «no se sabe». Contarlo como cero es exactamente el
// bug que ya tuvo /interno (`noLeidos` en app/api/interno/kpis/route.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { masDias } from '../utils.ts';

// ── Lo que se guarda: la MISMA lista que el CHECK de la migración ───────────
// (lo cruza embudo.test.ts; desde el PR-4, el CHECK es el de
// 20261021134000_alta_primera_clase.sql). Un paso nuevo se añade aquí Y en una
// migración.

export const PASOS_EMBUDO = [
  'panel_abierto', // la propietaria abre el panel: d1, d7 y d30
  'clase_reservable', // una alumna nueva ya puede reservar (el «sí» de puedeReservarAlumnaNueva)
  'enlace_compartido', // copió, mandó o bajó el QR de su enlace de reservas
  'config_completada', // «Tu estudio» de la bienvenida nueva (PR-3), comprobado en la base de datos
  'correo_cuenta_activa', // el correo «Tu cuenta está activa» (PR-2: hoy sin filas)
  'plan_ensenado', // la tarjeta del plan tras la primera reserva (PR-5: hoy sin filas)
  'correo_recibir_reservas', // el correo «Ya puedes recibir reservas», una vez (PR-4, migración 20261021134000)
] as const;
export type PasoEmbudo = (typeof PASOS_EMBUDO)[number];

/** Por dónde compartió su enlace. Nada que escriba una persona. */
export const DETALLES_EMBUDO = ['copiar', 'whatsapp', 'compartir', 'qr'] as const;
export type DetalleEmbudo = (typeof DETALLES_EMBUDO)[number];

/** Con qué alta se creó la cuenta (`altas_estudio.version`). */
export const VERSIONES_ALTA = ['v1', 'v2', 'v2_prueba'] as const;
export type VersionAlta = (typeof VERSIONES_ALTA)[number];

/**
 * La forma de `altas_estudio.llegada` (la etiqueta de `CLAVE_ORIGEN_ALTA`,
 * lib/landing/medicion.ts). No es una lista cerrada: es la ubicación del botón
 * de la landing o la ruta de una página pública, así que se valida la forma. El
 * trigger de auth.users la normaliza igual (minúsculas) y descarta lo demás.
 */
export const FORMATO_LLEGADA = /^[a-z0-9/_.-]{1,80}$/;

export function normalizarLlegada(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const v = x.trim().toLowerCase();
  return FORMATO_LLEGADA.test(v) ? v : null;
}

/**
 * Lo único que el NAVEGADOR puede pedir que se apunte por /api/alta/paso. El
 * resto lo apunta el servidor cuando lo ve: que el navegador pudiera escribir
 * «clase reservable» sería medir lo que dice la pantalla y no lo que pasa.
 *
 *   · `enlace_compartido`, con su canal obligatorio: copiar o mandar el enlace
 *     no deja huella en ningún servidor.
 *   · `config_completada` («Tu estudio», PR-3), sin detalle. Sus escrituras van
 *     del navegador a la base de datos sin pasar por una ruta nuestra
 *     (`updateStudio`, `studio_horario`, `auth.updateUser`), así que no hay
 *     dónde apuntarlo al escribir. Pero la ruta NO se fía de la petición: antes
 *     de apuntarlo mira en la base de datos que lo guardado está ahí
 *     (`tuEstudioGuardado`, lib/alta/tu-estudio.ts).
 */
export type PasoDelNavegador =
  | { paso: 'enlace_compartido'; detalle: DetalleEmbudo }
  | { paso: 'config_completada'; detalle: null };

export function leerPasoDelNavegador(cuerpo: unknown): PasoDelNavegador | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const { paso, detalle } = cuerpo as Record<string, unknown>;
  if (paso === 'config_completada') return detalle == null ? { paso, detalle: null } : null;
  if (paso !== 'enlace_compartido') return null;
  if (typeof detalle !== 'string' || !(DETALLES_EMBUDO as readonly string[]).includes(detalle)) return null;
  return { paso, detalle: detalle as DetalleEmbudo };
}

/**
 * Cuántos días se apunta un estudio desde su alta. El d30 mira hasta el día 36;
 * con margen, 40. Pasado eso un estudio ya no dice nada de cómo arranca uno
 * nuevo, y la tabla no crece con los que llevan años.
 */
export const DIAS_EMBUDO = 40;

/** `creadoEn` ilegible = no: mejor un hueco que apuntar a un estudio veterano como nuevo. */
export function enVentanaDelEmbudo(creadoEn: string | null | undefined, ahora: Date): boolean {
  if (!creadoEn) return false;
  const alta = Date.parse(creadoEn);
  if (Number.isNaN(alta)) return false;
  const dias = (ahora.getTime() - alta) / 86_400_000;
  // Un día hacia atrás de margen, como `debeObservar` (lib/analitica/hitos.ts):
  // relojes que no cuadran al segundo.
  return dias >= -1 && dias <= DIAS_EMBUDO;
}

// ── Lo que se lee ──────────────────────────────────────────────────────────

/** Una fila de `embudo_activacion_detalle()`, ya en camelCase. */
export interface FilaEmbudo {
  /** null = un alta que no llegó a tener estudio (solo cuenta arriba del embudo). */
  studioId: string | null;
  /** El lunes (Madrid) de la semana del alta, 'YYYY-MM-DD'. */
  semana: string;
  /** El día (Madrid) del alta: el del estudio o, sin él, el de la cuenta. */
  diaAlta: string;
  version: VersionAlta;
  llegada: string | null;
  altaIniciadaEn: string | null;
  emailConfirmadoEn: string | null;
  estudioCreadoEn: string | null;
  /** Estado de HOY: `tipos_clase` no guarda cuándo se creó. */
  tieneTipoClase: boolean;
  /** Alguna clase programada, se sepa o no cuándo. */
  tieneClase: boolean;
  /** Cuándo se programó la primera; null en las clases de antes del 13-sep-2026 (sin hora). */
  primeraClaseEn: string | null;
  /** Estado de HOY: `planes_tarifa` no guarda cuándo se activó. */
  tieneTarifaActiva: boolean;
  primeraReservaEn: string | null;
  /** Primer instante de cada paso de `embudo_alta` (sin `panel_abierto`). */
  pasos: Partial<Record<PasoEmbudo, string>>;
  /** Días desde el alta con el panel abierto (0 = el mismo día). */
  diasPanel: number[];
  /** Primer día con datos de cada paso en TODA la tabla: antes, el paso no se medía. */
  medidoDesde: Partial<Record<PasoEmbudo, string>>;
}

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null);
const dia = (x: unknown): string | null => {
  const t = texto(x);
  return t && RE_DIA.test(t.slice(0, 10)) ? t.slice(0, 10) : null;
};

function mapaDePasos(x: unknown, leer: (v: unknown) => string | null): Partial<Record<PasoEmbudo, string>> {
  const fuera: Partial<Record<PasoEmbudo, string>> = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return fuera;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const valor = leer(v);
    if (valor && (PASOS_EMBUDO as readonly string[]).includes(k)) fuera[k as PasoEmbudo] = valor;
  }
  return fuera;
}

/** Una fila de la RPC → `FilaEmbudo`. null si le falta lo que la sitúa en el tiempo. */
export function filaDesdeBd(x: unknown): FilaEmbudo | null {
  if (!x || typeof x !== 'object') return null;
  const f = x as Record<string, unknown>;
  const semana = dia(f.semana);
  const diaAlta = dia(f.dia_alta);
  if (!semana || !diaAlta) return null;
  const version = (VERSIONES_ALTA as readonly string[]).includes(f.version as string) ? (f.version as VersionAlta) : 'v1';
  return {
    studioId: texto(f.studio_id),
    semana,
    diaAlta,
    version,
    llegada: texto(f.llegada),
    altaIniciadaEn: texto(f.alta_iniciada_en),
    emailConfirmadoEn: texto(f.email_confirmado_en),
    estudioCreadoEn: texto(f.estudio_creado_en),
    tieneTipoClase: f.tiene_tipo_clase === true,
    tieneClase: f.tiene_clase === true || texto(f.primera_clase_en) !== null,
    primeraClaseEn: texto(f.primera_clase_en),
    tieneTarifaActiva: f.tiene_tarifa_activa === true,
    primeraReservaEn: texto(f.primera_reserva_en),
    pasos: mapaDePasos(f.pasos, texto),
    diasPanel: Array.isArray(f.dias_panel)
      ? (f.dias_panel as unknown[]).map(Number).filter(n => Number.isInteger(n))
      : [],
    medidoDesde: mapaDePasos(f.medido_desde, dia),
  };
}

// ── Las cuentas ────────────────────────────────────────────────────────────

const HORA_MS = 3_600_000;

/** Horas del alta del estudio a su primera clase programada; null sin una de las dos. */
export function horasHastaPrimeraClase(f: Pick<FilaEmbudo, 'estudioCreadoEn' | 'primeraClaseEn'>): number | null {
  if (!f.estudioCreadoEn || !f.primeraClaseEn) return null;
  const h = (Date.parse(f.primeraClaseEn) - Date.parse(f.estudioCreadoEn)) / HORA_MS;
  return Number.isFinite(h) ? Math.max(0, h) : null;
}

/** La mediana de siempre (la media de las dos del centro si son pares, como `percentile_cont(0.5)`). */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** «Sí» de cuántos. `de` es SOLO lo que se pudo medir. */
export interface Tasa { si: number; de: number }

/** Los días que mira cada «vuelven»: d1 el día 1; d7 algún día del 7 al 13; d30 del 30 al 36. */
export const VENTANAS_VUELTA = {
  d1: { desde: 1, hasta: 1 },
  d7: { desde: 7, hasta: 13 },
  d30: { desde: 30, hasta: 36 },
} as const;
export type Vuelta = keyof typeof VENTANAS_VUELTA;

/**
 * ¿Volvió este estudio en esa ventana? null = no se puede saber: la ventana aún
 * no ha terminado (hoy es parte de ella o anterior), o empezó antes de que se
 * midiera `panel_abierto` (`medidoDesde`), o no se ha medido nunca.
 *
 * ⚠️ Solo se decide con la ventana CERRADA, también para un sí: contar los «sí»
 * tempranos y no los «no» pendientes inflaría la tasa justo en la cohorte más
 * nueva, que es la que se mira.
 */
export function volvio(
  f: Pick<FilaEmbudo, 'diaAlta' | 'diasPanel'>, vuelta: Vuelta, hoy: string, medidoDesde: string | null | undefined,
): boolean | null {
  if (!medidoDesde) return null;
  const { desde, hasta } = VENTANAS_VUELTA[vuelta];
  if (masDias(f.diaAlta, desde) < medidoDesde) return null;
  if (masDias(f.diaAlta, hasta) >= hoy) return null;
  return f.diasPanel.some(d => d >= desde && d <= hasta);
}

function tasaDeVuelta(filas: readonly FilaEmbudo[], vuelta: Vuelta, hoy: string, medidoDesde: string | null | undefined): Tasa | null {
  let si = 0;
  let de = 0;
  for (const f of filas) {
    const v = volvio(f, vuelta, hoy, medidoDesde);
    if (v === null) continue;
    de += 1;
    if (v) si += 1;
  }
  return de > 0 ? { si, de } : null;
}

/** El `medido_desde` de un paso: la RPC lo repite igual en todas las filas. */
function medidoDesdeDe(filas: readonly FilaEmbudo[], paso: PasoEmbudo): string | null {
  for (const f of filas) if (f.medidoDesde[paso]) return f.medidoDesde[paso] ?? null;
  return null;
}

/** Cuántos días se miran en el embudo y las tarjetas. */
export const VENTANA_DIAS = 60;

/**
 * Desde dónde se piden filas a la base: la cohorte «antes» empieza aquí y no se
 * mueve, para que el «antes» con el que se compara cada semana del alta nueva
 * no encoja según pasan los días. Es la ventana de 60 días de la auditoría del
 * 21-oct-2026 (01-estado-actual.md), contra la que tiene que cuadrar.
 */
export const DESDE_COHORTE_ANTES = '2026-08-22';

/**
 * `altas_estudio` existe desde el 1-oct-2026 (migración 20261001195938): las
 * altas de antes no dejaron fila, y la parte de arriba del embudo lo dice.
 */
export const ALTAS_ESTUDIO_DESDE = '2026-10-01';

/** El `p_desde` de la consulta: lo que sea anterior, la ventana o el inicio del «antes». */
export function desdeDeLaConsulta(hoy: string): string {
  const ventana = masDias(hoy, -VENTANA_DIAS);
  return ventana < DESDE_COHORTE_ANTES ? ventana : DESDE_COHORTE_ANTES;
}

// ── Lo que se pinta ────────────────────────────────────────────────────────

export interface FilaCohorte {
  clave: string;
  etiqueta: string;
  /** Lo que acompaña a la etiqueta (las fechas). */
  detalle: string | null;
  /** Estudios creados en la cohorte; null = la fila aún no tiene datos. */
  altas: number | null;
  conClase: number | null;
  en24h: number | null;
  medianaHoras: number | null;
  nMediana: number;
  d1: Tasa | null;
  d7: Tasa | null;
  d30: Tasa | null;
  primeraReserva: number | null;
}

export interface PasoVista {
  id: string;
  etiqueta: string;
  /** 'existe': sale de una tabla que ya existía; 'nuevo': de `embudo_alta`. */
  fuente: 'existe' | 'nuevo';
  /** null = sin dato («—»). */
  n: number | null;
  /** Sobre cuántos se cuenta (solo lo medible). */
  de: number | null;
  /** Para los nuevos: desde qué día se mide. */
  desde: string | null;
  /** Nota corta de cómo se cuenta, si no es obvio. */
  nota?: string;
}

export interface ResumenActivacion {
  hoy: string;
  desde: string;
  ventanaDias: number;
  tarjetas: {
    estudios: number;
    conClase: number;
    medianaHorasPrimeraClase: number | null;
    nMediana: number;
    /** Con clase pero sin saber cuándo se programó (antes del 13-sep-2026): fuera de la mediana. */
    clasesSinHora: number;
    conReserva: number;
    reservaEn7Dias: number;
    vuelvenD7: Tasa | null;
    /** Para decir POR QUÉ el d7 es «—». */
    panelMedidoDesde: string | null;
  };
  /** Las altas de cuenta (arriba) y luego los estudios (abajo); `separador` entre medias. */
  embudo: { altas: PasoVista[]; estudios: PasoVista[]; nEstudios: number };
  cohortes: FilaCohorte[];
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-10-27' → '27 oct'. */
export function diaCorto(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1] ?? ''}`.trim();
}

/** Los meses que abarca una lista de días: 'oct', 'sep-oct'. */
export function rangoDeMeses(dias: readonly string[]): string | null {
  if (dias.length === 0) return null;
  const orden = [...dias].sort();
  const mes = (d: string) => MESES[Number(d.slice(5, 7)) - 1] ?? '';
  const a = mes(orden[0]);
  const b = mes(orden[orden.length - 1]);
  return a === b ? a : `${a}-${b}`;
}

/** 23.87 → '23,9 h'. */
export function horasConComa(h: number): string {
  return `${(Math.round(h * 10) / 10).toFixed(1).replace('.', ',')} h`;
}

function cohorte(clave: string, etiqueta: string, detalle: string | null, filas: readonly FilaEmbudo[], hoy: string): FilaCohorte {
  const panel = medidoDesdeDe(filas, 'panel_abierto');
  const horas = filas.map(horasHastaPrimeraClase).filter((h): h is number => h !== null);
  return {
    clave,
    etiqueta,
    detalle,
    altas: filas.length,
    conClase: filas.filter(f => f.tieneClase).length,
    en24h: horas.filter(h => h <= 24).length,
    medianaHoras: mediana(horas),
    nMediana: horas.length,
    d1: tasaDeVuelta(filas, 'd1', hoy, panel),
    d7: tasaDeVuelta(filas, 'd7', hoy, panel),
    d30: tasaDeVuelta(filas, 'd30', hoy, panel),
    primeraReserva: filas.filter(f => f.primeraReservaEn).length,
  };
}

const vacia = (clave: string, etiqueta: string): FilaCohorte => ({
  clave, etiqueta, detalle: null, altas: null, conClase: null, en24h: null, medianaHoras: null, nMediana: 0,
  d1: null, d7: null, d30: null, primeraReserva: null,
});

/**
 * Las cohortes de la tabla: primero TODO lo de antes del alta nueva junto (la
 * base con la que se compara), y después cada semana (lunes de Madrid) con el
 * alta nueva. Sin ninguna todavía, las dos filas vacías de la maqueta: se ve
 * dónde va a salir el dato, con «—», no un cero.
 */
export function cohortes(filas: readonly FilaEmbudo[], hoy: string): FilaCohorte[] {
  const estudios = filas.filter(f => f.studioId);
  const antes = estudios.filter(f => f.version === 'v1');
  const fuera: FilaCohorte[] = [
    antes.length > 0
      ? cohorte('antes', 'Antes del alta nueva', rangoDeMeses(antes.map(f => f.diaAlta)), antes, hoy)
      : vacia('antes', 'Antes del alta nueva'),
  ];

  const porSemana = new Map<string, FilaEmbudo[]>();
  for (const f of estudios) {
    if (f.version === 'v1') continue;
    porSemana.set(f.semana, [...(porSemana.get(f.semana) ?? []), f]);
  }
  const semanas = [...porSemana.keys()].sort();
  if (semanas.length === 0) return [...fuera, vacia('s1', 'Semana 1 con el alta nueva'), vacia('s2', 'Semana 2')];

  const primera = semanas[0];
  for (const s of semanas) {
    const n = Math.round((Date.parse(`${s}T12:00:00Z`) - Date.parse(`${primera}T12:00:00Z`)) / (7 * 86_400_000)) + 1;
    fuera.push(cohorte(s, n === 1 ? 'Semana 1 con el alta nueva' : `Semana ${n}`, `desde el ${diaCorto(s)}`, porSemana.get(s) ?? [], hoy));
  }
  return fuera;
}

/**
 * Un paso de `embudo_alta`, contado SOLO sobre los estudios que nacieron cuando
 * ya se medía: uno de antes pudo hacerlo sin que quedara apuntado.
 */
function pasoNuevo(id: PasoEmbudo, etiqueta: string, estudios: readonly FilaEmbudo[]): PasoVista {
  const desde = medidoDesdeDe(estudios, id);
  if (!desde) return { id, etiqueta, fuente: 'nuevo', n: null, de: null, desde: null };
  const medibles = estudios.filter(f => f.diaAlta >= desde);
  if (medibles.length === 0) return { id, etiqueta, fuente: 'nuevo', n: null, de: null, desde };
  return { id, etiqueta, fuente: 'nuevo', n: medibles.filter(f => f.pasos[id]).length, de: medibles.length, desde };
}

/** Todo lo de la pantalla, de una vez. `hoy` es el día de Madrid (`hoyEnEstudio`). */
export function resumirActivacion(filas: readonly FilaEmbudo[], hoy: string): ResumenActivacion {
  const desde = masDias(hoy, -VENTANA_DIAS);
  const enVentana = filas.filter(f => f.diaAlta >= desde);
  const estudios = enVentana.filter(f => f.studioId);
  const altas = enVentana.filter(f => f.altaIniciadaEn);
  const horas = estudios.map(horasHastaPrimeraClase).filter((h): h is number => h !== null);
  const panel = medidoDesdeDe(filas, 'panel_abierto');
  const n = estudios.length;

  const existe = (id: string, etiqueta: string, si: number, de: number, nota?: string, desdeDato: string | null = null): PasoVista =>
    ({ id, etiqueta, fuente: 'existe', n: si, de, desde: desdeDato, ...(nota ? { nota } : {}) });
  const altasDesde = desde < ALTAS_ESTUDIO_DESDE ? ALTAS_ESTUDIO_DESDE : null;

  return {
    hoy,
    desde,
    ventanaDias: VENTANA_DIAS,
    tarjetas: {
      estudios: n,
      conClase: estudios.filter(f => f.tieneClase).length,
      medianaHorasPrimeraClase: mediana(horas),
      nMediana: horas.length,
      clasesSinHora: estudios.filter(f => f.tieneClase && horasHastaPrimeraClase(f) === null).length,
      conReserva: estudios.filter(f => f.primeraReservaEn).length,
      reservaEn7Dias: estudios.filter(f => {
        if (!f.primeraReservaEn || !f.estudioCreadoEn) return false;
        return Date.parse(f.primeraReservaEn) - Date.parse(f.estudioCreadoEn) <= 7 * 24 * HORA_MS;
      }).length,
      vuelvenD7: tasaDeVuelta(estudios, 'd7', hoy, panel),
      panelMedidoDesde: panel,
    },
    embudo: {
      // Las altas que pasaron por /crear-estudio (`altas_estudio` existe desde el 1-oct).
      altas: [
        existe('alta_iniciada', 'Altas iniciadas', altas.length, altas.length, undefined, altasDesde),
        existe('email_confirmado', 'Email confirmado', altas.filter(f => f.emailConfirmadoEn).length, altas.length, undefined, altasDesde),
        existe('con_estudio', 'Con estudio', altas.filter(f => f.studioId).length, altas.length, undefined, altasDesde),
      ],
      estudios: [
        pasoNuevo('config_completada', 'Tu estudio completado', estudios),
        existe('tipo_clase', 'Con tipo de clase', estudios.filter(f => f.tieneTipoClase).length, n, 'hoy'),
        existe('clase_programada', 'Clase programada', estudios.filter(f => f.tieneClase).length, n),
        existe('tarifa_activa', 'Tarifa activa', estudios.filter(f => f.tieneTarifaActiva).length, n, 'hoy'),
        pasoNuevo('clase_reservable', 'Clase reservable', estudios),
        pasoNuevo('enlace_compartido', 'Enlace compartido', estudios),
        existe('primera_reserva', 'Primera reserva', estudios.filter(f => f.primeraReservaEn).length, n),
      ],
      nEstudios: n,
    },
    cohortes: cohortes(filas, hoy),
  };
}
