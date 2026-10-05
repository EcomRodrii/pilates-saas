// ─────────────────────────────────────────────────────────────────────────────
// Remesa de domiciliaciones (Cobros → «Preparar recibos para el banco»): que lo
// que va en el fichero no se cobre también por otro lado.
//
// El fichero se construía con los recibos que la pantalla tenía en memoria y
// DESPUÉS se marcaban EN_CURSO. El marcado ya era un compare-and-set sobre
// PENDIENTE, pero se daba por bueno aunque tocara menos filas: un recibo cobrado
// con tarjeta entre cargar la pantalla y pulsar seguía en el XML, y el banco lo
// cargaba otra vez.
//
// Ahora, en este orden:
//   1. Fuera los recibos con un cobro en marcha, leídos de la base en ese momento
//      (el panel no carga esas columnas): reintento programado del dunning,
//      PaymentIntent, sesión de Checkout o cobro de mostrador enlazados.
//   2. Se marcan EN_CURSO con compare-and-set sobre PENDIENTE y sin cobro en
//      marcha (las mismas columnas, en el propio UPDATE).
//   3. El XML se genera SOLO con los que ese UPDATE tocó de verdad, y con el día
//      de cargo que fijó la base de datos al marcarlos (`cargo_pedido_para`, lo
//      pone el trigger `recibos_marcas_de_tiempo` y vuelve en el propio UPDATE):
//      así el fichero y la pantalla dicen el mismo día, y no el del reloj del
//      dispositivo.
//   4. Si el XML falla, o el día de cargo no llega (o llegan dos), se deshace la
//      marca de esos ids (EN_CURSO → PENDIENTE, también compare-and-set) y se dice.
//
// Antes de todo eso, una vista previa (`vistaPreviaRemesa`): qué entra, qué no y
// por qué, con las mismas lecturas.
//
// Puro, sin Supabase, para probarlo con node --test.

import { cobroManualDeRecibo, type LecturaPenalizacionesDeRecibos } from './penalizacion-aprobar-reglas.ts';
import { renovacionDeCuotaEnEspera, tipoPlanEmbebido, type MotivoRenovacionEnEspera } from './renovacion-adoptable.ts';

/**
 * Días entre preparar la remesa y el cargo que se pide al banco (margen SEPA
 * CORE). La fecha que va en el fichero la fija la base de datos (`+ 5` en el
 * trigger `recibos_marcas_de_tiempo`); esto solo sirve para ANUNCIARLA en la
 * vista previa, y un test lo ata a la migración.
 */
export const DIAS_HASTA_CARGO_REMESA = 5;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Columnas de `recibos` que dicen que ya hay un cobro en marcha. Las mismas que
 * impiden borrar el recibo de una penalización (`borrarReciboDePenalizacionSinCobro`).
 * `cobro_off_session_clave`: se está cobrando AHORA con la tarjeta o domiciliación
 * guardada (lib/billing/cobro-off-session-marca.ts).
 */
export const COLUMNAS_COBRO_EN_MARCHA = [
  'proximo_reintento', 'stripe_payment_intent_id', 'checkout_session_id', 'cobro_mostrador_pi', 'cobro_off_session_clave',
] as const;

type ColumnaCobroEnMarcha = (typeof COLUMNAS_COBRO_EN_MARCHA)[number];

type CuotaEmbebida = { estado?: string | null; fecha_fin?: string | null; planes_tarifa?: unknown };

export type FilaReciboRemesa = { id: string; estado: string | null } & { [K in ColumnaCobroEnMarcha]?: string | null } & {
  // Para no meter en la remesa la renovación de una cuota que no toca cobrar
  // (`renovacionEnEsperaDeFila`). Sin ellas, como antes.
  es_renovacion?: boolean | null;
  tras_cancelar_cuota?: string | null;
  suscripciones?: CuotaEmbebida | CuotaEmbebida[] | null;
};

/** Lo que lee `dbLeerRecibosParaRemesa`: las columnas de «cobro en marcha» y la cuota del recibo. */
export const SELECT_RECIBOS_REMESA =
  `id, estado, ${COLUMNAS_COBRO_EN_MARCHA.join(', ')}, es_renovacion, tras_cancelar_cuota, suscripciones(estado, fecha_fin, planes_tarifa(tipo))`;

/**
 * Lo leído de la base justo antes de marcar. `ok: false` = no se pudo leer. `hoy`
 * (`yyyy-mm-dd`): el día de la lectura, para saber si una cuota ya venció.
 */
export type LecturaRecibosRemesa =
  | { ok: true; filas: ReadonlyMap<string, FilaReciboRemesa>; hoy?: string }
  | { ok: false };

/**
 * ¿Es la renovación de una cuota que la remesa no puede cobrar todavía? La misma regla
 * que el cobro automático (lib/billing/renovacion-adoptable.ts): ni antes de vencer, ni
 * en pausa, ni cancelada sin «sigue reintentando». Revisión del 5-oct (#11): una
 * renovación pedida desde la app y abandonada se domiciliaba semanas antes de vencer,
 * o sobre una cuota ya cancelada (y al confirmarla, la reactivaba).
 */
export function renovacionEnEsperaDeFila(fila: FilaReciboRemesa, hoy: string): MotivoRenovacionEnEspera | null {
  const cuota = Array.isArray(fila.suscripciones) ? fila.suscripciones[0] : fila.suscripciones;
  if (!cuota) return null;
  return renovacionDeCuotaEnEspera({
    esRenovacion: fila.es_renovacion ?? null,
    tipoPlan: tipoPlanEmbebido(cuota.planes_tarifa),
    fechaFin: cuota.fecha_fin ?? null,
    estadoCuota: cuota.estado ?? null,
    trasCancelarCuota: fila.tras_cancelar_cuota ?? null,
  }, hoy);
}

export function tieneCobroEnMarcha(fila: FilaReciboRemesa): boolean {
  return COLUMNAS_COBRO_EN_MARCHA.some(col => !!fila[col]);
}

export interface RemesaSinCobroEnMarcha<R> {
  entran: R[];
  /** Con un reintento, un PaymentIntent, un Checkout o un cobro de mostrador en marcha. */
  fueraCobroEnMarcha: number;
  /** Ya no están, o ya no están PENDIENTE (cobrados, anulados…). */
  fueraYaNoPendientes: number;
  /** No se pudo leer: fuera, por si acaso (un adeudo en el banco no se deshace con un clic). */
  fueraSinComprobar: number;
  /** La renovación de una cuota que todavía no toca cobrar (`renovacionEnEsperaDeFila`). */
  fueraRenovacionEnEspera?: number;
}

export function recibosSinCobroEnMarcha<R extends { id: string }>(
  recibos: readonly R[], lectura: LecturaRecibosRemesa,
): RemesaSinCobroEnMarcha<R> {
  const out: RemesaSinCobroEnMarcha<R> = { entran: [], fueraCobroEnMarcha: 0, fueraYaNoPendientes: 0, fueraSinComprobar: 0, fueraRenovacionEnEspera: 0 };
  for (const r of recibos) {
    if (!lectura.ok) { out.fueraSinComprobar++; continue; }
    const fila = lectura.filas.get(r.id);
    if (!fila || fila.estado !== 'PENDIENTE') out.fueraYaNoPendientes++;
    else if (tieneCobroEnMarcha(fila)) out.fueraCobroEnMarcha++;
    else if (lectura.hoy && renovacionEnEsperaDeFila(fila, lectura.hoy)) out.fueraRenovacionEnEspera = (out.fueraRenovacionEnEspera ?? 0) + 1;
    else out.entran.push(r);
  }
  return out;
}

const recibos = (n: number) => (n === 1 ? '1 recibo' : `${n} recibos`);

/** Lo que dice la pantalla de los recibos que el paso 1 dejó fuera. `null` si ninguno. */
export function avisoCobrosEnMarchaFueraDeRemesa(f: Omit<RemesaSinCobroEnMarcha<unknown>, 'entran'>): string | null {
  const partes: string[] = [];
  if (f.fueraCobroEnMarcha > 0) {
    partes.push(`${recibos(f.fueraCobroEnMarcha)} no ${f.fueraCobroEnMarcha === 1 ? 'entra' : 'entran'}: ya ${f.fueraCobroEnMarcha === 1 ? 'tiene' : 'tienen'} un cobro en marcha (reintento programado, tarjeta, Bizum o datáfono).`);
  }
  if (f.fueraYaNoPendientes > 0) partes.push(avisoYaNoPendientes(f.fueraYaNoPendientes));
  const enEspera = f.fueraRenovacionEnEspera ?? 0;
  if (enEspera > 0) {
    partes.push(`${recibos(enEspera)} no ${enEspera === 1 ? 'entra' : 'entran'}: ${enEspera === 1 ? 'es la renovación' : 'son renovaciones'} de una cuota que todavía no toca cobrar (sin vencer, en pausa o cancelada).`);
  }
  if (f.fueraSinComprobar > 0) {
    partes.push(`${recibos(f.fueraSinComprobar)} no ${f.fueraSinComprobar === 1 ? 'entra' : 'entran'}: no hemos podido comprobar si ya se ${f.fueraSinComprobar === 1 ? 'está' : 'están'} cobrando. Vuelve a prepararlo en un momento.`);
  }
  return partes.length > 0 ? partes.join(' ') : null;
}

/** Recibos que ya no estaban pendientes al marcarlos (o al leerlos). */
export function avisoYaNoPendientes(n: number): string {
  return n === 1
    ? '1 ya no estaba pendiente y no va en la remesa.'
    : `${n} ya no estaban pendientes y no van en la remesa.`;
}

// ── Marcar → generar → (deshacer) ────────────────────────────────────────────

export type ResultadoMarca = { ok: true; idsActualizados: string[] } | { ok: false };

/** El marcado devuelve, por id, el día de cargo que fijó la base de datos. */
export type ResultadoMarcaRemesa =
  | { ok: true; idsActualizados: string[]; cargoPedidoPara: ReadonlyMap<string, string | null> }
  | { ok: false };

/** Acceso a datos y generación del fichero, inyectados para probar el orden sin Supabase. */
export interface IoRemesa {
  /** CAS PENDIENTE (y sin cobro en marcha) → EN_CURSO. Devuelve los ids tocados de verdad y su día de cargo. */
  marcar(ids: string[]): Promise<ResultadoMarcaRemesa>;
  /** El XML con exactamente estos recibos y ese día de cargo. Lanza si no puede. */
  generarXml(ids: string[], fechaCargo: string): string;
  /** CAS EN_CURSO → PENDIENTE. Devuelve los ids tocados de verdad. */
  desmarcar(ids: string[]): Promise<ResultadoMarca>;
}

export type ResultadoRemesa =
  /** El marcado dio error: no se tocó nada y no hay fichero. */
  | { paso: 'SIN_MARCAR' }
  /** Ninguno seguía pendiente al marcar: no hay fichero. */
  | { paso: 'NINGUNO_PENDIENTE'; caidos: number }
  /** Fichero con `ids`, todos marcados EN_CURSO, y el día de cargo que lleva. `caidos`: los que se quedaron fuera al marcar. */
  | { paso: 'LISTA'; xml: string; ids: string[]; caidos: number; fechaCargo: string }
  /** El XML falló tras marcar. `sinDeshacer`: los que siguen EN_CURSO sin fichero. */
  | { paso: 'XML_FALLIDO'; sinDeshacer: string[] }
  /** El día de cargo no llegó (o llegaron dos): se deshizo la marca. `sinDeshacer`, como arriba. */
  | { paso: 'SIN_FECHA_DE_CARGO'; sinDeshacer: string[] };

export async function prepararRemesa(candidatos: readonly string[], io: IoRemesa): Promise<ResultadoRemesa> {
  const marca = await io.marcar([...candidatos]);
  if (!marca.ok) return { paso: 'SIN_MARCAR' };
  const marcados = new Set(marca.idsActualizados);
  const ids = candidatos.filter(id => marcados.has(id));
  const caidos = candidatos.length - ids.length;
  if (ids.length === 0) return { paso: 'NINGUNO_PENDIENTE', caidos };

  const deshacer = async () => {
    const vuelta = await io.desmarcar(ids).catch((): ResultadoMarca => ({ ok: false }));
    const deshechos = new Set(vuelta.ok ? vuelta.idsActualizados : []);
    return ids.filter(id => !deshechos.has(id));
  };
  // Un solo día de cargo para todo el fichero, el que fijó la base de datos.
  const fechas = new Set(ids.map(id => marca.cargoPedidoPara.get(id) ?? null));
  const [fechaCargo] = [...fechas];
  if (fechas.size !== 1 || !fechaCargo) return { paso: 'SIN_FECHA_DE_CARGO', sinDeshacer: await deshacer() };

  let xml: string;
  try {
    xml = io.generarXml(ids, fechaCargo);
  } catch {
    return { paso: 'XML_FALLIDO', sinDeshacer: await deshacer() };
  }
  return { paso: 'LISTA', xml, ids, caidos, fechaCargo };
}

/** Lo que dice la pantalla cuando el fichero falla después de marcar (o no llega el día de cargo). */
export function avisoXmlFallido(sinDeshacer: number): string {
  if (sinDeshacer === 0) return 'No se pudo generar el fichero de la remesa. Los recibos siguen pendientes: inténtalo de nuevo.';
  return `No se pudo generar el fichero de la remesa, y ${recibos(sinDeshacer)} ${sinDeshacer === 1 ? 'se ha quedado' : 'se han quedado'} como enviados al banco sin fichero. Usa «No llegó a ir al banco» en ${sinDeshacer === 1 ? 'él' : 'ellos'} para devolverlos a pendientes, y no los subas ni los cobres por otro lado.`;
}

// ── Vista previa ─────────────────────────────────────────────────────────────

export type MotivoFueraDeRemesa =
  /** Un recibo de penalización sin el cobro decidido. */
  | 'PENALIZACION_SIN_APROBAR'
  /** Con un cobro ya en marcha: cuál, en `detalle`. */
  | 'COBRO_EN_MARCHA'
  /** Ya no está pendiente (cobrado, anulado entre medias). */
  | 'YA_NO_PENDIENTE'
  /** No se pudo comprobar: fuera, por si acaso. */
  | 'SIN_COMPROBAR'
  /** La renovación de una cuota que aún no toca cobrar: cuál, en `detalle`. */
  | 'RENOVACION_EN_ESPERA';

const DETALLE_COBRO_EN_MARCHA: Record<ColumnaCobroEnMarcha, string> = {
  proximo_reintento: 'se cobra solo con su tarjeta o domiciliación',
  stripe_payment_intent_id: 'tiene un cargo de Stripe en marcha',
  checkout_session_id: 'tiene abierto un pago online',
  cobro_mostrador_pi: 'se está cobrando en el mostrador',
  cobro_off_session_clave: 'se está cobrando ahora con su tarjeta o domiciliación guardada',
};

const DETALLE_RENOVACION_EN_ESPERA: Record<MotivoRenovacionEnEspera, string> = {
  CUOTA_SIN_VENCER: 'es la renovación de una cuota que aún no ha vencido',
  CUOTA_PAUSADA: 'es la renovación de una cuota en pausa',
  CUOTA_CANCELADA: 'es la renovación de una cuota cancelada',
};

export const TEXTO_MOTIVO_FUERA: Record<Exclude<MotivoFueraDeRemesa, 'COBRO_EN_MARCHA' | 'RENOVACION_EN_ESPERA'>, string> = {
  PENALIZACION_SIN_APROBAR: 'es una penalización sin el cobro aprobado',
  YA_NO_PENDIENTE: 'ya no está pendiente',
  SIN_COMPROBAR: 'no hemos podido comprobar si ya se está cobrando',
};

export interface VistaPreviaRemesa<R> {
  /** Los que entrarían, en el orden de la lista. */
  entran: R[];
  total: number;
  /** Los que no entran por una razón concreta, cada uno con la suya. */
  fuera: { recibo: R; motivo: MotivoFueraDeRemesa; detalle: string }[];
  /** Sin domiciliación (sin mandato vigente, o venta sin clienta): en una sola línea, que pueden ser muchos. */
  sinDomiciliar: { recibos: number; clientas: number; importe: number };
}

/**
 * Qué entraría en la remesa, sin marcar nada: los PENDIENTE con mandato vigente,
 * sin un cobro en marcha (leído de la base ahora) y, si son de una penalización,
 * con el cobro aprobado. Al generar se vuelve a leer y a decidir todo: esto solo
 * se enseña.
 */
export function vistaPreviaRemesa<R extends { id: string; socioId: string | null; importe: number }>(p: {
  pendientes: readonly R[];
  conMandatoVigente: (socioId: string) => boolean;
  penalizaciones: LecturaPenalizacionesDeRecibos;
  cobrosEnMarcha: LecturaRecibosRemesa;
}): VistaPreviaRemesa<R> {
  const out: VistaPreviaRemesa<R> = { entran: [], total: 0, fuera: [], sinDomiciliar: { recibos: 0, clientas: 0, importe: 0 } };
  const sinDomiciliar = new Set<string>();
  for (const r of p.pendientes) {
    if (!r.socioId || !p.conMandatoVigente(r.socioId)) {
      out.sinDomiciliar.recibos++;
      out.sinDomiciliar.importe = Math.round((out.sinDomiciliar.importe + r.importe) * 100) / 100;
      if (r.socioId) sinDomiciliar.add(r.socioId);
      continue;
    }
    if (!cobroManualDeRecibo(r.id).ok) {
      if (!p.penalizaciones.ok) { out.fuera.push({ recibo: r, motivo: 'SIN_COMPROBAR', detalle: TEXTO_MOTIVO_FUERA.SIN_COMPROBAR }); continue; }
      const veredicto = cobroManualDeRecibo(r.id, { ok: true, estado: p.penalizaciones.estadoPorRecibo.get(r.id) ?? null }, 'panel');
      if (!veredicto.ok) { out.fuera.push({ recibo: r, motivo: 'PENALIZACION_SIN_APROBAR', detalle: TEXTO_MOTIVO_FUERA.PENALIZACION_SIN_APROBAR }); continue; }
    }
    if (!p.cobrosEnMarcha.ok) { out.fuera.push({ recibo: r, motivo: 'SIN_COMPROBAR', detalle: TEXTO_MOTIVO_FUERA.SIN_COMPROBAR }); continue; }
    const fila = p.cobrosEnMarcha.filas.get(r.id);
    if (!fila || fila.estado !== 'PENDIENTE') { out.fuera.push({ recibo: r, motivo: 'YA_NO_PENDIENTE', detalle: TEXTO_MOTIVO_FUERA.YA_NO_PENDIENTE }); continue; }
    const columna = COLUMNAS_COBRO_EN_MARCHA.find(col => !!fila[col]);
    if (columna) { out.fuera.push({ recibo: r, motivo: 'COBRO_EN_MARCHA', detalle: DETALLE_COBRO_EN_MARCHA[columna] }); continue; }
    const espera = p.cobrosEnMarcha.hoy ? renovacionEnEsperaDeFila(fila, p.cobrosEnMarcha.hoy) : null;
    if (espera) { out.fuera.push({ recibo: r, motivo: 'RENOVACION_EN_ESPERA', detalle: DETALLE_RENOVACION_EN_ESPERA[espera] }); continue; }
    out.entran.push(r);
    out.total = Math.round((out.total + r.importe) * 100) / 100;
  }
  out.sinDomiciliar.clientas = sinDomiciliar.size;
  return out;
}
