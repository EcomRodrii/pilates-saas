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
//   3. El XML se genera SOLO con los que ese UPDATE tocó de verdad.
//   4. Si el XML falla, se deshace la marca de esos ids (EN_CURSO → PENDIENTE,
//      también compare-and-set) y se dice.
//
// Puro, sin Supabase, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Columnas de `recibos` que dicen que ya hay un cobro en marcha. Las mismas que
 * impiden borrar el recibo de una penalización (`borrarReciboDePenalizacionSinCobro`).
 */
export const COLUMNAS_COBRO_EN_MARCHA = [
  'proximo_reintento', 'stripe_payment_intent_id', 'checkout_session_id', 'cobro_mostrador_pi',
] as const;

type ColumnaCobroEnMarcha = (typeof COLUMNAS_COBRO_EN_MARCHA)[number];

export type FilaReciboRemesa = { id: string; estado: string | null } & { [K in ColumnaCobroEnMarcha]?: string | null };

/** Lo leído de la base justo antes de marcar. `ok: false` = no se pudo leer. */
export type LecturaRecibosRemesa =
  | { ok: true; filas: ReadonlyMap<string, FilaReciboRemesa> }
  | { ok: false };

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
}

export function recibosSinCobroEnMarcha<R extends { id: string }>(
  recibos: readonly R[], lectura: LecturaRecibosRemesa,
): RemesaSinCobroEnMarcha<R> {
  const out: RemesaSinCobroEnMarcha<R> = { entran: [], fueraCobroEnMarcha: 0, fueraYaNoPendientes: 0, fueraSinComprobar: 0 };
  for (const r of recibos) {
    if (!lectura.ok) { out.fueraSinComprobar++; continue; }
    const fila = lectura.filas.get(r.id);
    if (!fila || fila.estado !== 'PENDIENTE') out.fueraYaNoPendientes++;
    else if (tieneCobroEnMarcha(fila)) out.fueraCobroEnMarcha++;
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

/** Acceso a datos y generación del fichero, inyectados para probar el orden sin Supabase. */
export interface IoRemesa {
  /** CAS PENDIENTE (y sin cobro en marcha) → EN_CURSO. Devuelve los ids tocados de verdad. */
  marcar(ids: string[]): Promise<ResultadoMarca>;
  /** El XML con exactamente estos recibos. Lanza si no puede. */
  generarXml(ids: string[]): string;
  /** CAS EN_CURSO → PENDIENTE. Devuelve los ids tocados de verdad. */
  desmarcar(ids: string[]): Promise<ResultadoMarca>;
}

export type ResultadoRemesa =
  /** El marcado dio error: no se tocó nada y no hay fichero. */
  | { paso: 'SIN_MARCAR' }
  /** Ninguno seguía pendiente al marcar: no hay fichero. */
  | { paso: 'NINGUNO_PENDIENTE'; caidos: number }
  /** Fichero con `ids`, todos marcados EN_CURSO. `caidos`: los que se quedaron fuera al marcar. */
  | { paso: 'LISTA'; xml: string; ids: string[]; caidos: number }
  /** El XML falló tras marcar. `sinDeshacer`: los que siguen EN_CURSO sin fichero. */
  | { paso: 'XML_FALLIDO'; sinDeshacer: string[] };

export async function prepararRemesa(candidatos: readonly string[], io: IoRemesa): Promise<ResultadoRemesa> {
  const marca = await io.marcar([...candidatos]);
  if (!marca.ok) return { paso: 'SIN_MARCAR' };
  const marcados = new Set(marca.idsActualizados);
  const ids = candidatos.filter(id => marcados.has(id));
  const caidos = candidatos.length - ids.length;
  if (ids.length === 0) return { paso: 'NINGUNO_PENDIENTE', caidos };

  let xml: string;
  try {
    xml = io.generarXml(ids);
  } catch {
    const vuelta = await io.desmarcar(ids).catch((): ResultadoMarca => ({ ok: false }));
    const deshechos = new Set(vuelta.ok ? vuelta.idsActualizados : []);
    return { paso: 'XML_FALLIDO', sinDeshacer: ids.filter(id => !deshechos.has(id)) };
  }
  return { paso: 'LISTA', xml, ids, caidos };
}

/** Lo que dice la pantalla cuando el fichero falla después de marcar. */
export function avisoXmlFallido(sinDeshacer: number): string {
  if (sinDeshacer === 0) return 'No se pudo generar el fichero de la remesa. Los recibos siguen pendientes: inténtalo de nuevo.';
  return `No se pudo generar el fichero de la remesa, y ${recibos(sinDeshacer)} ${sinDeshacer === 1 ? 'se ha quedado' : 'se han quedado'} como enviados al banco sin fichero. No los subas ni los cobres por otro lado: avísanos para devolverlos a pendientes.`;
}
