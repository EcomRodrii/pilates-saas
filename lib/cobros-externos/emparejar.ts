// ─────────────────────────────────────────────────────────────────────────────
// Motor de emparejamiento: ¿a qué recibo corresponde cada movimiento?
//
// PROPONE, nunca confirma. Devuelve candidatas con su puntuación y sus razones,
// y un nivel (`REFERENCIA`, `UNICA_CLARA`, `DUDOSA`, `NINGUNA`). Quien decide es
// una persona (o, si el estudio lo activa algún día, la confirmación automática,
// que solo acepta los dos primeros niveles). Diseño, sección E de
// docs/cobros-externos-diseno.md.
//
// Reglas que no se tocan:
//  · el importe tiene que ser EXACTO, al céntimo: un importe distinto no es
//    candidata, nunca;
//  · un recibo con un cobro en marcha, de una cita o de una penalización
//    anulada no es candidata;
//  · un recibo ya cobrado por STRIPE con el mismo importe no se ofrece para
//    enlazar: si el movimiento se le parece, es un posible DOBLE COBRO y se avisa;
//  · un recibo solo puede ser la candidata clara de UN movimiento del lote.
//
// Las razones van como códigos con datos sin nombres (`decision` se guarda y no
// puede llevar datos personales); la pantalla las pinta con los datos de hoy.
//
// Puro.
// ─────────────────────────────────────────────────────────────────────────────

import { masDias } from '../utils.ts';
import type { MovimientoNormalizado } from './tipos.ts';
import { coincidenciaNombre, normalizar } from './texto.ts';
import { cobroEntroPorStripe } from '../billing/devolucion-reglas.ts';

export const VERSION_MOTOR = 1;

/** Un recibo tal como lo necesita el motor (lo carga el servidor, una vez por lote). */
export interface ReciboParaEmparejar {
  id: string;
  socioId: string | null;
  importeCentimos: number;
  estado: string;
  fechaVencimiento: string | null;
  fechaCobro: string | null;
  metodoCobro: string | null;
  conciliadoPor: string | null;
  stripePaymentIntentId: string | null;
  /** 'failed' = un adeudo SEPA que no entró: su cargo de Stripe se queda escrito sin dinero detrás. */
  sepaEstado?: string | null;
  cobroMostradorPi: string | null;
  importeDevueltoCentimos: number;
  conReembolso: boolean;
  concepto: string | null;
  /** Ya ligado a otro movimiento (CONFIRMANDO, CONFIRMADO o ENLAZADO). */
  ligadoAMovimiento: boolean;
}

export interface SociaParaEmparejar { id: string; nombre: string; apellidos: string }
export interface AsistenciaParaEmparejar { socioId: string; fecha: string; inicio: string; fin: string; checkIn: boolean }
/** Movimientos ya confirmados: de dónde sale el historial de tarjetas y de pagos. */
export interface HistorialParaEmparejar { socioId: string; fecha: string; importeCentimos: number; metodo: string; tarjetaUltimos4: string | null; tarjetaMarca: string | null }

export interface ContextoEmparejar {
  recibos: readonly ReciboParaEmparejar[];
  socias: ReadonlyMap<string, SociaParaEmparejar>;
  asistencias: readonly AsistenciaParaEmparejar[];
  historial: readonly HistorialParaEmparejar[];
  /** Recibos de penalizaciones anuladas o reembolsadas (la guardia de «Marcar cobrado»). */
  bloqueados: ReadonlySet<string>;
}

export type Accion = 'COBRAR' | 'ENLAZAR';
export type CodigoRazon =
  | 'REFERENCIA' | 'PAGADOR_COMPLETO' | 'PAGADOR_APELLIDO' | 'CONCEPTO_NOMBRE'
  | 'TARJETA_CONOCIDA' | 'TARJETA_SOLO_DIGITOS' | 'VINO_A_CLASE' | 'CLASE_ESE_DIA'
  | 'CONCEPTO_CUOTA' | 'VENCE_CERCA' | 'VENCE_ESE_MES' | 'PAGO_HABITUAL' | 'UNICO_DE_ESE_IMPORTE'
  | 'COBRADO_A_MANO_ESE_DIA';

export interface Razon { codigo: CodigoRazon; puntos: number; dato?: string }

export interface Candidata {
  accion: Accion;
  reciboId: string;
  socioId: string | null;
  puntuacion: number;
  razones: Razon[];
}

/**
 *  · `REFERENCIA`: el movimiento lleva la referencia de Tentare de ese recibo.
 *  · `UNICA_CLARA`: una candidata con 80 o más y al menos 40 por encima de la siguiente.
 *  · `DUDOSA`: hay candidatas, pero ninguna es clara (varias parecidas, o una floja).
 *  · `NINGUNA`: ningún recibo pasa los filtros.
 */
export type Nivel = 'REFERENCIA' | 'UNICA_CLARA' | 'DUDOSA' | 'NINGUNA';

export interface Decision {
  version: number;
  nivel: Nivel;
  candidatas: Candidata[];
  /** Recibos ya cobrados por Stripe a los que este pago se parece: posible doble cobro. */
  dobleCobro: string[];
}

export const UMBRAL_CLARA = 80;
export const MARGEN_CLARA = 40;
/** Por encima de esto, un recibo cobrado por Stripe se señala como posible doble cobro. */
export const UMBRAL_DOBLE_COBRO = 40;

const ESTADOS_PARA_COBRAR = new Set(['PENDIENTE', 'FALLIDO', 'DEVUELTO']);
const METODOS_TRANSFERENCIA = new Set(['TRANSFERENCIA', 'BIZUM']);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Diferencia en días entre dos `YYYY-MM-DD` (b − a). */
function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * ¿Este recibo cobrado NO es un apunte a mano? Pasó por Stripe (webhook, conciliador,
 * datáfono de Stripe, un cargo que sí entró) o lo cobró otro movimiento del banco
 * ('externo'). Entonces NO se enlaza: sería esconder un doble cobro.
 *
 * El cargo de Stripe solo no basta (`cobroEntroPorStripe`): un adeudo SEPA rechazado
 * deja su cargo escrito, y si la alumna paga luego por transferencia y se apunta a
 * mano, ese cobro es un apunte a mano de verdad.
 */
export function cobradoPorStripe(r: ReciboParaEmparejar): boolean {
  if (r.cobroMostradorPi) return true;
  if (r.conciliadoPor !== null && r.conciliadoPor !== 'manual') return true;
  return cobroEntroPorStripe({ stripe_payment_intent_id: r.stripePaymentIntentId, metodo_cobro: r.metodoCobro, sepa_estado: r.sepaEstado ?? null });
}

/**
 * El mismo tipo de método para enlazar: tarjeta con tarjeta; transferencia o Bizum
 * entre sí. `OTRO` (un abono que no dice cómo llegó) es una transferencia, como al
 * confirmar (`metodoCobroDe`).
 */
function mismoTipoDeMetodo(movimiento: string, recibo: string | null): boolean {
  if (!recibo) return false;
  if (movimiento === 'TARJETA') return recibo === 'TARJETA';
  if (METODOS_TRANSFERENCIA.has(movimiento) || movimiento === 'OTRO') return METODOS_TRANSFERENCIA.has(recibo);
  return false;
}

/** ¿Puede este recibo COBRARSE con este movimiento? (filtros, no puntos) */
export function sePuedeCobrar(r: ReciboParaEmparejar, m: MovimientoNormalizado, bloqueados: ReadonlySet<string>): boolean {
  if (r.importeCentimos !== m.importeCentimos) return false;
  if (!ESTADOS_PARA_COBRAR.has(r.estado)) return false;
  if (r.estado === 'DEVUELTO' && r.importeDevueltoCentimos !== 0) return false;
  if (r.conReembolso || r.cobroMostradorPi || r.ligadoAMovimiento) return false;
  if (r.id.startsWith('rec-cita-') || bloqueados.has(r.id)) return false;
  if (!r.fechaVencimiento) return false;
  const d = dias(m.fechaOperacion, r.fechaVencimiento);
  return d >= -45 && d <= 10;
}

/** ¿Puede ENLAZARSE (es el apunte a mano de este mismo pago)? */
export function sePuedeEnlazar(r: ReciboParaEmparejar, m: MovimientoNormalizado): boolean {
  if (r.importeCentimos !== m.importeCentimos || r.estado !== 'COBRADO') return false;
  if (r.ligadoAMovimiento || r.conReembolso || r.importeDevueltoCentimos !== 0) return false;
  if (cobradoPorStripe(r) || !mismoTipoDeMetodo(m.metodo, r.metodoCobro) || !r.fechaCobro) return false;
  return Math.abs(dias(m.fechaOperacion, r.fechaCobro)) <= 3;
}

function puntuar(r: ReciboParaEmparejar, m: MovimientoNormalizado, ctx: ContextoEmparejar, unicoDeEseImporte: boolean): Razon[] {
  const razones: Razon[] = [];
  const socia = r.socioId ? ctx.socias.get(r.socioId) : undefined;

  if (m.referencia && m.referencia === r.id) razones.push({ codigo: 'REFERENCIA', puntos: 100 });

  if (socia) {
    const porPagador = coincidenciaNombre(m.pagadorNombre, socia.nombre, socia.apellidos);
    if (porPagador === 'COMPLETA') razones.push({ codigo: 'PAGADOR_COMPLETO', puntos: 45 });
    else if (porPagador === 'APELLIDO') razones.push({ codigo: 'PAGADOR_APELLIDO', puntos: 25 });
    else {
      // Muchos bancos no separan al pagador: se busca en el concepto entero.
      const porConcepto = coincidenciaNombre(m.concepto, socia.nombre, socia.apellidos);
      if (porConcepto === 'COMPLETA') razones.push({ codigo: 'CONCEPTO_NOMBRE', puntos: 40 });
      else if (porConcepto === 'APELLIDO') razones.push({ codigo: 'PAGADOR_APELLIDO', puntos: 20 });
    }
  }

  if (m.tarjetaUltimos4 && r.socioId) {
    const usadas = ctx.historial.filter(h => h.socioId === r.socioId && h.tarjetaUltimos4 === m.tarjetaUltimos4);
    const conMarca = usadas.find(h => m.tarjetaMarca && h.tarjetaMarca === m.tarjetaMarca);
    if (conMarca) razones.push({ codigo: 'TARJETA_CONOCIDA', puntos: 40, dato: conMarca.fecha });
    else if (usadas.length > 0) razones.push({ codigo: 'TARJETA_SOLO_DIGITOS', puntos: 20, dato: usadas[0].fecha });
  }

  if (r.socioId) {
    const ese = ctx.asistencias.filter(a => a.socioId === r.socioId && a.fecha === m.fechaOperacion);
    const cerca = m.horaOperacion
      ? ese.find(a => a.checkIn && minutos(m.horaOperacion as string) >= minutos(a.inicio) - 60 && minutos(m.horaOperacion as string) <= minutos(a.fin) + 30)
      : undefined;
    if (cerca) razones.push({ codigo: 'VINO_A_CLASE', puntos: 20, dato: cerca.inicio });
    else if (ese.length > 0) razones.push({ codigo: 'CLASE_ESE_DIA', puntos: 8 });
  }

  if (m.concepto && r.fechaVencimiento) {
    const c = normalizar(m.concepto);
    const mes = MESES[Number(r.fechaVencimiento.slice(5, 7)) - 1];
    const palabrasRecibo = normalizar(r.concepto ?? '').split(' ').filter(p => p.length >= 4);
    let puntos = 0;
    if (/\b(cuota|mensualidad|bono|clases?)\b/.test(c) || (mes && c.includes(mes))) puntos += 10;
    if (palabrasRecibo.some(p => c.includes(p))) puntos += 10;
    if (puntos > 0) razones.push({ codigo: 'CONCEPTO_CUOTA', puntos: Math.min(20, puntos) });
  }

  if (r.estado === 'COBRADO') {
    razones.push({ codigo: 'COBRADO_A_MANO_ESE_DIA', puntos: 30, dato: r.fechaCobro ?? undefined });
  } else if (r.fechaVencimiento) {
    const d = Math.abs(dias(m.fechaOperacion, r.fechaVencimiento));
    if (d <= 7) razones.push({ codigo: 'VENCE_CERCA', puntos: 10, dato: r.fechaVencimiento });
    else if (r.fechaVencimiento.slice(0, 7) === m.fechaOperacion.slice(0, 7)) razones.push({ codigo: 'VENCE_ESE_MES', puntos: 5 });
  }

  if (r.socioId) {
    const hace3Meses = masDias(m.fechaOperacion, -92);
    const habitual = ctx.historial.some(h => h.socioId === r.socioId && h.importeCentimos === m.importeCentimos
      && h.metodo === m.metodo && h.fecha >= hace3Meses && h.fecha < m.fechaOperacion);
    if (habitual) razones.push({ codigo: 'PAGO_HABITUAL', puntos: 10 });
  }

  if (unicoDeEseImporte && r.estado !== 'COBRADO') razones.push({ codigo: 'UNICO_DE_ESE_IMPORTE', puntos: 10 });
  return razones;
}

const suma = (razones: Razon[]) => Math.min(100, razones.reduce((s, r) => s + r.puntos, 0));

function ordenar(a: Candidata, b: Candidata): number {
  if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
  // Empate: antes enlazar que cobrar (no se cobra dos veces lo que ya se apuntó),
  // y después por id, para que el orden sea siempre el mismo.
  if (a.accion !== b.accion) return a.accion === 'ENLAZAR' ? -1 : 1;
  return a.reciboId < b.reciboId ? -1 : a.reciboId > b.reciboId ? 1 : 0;
}

function nivelDe(candidatas: Candidata[]): Nivel {
  if (candidatas.length === 0) return 'NINGUNA';
  const [primera, segunda] = candidatas;
  if (primera.razones.some(r => r.codigo === 'REFERENCIA') && !(segunda?.razones.some(r => r.codigo === 'REFERENCIA'))) return 'REFERENCIA';
  if (primera.puntuacion >= UMBRAL_CLARA && (!segunda || primera.puntuacion - segunda.puntuacion >= MARGEN_CLARA)) return 'UNICA_CLARA';
  return 'DUDOSA';
}

/** Las candidatas de UN movimiento. Solo `COBRO` se empareja. */
export function emparejar(m: MovimientoNormalizado, ctx: ContextoEmparejar): Decision {
  if (m.tipo !== 'COBRO') return { version: VERSION_MOTOR, nivel: 'NINGUNA', candidatas: [], dobleCobro: [] };
  const paraCobrar = ctx.recibos.filter(r => sePuedeCobrar(r, m, ctx.bloqueados));
  const unico = paraCobrar.length === 1;
  const candidatas: Candidata[] = [
    ...paraCobrar.map(r => ({ accion: 'COBRAR' as const, r })),
    ...ctx.recibos.filter(r => sePuedeEnlazar(r, m)).map(r => ({ accion: 'ENLAZAR' as const, r })),
  ].map(({ accion, r }) => {
    const razones = puntuar(r, m, ctx, unico);
    return { accion, reciboId: r.id, socioId: r.socioId, puntuacion: suma(razones), razones };
  }).sort(ordenar);

  // Cobrados por Stripe del mismo importe, en fechas cercanas: si se parecen a
  // este pago, la alumna puede haber pagado dos veces.
  const dobleCobro = ctx.recibos
    .filter(r => r.estado === 'COBRADO' && cobradoPorStripe(r) && r.importeCentimos === m.importeCentimos
      && !!r.fechaCobro && Math.abs(dias(m.fechaOperacion, r.fechaCobro)) <= 10)
    .filter(r => suma(puntuar(r, m, ctx, false).filter(x => x.codigo !== 'COBRADO_A_MANO_ESE_DIA')) >= UMBRAL_DOBLE_COBRO)
    .map(r => r.id);

  return { version: VERSION_MOTOR, nivel: nivelDe(candidatas), candidatas, dobleCobro };
}

/**
 * Las decisiones de un LOTE. Igual que movimiento a movimiento, con una regla
 * más: si dos movimientos tienen como candidata clara el MISMO recibo (dos Bizum
 * idénticos, por ejemplo), ninguno de los dos es claro: los dos pasan a `DUDOSA`
 * y decide una persona. Un recibo nunca se propone como seguro para dos pagos.
 */
export function emparejarLote(movimientos: readonly MovimientoNormalizado[], ctx: ContextoEmparejar): Decision[] {
  const decisiones = movimientos.map(m => emparejar(m, ctx));
  const reclamados = new Map<string, number>();
  for (const d of decisiones) {
    if (d.nivel === 'UNICA_CLARA' || d.nivel === 'REFERENCIA') {
      const id = d.candidatas[0].reciboId;
      reclamados.set(id, (reclamados.get(id) ?? 0) + 1);
    }
  }
  return decisiones.map(d => {
    if ((d.nivel === 'UNICA_CLARA' || d.nivel === 'REFERENCIA') && (reclamados.get(d.candidatas[0].reciboId) ?? 0) > 1) {
      return { ...d, nivel: 'DUDOSA' };
    }
    return d;
  });
}
