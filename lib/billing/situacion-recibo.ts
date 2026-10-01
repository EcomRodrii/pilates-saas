// ─────────────────────────────────────────────────────────────────────────────
// Qué significa cada recibo para las CIFRAS: la única lectura de
// `recibos.estado` que deben usar Inicio, Cobros, Informes, Marketing, la ficha
// de la clienta y la API.
//
// Por qué existe (F0, 1-oct-2026): un estudio nos dijo que «las cifras no
// cuadran», y tenía razón. Cada pantalla filtraba `estado === 'COBRADO'` a su
// manera, y entre todas:
//   · ninguna restaba un reembolso parcial (`importe_devuelto`);
//   · «Lo que he cobrado» agrupaba lo cobrado por la fecha de VENCIMIENTO
//     mientras el KPI de encima usaba la de COBRO (424 € frente a 206 € para el
//     mismo agosto);
//   · un recibo devuelto POR EL BANCO —deuda otra vez, y así lo trata el
//     bloqueo por impago (`socio_tiene_impago`)— no salía en «Sin cobrar».
//
// `estado` no basta para decidir, por dos motivos:
//   1. DEVUELTO son dos cosas opuestas. Devuelto por el banco (adeudo SEPA
//      rechazado, «devuelto» a mano): `importe_devuelto = 0`, la socia sigue
//      debiendo. Reembolsado por el estudio: `importe_devuelto >= importe`, ni
//      es ingreso ni es deuda. Las distingue `esReciboCobrable`, que es la
//      regla que ya comparten el bloqueo por impago y el pago online.
//   2. Un COBRADO con reembolso parcial sigue COBRADO (`recibos_estado_check`
//      no tiene «devuelto en parte»): lo ingresado es `importe - importe_devuelto`.
//
// Las situaciones (cada recibo está en una sola):
//   COBRADO      el dinero entró y no se ha devuelto entero → cuenta como ingreso,
//                por lo neto, en el mes de `fecha_cobro`.
//   POR_COBRAR   PENDIENTE: emitido y sin cobrar (en plazo o vencido).
//   IMPAGADO     se intentó y no entró: FALLIDO, o devuelto por el banco.
//   EN_CURSO     enviado al banco (remesa, adeudo en proceso) y SIN confirmar:
//                ni ingreso ni deuda vencida hasta que el banco conteste.
//   REEMBOLSADO  el estudio devolvió el dinero entero: ni ingreso ni deuda.
//   ANULADO      no se cobra ni cuenta en nada.
//
// La mitad SQL de «lo ingresado» es `recibo_importe_ingresado()` (migración
// 20261001122116), que usan las RPC de /informes. `situacion-recibo.test.ts`
// comprueba que las dos dicen lo mismo.
//
// Sin `@/` ni dependencias de UI: lo importan pantallas y servidor, y corre con
// `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoRecibo } from '../types.ts';
import { esReciboCobrable } from './deuda-recibo.ts';

export type SituacionRecibo = 'COBRADO' | 'POR_COBRAR' | 'IMPAGADO' | 'EN_CURSO' | 'REEMBOLSADO' | 'ANULADO';

/** Lo mínimo de un recibo (forma del panel, camelCase) para situarlo. */
export interface ReciboParaCifras {
  estado: EstadoRecibo | string;
  importe: number | string;
  importeDevuelto?: number | string | null;
  reembolsoStripeId?: string | null;
  reembolsoSolicitadoEn?: string | null;
  fechaCobro?: string | null;
  fechaVencimiento?: string | null;
  socioId?: string | null;
}

const num = (x: number | string | null | undefined): number => {
  const n = typeof x === 'string' ? Number(x) : (x ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Redondeo a céntimos: las sumas de importes en coma flotante dejan restos. */
export const aCentimos = (n: number): number => Math.round(n * 100) / 100;

export function situacionRecibo(r: ReciboParaCifras): SituacionRecibo {
  const importe = num(r.importe);
  const devuelto = num(r.importeDevuelto);
  switch (r.estado) {
    case 'COBRADO':
      // Un reembolso total que aún no ha movido el estado (el de un recibo del
      // TPV lo mueve un trigger; el de Stripe, el webhook) ya no es ingreso.
      return importe > 0 && devuelto >= importe ? 'REEMBOLSADO' : 'COBRADO';
    case 'PENDIENTE':
      return 'POR_COBRAR';
    case 'EN_CURSO':
      return 'EN_CURSO';
    case 'FALLIDO':
      return 'IMPAGADO';
    case 'DEVUELTO':
      return esReciboCobrable({
        estado: r.estado, importe, importe_devuelto: devuelto,
        reembolso_stripe_id: r.reembolsoStripeId ?? null,
        reembolso_solicitado_en: r.reembolsoSolicitadoEn ?? null,
      }) ? 'IMPAGADO' : 'REEMBOLSADO';
    case 'ANULADO':
      return 'ANULADO';
    default:
      // `recibos_estado_check` no deja llegar aquí. Si algún día llega un
      // estado nuevo sin cablear, que no cuente en NINGUNA cifra antes que
      // contarlo como dinero que no se sabe si existe.
      return 'ANULADO';
  }
}

/** Lo que de verdad entró por este recibo (neto de reembolsos). 0 si no es COBRADO. */
export function importeIngresado(r: ReciboParaCifras): number {
  if (situacionRecibo(r) !== 'COBRADO') return 0;
  return aCentimos(Math.max(0, num(r.importe) - num(r.importeDevuelto)));
}

/** Lo que la clienta debe: POR_COBRAR + IMPAGADO. EN_CURSO no (aún no ha contestado el banco). */
export function importeAdeudado(r: ReciboParaCifras): number {
  const s = situacionRecibo(r);
  return s === 'POR_COBRAR' || s === 'IMPAGADO' ? num(r.importe) : 0;
}

/** Lo que está en manos del banco, sin confirmar. */
export function importeEnCurso(r: ReciboParaCifras): number {
  return situacionRecibo(r) === 'EN_CURSO' ? num(r.importe) : 0;
}

/**
 * ¿Sale en la lista «Sin cobrar» de /cobros? Todo lo que aún no ha entrado y
 * puede entrar: lo que se debe y lo que está en el banco. La lista lo enseña
 * con su estado («Enviado al banco», «Rechazado»…), así que verlo junto no
 * lo mezcla; lo que sí se separa es la CIFRA (`importeAdeudado`).
 */
export function estaSinCobrar(r: ReciboParaCifras): boolean {
  const s = situacionRecibo(r);
  return s === 'POR_COBRAR' || s === 'IMPAGADO' || s === 'EN_CURSO';
}

/**
 * El mes ('YYYY-MM') en que un recibo cuenta para las cifras por mes: el de
 * COBRO si llegó a cobrarse (aunque luego se reembolsara), y el de VENCIMIENTO
 * si no. Agrupar lo cobrado por vencimiento metía en octubre renovaciones
 * cobradas en agosto.
 *
 * Opera sobre el texto 'YYYY-MM-DD' de una columna `date`: nunca `new Date()`,
 * que lo lee como medianoche UTC y en un navegador al oeste de UTC lo pasa al
 * día (y al mes) anterior.
 */
export function mesDelRecibo(r: ReciboParaCifras): string {
  const s = situacionRecibo(r);
  const cobrado = (s === 'COBRADO' || s === 'REEMBOLSADO') && r.fechaCobro;
  return ((cobrado ? r.fechaCobro : r.fechaVencimiento) ?? '').slice(0, 7);
}

/** Mes de cobro ('YYYY-MM'), o null si no se ha cobrado. */
export function mesDeCobro(r: ReciboParaCifras): string | null {
  return r.fechaCobro ? r.fechaCobro.slice(0, 7) : null;
}

/** 'YYYY-MM' del mes anterior, sin `Date` (un `setMonth(-1)` el 31-oct da 1-oct). */
export function mesAnterior(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface ResumenRecibos {
  /** Neto cobrado (el ingreso). */
  ingresado: number;
  /** De lo ingresado, lo que pagaron clientas (sin ventas de mostrador anónimas). */
  ingresadoClientas: number;
  porCobrar: number;
  impagado: number;
  enCurso: number;
  /** Recibos que cuentan en `ingresado`. */
  nCobrados: number;
  /** Clientas distintas con algún recibo en `ingresado`. */
  nClientasQuePagaron: number;
  /** Clientas distintas que deben algo (POR_COBRAR o IMPAGADO). */
  nClientasConDeuda: number;
}

export function resumirRecibos(recibos: readonly ReciboParaCifras[]): ResumenRecibos {
  let ingresado = 0, ingresadoClientas = 0, porCobrar = 0, impagado = 0, enCurso = 0, nCobrados = 0;
  const pagaron = new Set<string>();
  const deben = new Set<string>();
  for (const r of recibos) {
    const s = situacionRecibo(r);
    if (s === 'COBRADO') {
      const neto = importeIngresado(r);
      if (neto <= 0) continue;
      ingresado += neto;
      nCobrados++;
      if (r.socioId) { ingresadoClientas += neto; pagaron.add(r.socioId); }
    } else if (s === 'POR_COBRAR') {
      porCobrar += num(r.importe);
      if (r.socioId) deben.add(r.socioId);
    } else if (s === 'IMPAGADO') {
      impagado += num(r.importe);
      if (r.socioId) deben.add(r.socioId);
    } else if (s === 'EN_CURSO') {
      enCurso += num(r.importe);
    }
  }
  return {
    ingresado: aCentimos(ingresado), ingresadoClientas: aCentimos(ingresadoClientas),
    porCobrar: aCentimos(porCobrar), impagado: aCentimos(impagado), enCurso: aCentimos(enCurso),
    nCobrados, nClientasQuePagaron: pagaron.size, nClientasConDeuda: deben.size,
  };
}
