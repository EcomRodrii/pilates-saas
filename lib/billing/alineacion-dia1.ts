// ─────────────────────────────────────────────────────────────────────────────
// Alinear al día 1 a las alumnas que YA tiene el estudio, cobrando la parte
// proporcional (`studios.cobro_dia_1_modo = 'PROPORCIONAL'`, modo B).
//
// Con `cobro_dia_1_activo` las cuotas existentes se realinean solas en su
// próxima renovación (`proximoFinAlineadoDia1`). Hay dos formas de hacerlo y el
// estudio ELIGE:
//
//   A · ENTERA (hoy, por defecto). En su renovación paga la cuota entera y queda
//       cubierta hasta el último día del mes SIGUIENTE: unos días gratis (de 1 a
//       30), una vez por alumna. Este fichero no toca nada de este modo.
//   B · PROPORCIONAL. En su renovación paga SOLO los días que van hasta fin de
//       mes (el día de la renovación cuenta como de uso, igual que el alta) y su
//       cuota pasa a acabar ese día; el día 1 el cron de siempre cobra la entera.
//
// El cálculo NO está aquí: es `prorrateoDeAlta` (lib/billing/prorrateo.ts), el
// mismo motor del alta, llamado con el día de la renovación como «hoy». Así el
// redondeo, el suelo de 0,50 € y la regla de días mínimos son los de siempre.
//
// ── Reglas, todas deliberadas ───────────────────────────────────────────────
//  · SOLO cuotas MENSUALES de un mes, de Tentare (sin `stripe_subscription_id`),
//    NO ya alineadas (`!terminaEnFinDeMes`). Bonos, trimestrales y anuales, no.
//  · RENOVACIÓN = el día siguiente a `fecha_fin` (D), no el día en que corre el
//    cron: el importe y el ciclo no dependen de si el cron se retrasó.
//  · D en día 1 (aniversario en día 1) es una cuota ya alineada: camino de siempre.
//  · Con ≤ N días restantes (`cobro_proporcional_dias_minimos`, 3 de serie) o una
//    parte < 0,50 €: NO se cobra una cantidad simbólica ni se crea recibo. El cron
//    extiende la cuota hasta fin de mes (cortesía, la misma que el alta) y el día 1
//    cobra la entera. «Extender» es un UPDATE condicional: repetir no hace nada.
//  · Si el mes de D ya pasó (el cron llevaba semanas parado), no hay «parte» que
//    cobrar: camino de siempre (A).
//  · El recibo parcial lleva el motivo en el id: `rec-aline-<suscripción>-<fin viejo>`.
//    Es UNO por cuota y ciclo, aunque el cron o el webhook reintenten.
//  · LA ENTREGA SE ANCLA AL RECIBO, no al ajuste ni al reloj: al cobrarlo, la cuota
//    acaba el último día del mes de (`fecha_vencimiento` + 1). Apagar B con un recibo
//    pendiente no deja un ciclo incoherente: lo cobrado es lo entregado.
//    Si al cobrarlo ese mes ya pasó (dunning semanas tarde), se entrega como A: la
//    alumna pagó una parte de un mes que ya no existe y la cuota no puede nacer
//    caducada.
//  · NO aplica a «Renovar» desde la app de la alumna antes del vencimiento
//    (`/api/public/renovar-plan`): ahí paga la entera y es modo A. Límite conocido.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { masDias } from '../utils.ts';
import {
  aCentimos, PREFIJO_RECIBO_ALINEACION, planSeProrratea, prorrateoDeAlta, repartoProporcional, terminaEnFinDeMes,
  DIAS_MINIMOS_POR_DEFECTO,
} from './prorrateo.ts';
import type { PlanTarifa } from '../types.ts';

export type ModoAlineacion = 'ENTERA' | 'PROPORCIONAL';

export { PREFIJO_RECIBO_ALINEACION };

/** Lo que lee de la BD: cualquier cosa que no sea exactamente PROPORCIONAL es el modo de siempre. */
export function normalizarModoAlineacion(v: unknown): ModoAlineacion {
  return v === 'PROPORCIONAL' ? 'PROPORCIONAL' : 'ENTERA';
}

/** El modo B solo actúa con «Cobrar todas las cuotas el día 1» encendido. */
export function alineacionProporcionalActiva(s: { cobroDia1Activo?: boolean | null; cobroDia1Modo?: unknown }): boolean {
  return s.cobroDia1Activo === true && normalizarModoAlineacion(s.cobroDia1Modo) === 'PROPORCIONAL';
}

export function idReciboAlineacion(suscripcionId: string, fechaFinVieja: string): string {
  return `${PREFIJO_RECIBO_ALINEACION}${suscripcionId}-${fechaFinVieja.slice(0, 10)}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const eurTxt = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

function finDelMesDe(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(d).padStart(2, '0')}`;
}

export interface PlanAlineacion {
  /** `cobrar` = recibo parcial; `extender` = sin recibo, cortesía hasta fin de mes. */
  tipo: 'cobrar' | 'extender';
  /** Día de la renovación (fecha_fin + 1). */
  fechaRenovacion: string;
  /** € del recibo parcial (0 si `extender`). */
  importe: number;
  importeCompleto: number;
  /** Último día del mes de la renovación: hasta cuándo queda cubierta. */
  fechaFinNueva: string;
  /** Primer día del mes siguiente: cuándo se cobra la entera. */
  primerCobroCompleto: string;
  diasRestantes: number;
  diasDelMes: number;
  /** Lo que valen esos días a precio de cuota (lo que el modo A «regala»). */
  valorProporcional: number;
  reciboId: string;
  /** Concepto del recibo: explica el porqué a la alumna. */
  concepto: string;
  /** Frase llana para la propietaria / la vista previa. */
  frase: string;
}

type PlanCuota = Pick<PlanTarifa, 'tipo' | 'precio'> & Partial<Pick<PlanTarifa, 'periodicidadMeses'>>;

export interface EntradaAlineacion {
  suscripcionId: string;
  /** `fecha_fin` actual (último día cubierto). */
  fechaFin: string | null;
  plan: PlanCuota;
  /** Día de hoy en Madrid. */
  hoyISO: string;
  diasMinimos?: number;
  stripeSubscriptionId?: string | null;
}

/** La alineación proporcional de esta cuota, o `null` si le toca el camino de siempre. */
export function planificarAlineacion(e: EntradaAlineacion): PlanAlineacion | null {
  if (!e.fechaFin || e.stripeSubscriptionId) return null;
  if (!planSeProrratea(e.plan)) return null;
  const fin = e.fechaFin.slice(0, 10);
  if (terminaEnFinDeMes(fin)) return null;
  const renovacion = masDias(fin, 1);
  const fechaFinNueva = finDelMesDe(renovacion);
  if (fechaFinNueva < e.hoyISO) return null;
  const pr = prorrateoDeAlta(e.plan, renovacion, e.diasMinimos ?? DIAS_MINIMOS_POR_DEFECTO, 'panel');
  // D en día 1 sale `completo`: ya alineada, no hay parte que cobrar.
  if (!pr || pr.mesCompleto) return null;
  const primerCobroCompleto = masDias(fechaFinNueva, 1);
  const valorProporcional = repartoProporcional(aCentimos(e.plan.precio), pr.diasRestantes, pr.diasDelMes) / 100;
  const base = {
    fechaRenovacion: renovacion,
    importeCompleto: e.plan.precio,
    fechaFinNueva,
    primerCobroCompleto,
    diasRestantes: pr.diasRestantes,
    diasDelMes: pr.diasDelMes,
    valorProporcional,
    reciboId: idReciboAlineacion(e.suscripcionId, fin),
  };
  const desde = `desde el ${fechaLarga(primerCobroCompleto)}, ${eurTxt(e.plan.precio)}/mes`;
  if (pr.modo === 'siguiente_mes') {
    return {
      ...base, tipo: 'extender', importe: 0,
      concepto: '',
      frase: `Queda${pr.diasRestantes === 1 ? '' : 'n'} ${pr.diasRestantes} ${pr.diasRestantes === 1 ? 'día' : 'días'} de ${pr.mes}: no se cobra nada ahora, esos días son de cortesía y ${desde}.`,
    };
  }
  const concepto = `Parte proporcional de ${pr.mes}: ${pr.diasRestantes} de ${pr.diasDelMes} días (${desde})`;
  return {
    ...base, tipo: 'cobrar', importe: pr.importe,
    concepto,
    frase: `Paga ${eurTxt(pr.importe)} (${pr.diasRestantes} de ${pr.diasDelMes} días de ${pr.mes}) y ${desde}.`,
  };
}

/**
 * Hasta cuándo entrega el cobro de un recibo `rec-aline-…`: el último día del mes
 * de (`fecha_vencimiento` + 1). Si ese mes ya pasó al cobrarse (el dunning acierta
 * a los 2-3 intentos), NO se regala el mes siguiente por una parte proporcional:
 * se entregan los días que pagó, contados desde hoy (lo cobrado frente a la cuota,
 * sobre los días de aquel mes), y el cron cobra la cuota entera al acabar. Sin
 * importe o precio, solo hoy.
 */
export function finDeEntregaAlineacion(
  fechaVencimientoRecibo: string | null,
  hoyISO: string,
  pagado?: { importeCentimos: number | null; cuotaCentimos: number | null },
): string | null {
  if (!fechaVencimientoRecibo) return null;
  const renovacion = masDias(fechaVencimientoRecibo.slice(0, 10), 1);
  const fin = finDelMesDe(renovacion);
  if (fin >= hoyISO) return fin;
  const cuota = pagado?.cuotaCentimos ?? 0;
  const importe = pagado?.importeCentimos ?? 0;
  if (cuota > 0 && importe > 0) {
    const diasMes = Number(fin.slice(8, 10));
    const dias = Math.min(diasMes, Math.max(1, Math.round((Math.min(importe, cuota) / cuota) * diasMes)));
    return masDias(hoyISO, dias - 1);
  }
  return hoyISO;
}

// ── Vista previa (sin cobrar nada) ──────────────────────────────────────────

export interface CuotaParaVistaPrevia {
  suscripcionId: string;
  /** Solo para pintar «María G.»: nunca email, teléfono ni NIF. */
  nombre: string;
  apellidos: string;
  fechaFin: string | null;
  plan: PlanCuota;
  stripeSubscriptionId?: string | null;
}

export interface FilaVistaPrevia {
  suscripcionId: string;
  alumna: string;
  cuota: number;
  fechaRenovacion: string;
  /** Lo que paga en su renovación en B (0 = cortesía). */
  pagaAhora: number;
  cortesia: boolean;
  diasRestantes: number;
  diasDelMes: number;
  /** Lo que el modo A regala a esta alumna (valor de esos días). */
  regalaA: number;
}

export interface VistaPrevia {
  filas: FilaVistaPrevia[];
  alumnas: number;
  /** Σ de lo que se cobra en las renovaciones en B. */
  totalCobraB: number;
  /** Σ de lo que el modo A regala. */
  totalRegalaA: number;
  /** Σ de la cortesía que B concede (los ≤N días que no se cobran). */
  totalCortesiaB: number;
  alumnasEnCortesia: number;
  ejemplo: string;
  hoy: string;
  diasMinimos: number;
  /** Prueba de que quien activa vio ESTA lista: la ruta la recomputa. */
  huella: string;
}

/** «María García» → «María G.». */
export function nombreCorto(nombre: string, apellidos: string): string {
  const n = (nombre ?? '').trim();
  const a = (apellidos ?? '').trim();
  return a ? `${n} ${a[0].toUpperCase()}.` : n;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function huellaVistaPrevia(v: Pick<VistaPrevia, 'alumnas' | 'totalCobraB' | 'totalRegalaA' | 'totalCortesiaB' | 'hoy' | 'diasMinimos'> & { filas: ReadonlyArray<Pick<FilaVistaPrevia, 'suscripcionId' | 'pagaAhora' | 'fechaRenovacion'>> }): string {
  // Lleva cada fila (cuota, importe y fecha): dos listas distintas con los mismos totales NO dan la misma huella.
  const filas = v.filas.map(f => `${f.suscripcionId}:${Math.round(f.pagaAhora * 100)}:${f.fechaRenovacion}`).join(',');
  const base = [v.alumnas, Math.round(v.totalCobraB * 100), Math.round(v.totalRegalaA * 100), Math.round(v.totalCortesiaB * 100), v.hoy, v.diasMinimos, filas].join('|');
  return createHash('sha256').update(base).digest('hex').slice(0, 32);
}

export function vistaPreviaAlineacion(cuotas: readonly CuotaParaVistaPrevia[], hoyISO: string, diasMinimos: number = DIAS_MINIMOS_POR_DEFECTO): VistaPrevia {
  const filas: FilaVistaPrevia[] = [];
  let ejemploPlan: PlanAlineacion | null = null;
  for (const c of cuotas) {
    const p = planificarAlineacion({
      suscripcionId: c.suscripcionId, fechaFin: c.fechaFin, plan: c.plan, hoyISO, diasMinimos,
      stripeSubscriptionId: c.stripeSubscriptionId,
    });
    if (!p) continue;
    if (!ejemploPlan && p.tipo === 'cobrar') ejemploPlan = p;
    filas.push({
      suscripcionId: c.suscripcionId,
      alumna: nombreCorto(c.nombre, c.apellidos),
      cuota: p.importeCompleto,
      fechaRenovacion: p.fechaRenovacion,
      pagaAhora: p.importe,
      cortesia: p.tipo === 'extender',
      diasRestantes: p.diasRestantes,
      diasDelMes: p.diasDelMes,
      regalaA: p.valorProporcional,
    });
  }
  filas.sort((a, b) => a.fechaRenovacion.localeCompare(b.fechaRenovacion) || a.alumna.localeCompare(b.alumna, 'es'));
  const totalCobraB = redondear(filas.reduce((s, f) => s + f.pagaAhora, 0));
  const totalRegalaA = redondear(filas.reduce((s, f) => s + f.regalaA, 0));
  const totalCortesiaB = redondear(filas.filter(f => f.cortesia).reduce((s, f) => s + f.regalaA, 0));
  const ej = ejemploPlan ?? planificarAlineacion({
    suscripcionId: 'ejemplo', fechaFin: `${hoyISO.slice(0, 7)}-14`, plan: { tipo: 'MENSUAL', precio: 50, periodicidadMeses: 1 }, hoyISO: `${hoyISO.slice(0, 7)}-01`, diasMinimos,
  });
  const ejemplo = ej
    ? `Una alumna con cuota de ${eurTxt(ej.importeCompleto)} que renueva el ${fechaLarga(ej.fechaRenovacion)}. `
      + `Opción A: paga ${eurTxt(ej.importeCompleto)} ese día y no vuelve a pagar hasta el ${fechaLarga(masDias(finDelMesDe(ej.primerCobroCompleto), 1))}; `
      + `tú regalas ${eurTxt(ej.valorProporcional)} (${ej.diasRestantes} días). `
      + `Opción B: paga ${eurTxt(ej.valorProporcional)} ese día (${ej.diasRestantes} de ${ej.diasDelMes} días) y ${eurTxt(ej.importeCompleto)} el ${fechaLarga(ej.primerCobroCompleto)}.`
    : '';
  const v = { alumnas: filas.length, totalCobraB, totalRegalaA, totalCortesiaB, hoy: hoyISO, diasMinimos };
  return {
    filas, ...v,
    alumnasEnCortesia: filas.filter(f => f.cortesia).length,
    ejemplo,
    huella: huellaVistaPrevia({ ...v, filas }),
  };
}

// ── Lo que decide el cron de renovaciones, sin tocar la BD ──────────────────

/** Estado en BD del recibo `rec-aline-…` de una cuota y ciclo, si ya existe. */
export interface ReciboAlineacionExistente {
  estado: string;
  /** `recibos.entrega_aplicada`: `true` = la entrega ya se hizo. */
  entregaAplicada: boolean | null;
}

export type DecisionRenovacion =
  /** Camino de siempre (modo A): `rec-renov-…` a precio entero. */
  | { accion: 'normal' }
  /** Ya hay recibo de alineación para este ciclo y no se crea otro (ni parcial ni entero). */
  | { accion: 'saltar' }
  /** Recibo cobrado cuya entrega no consta: se repite la entrega (idempotente), no se cobra nada. */
  | { accion: 'reparar'; reciboId: string }
  | { accion: 'extender'; plan: PlanAlineacion }
  | { accion: 'cobrar'; plan: PlanAlineacion };

/**
 * Qué hace el cron con una cuota ACTIVA vencida. Con el modo B apagado es SIEMPRE
 * `normal` (modo A intacto). Un recibo de alineación que ya existe para el ciclo lo
 * lleva el dunning o la bandeja: nunca se crea un segundo (parcial ni entero), que
 * es como una alumna acabaría debiendo dos cosas por el mismo periodo.
 */
export function decidirRenovacion(e: EntradaAlineacion & {
  modoProporcional: boolean;
  reciboExistente?: ReciboAlineacionExistente | null;
}): DecisionRenovacion {
  if (!e.modoProporcional) return { accion: 'normal' };
  // Un recibo ANULADO por el estudio ya no está en juego: la cuota sigue vencida y toca el camino de siempre.
  if (e.reciboExistente && e.fechaFin && e.reciboExistente.estado !== 'ANULADO') {
    if (e.reciboExistente.estado === 'COBRADO' && e.reciboExistente.entregaAplicada !== true) {
      return { accion: 'reparar', reciboId: idReciboAlineacion(e.suscripcionId, e.fechaFin) };
    }
    return { accion: 'saltar' };
  }
  if (e.reciboExistente?.estado === 'ANULADO') return { accion: 'normal' };
  const plan = planificarAlineacion(e);
  if (!plan) return { accion: 'normal' };
  return plan.tipo === 'extender' ? { accion: 'extender', plan } : { accion: 'cobrar', plan };
}

// ── Lo que la ruta de activación decide, sin red ────────────────────────────

export type ValidacionCambioModo =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 409; codigo: string; error: string };

/**
 * ¿Se puede poner el modo pedido? Solo la propietaria; B solo con el día 1 ya guardado y con la huella de
 * la lista que HOY sale. Volver a ENTERA no pide huella.
 */
export function validarCambioModo(e: {
  rol: string; modo: unknown; dia1Activo: boolean; huella: unknown; huellaActual: string | null;
}): ValidacionCambioModo {
  if (e.rol !== 'PROPIETARIO') return { ok: false, status: 403, codigo: 'ROL', error: 'Solo la propietaria puede cambiar cuándo se cobra a las alumnas.' };
  if (e.modo !== 'PROPORCIONAL' && e.modo !== 'ENTERA') return { ok: false, status: 400, codigo: 'MODO', error: 'Petición no válida' };
  if (e.modo === 'ENTERA') return { ok: true };
  if (!e.dia1Activo) return { ok: false, status: 409, codigo: 'DIA_1_APAGADO', error: 'Primero guarda «Todas el día 1 de cada mes».' };
  if (typeof e.huella !== 'string' || !e.huella || e.huella !== e.huellaActual) {
    return { ok: false, status: 409, codigo: 'LISTA_CAMBIADA', error: 'La lista de alumnas ha cambiado desde que la viste (otro día, otra cuota o otro ajuste). Revísala otra vez antes de activar.' };
  }
  return { ok: true };
}
