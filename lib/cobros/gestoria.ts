// ─────────────────────────────────────────────────────────────────────────────
// «Para tu gestoría» y la línea de «Facturas» (decisión 8 de las maquetas
// aprobadas el 2-oct-2026).
//
// · Un estudio que NO factura con Tentare ve lo que su gestoría necesita: lo
//   cobrado del trimestre natural (el del IVA) anterior, el que va, y el año
//   anterior. Las cifras son las de «Lo que he cobrado» (`cobradoEnTramo`).
// · Uno que SÍ factura ve una línea del periodo —base, IVA por tipo y total—
//   con la misma regla que el cierre (`lib/fiscal/cierre-engine.ts`): fuera las
//   facturas con la anulación aceptada por la AEAT, y el IVA real de cada
//   factura (nada de un «21 %» escrito a mano).
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { aCentimos } from '../billing/situacion-recibo.ts';
import { sumarDias, tramo, type Tramo } from './lo-cobrado.ts';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ORDINAL = ['', '1.er', '2.º', '3.er', '4.º'];

export interface BloqueGestoria { tramo: Tramo; etiqueta: string }

/** El trimestre natural anterior, el que va (hasta hoy) y el año anterior. */
export function bloquesDeGestoria(hoy: string): { anterior: BloqueGestoria; enCurso: BloqueGestoria; anioAnterior: BloqueGestoria } {
  const actual = tramo('TRIMESTRE', hoy);
  const anterior = tramo('TRIMESTRE', sumarDias(actual.desde, -1));
  const nTrim = (t: Tramo) => Math.floor((Number(t.desde.slice(5, 7)) - 1) / 3) + 1;
  const mes = (ymd: string) => MESES[Number(ymd.slice(5, 7)) - 1];
  const anioHoy = hoy.slice(0, 4);
  const deAnio = (t: Tramo) => (t.desde.slice(0, 4) === anioHoy ? '' : ` de ${t.desde.slice(0, 4)}`);
  const anioAnterior = String(Number(anioHoy) - 1);
  return {
    anterior: {
      tramo: anterior,
      etiqueta: `${ORDINAL[nTrim(anterior)]} trimestre${deAnio(anterior)} · ${mes(anterior.desde)} – ${mes(anterior.hasta)}`,
    },
    enCurso: {
      tramo: { desde: actual.desde, hasta: hoy },
      etiqueta: `${ORDINAL[nTrim(actual)]} trimestre · desde el 1 de ${mes(actual.desde)}`,
    },
    anioAnterior: { tramo: { desde: `${anioAnterior}-01-01`, hasta: `${anioAnterior}-12-31` }, etiqueta: `Año ${anioAnterior}` },
  };
}

export interface FacturaParaResumen {
  fechaEmision: string;
  baseImponible: number | string;
  tipoIVA: number | string;
  cuotaIVA: number | string;
  total: number | string;
  verifactuEstado?: string | null;
}

export interface ResumenFacturado {
  base: number;
  cuota: number;
  total: number;
  nFacturas: number;
  /** Por tipo de IVA, del mayor al menor. */
  porIva: { tipoIva: number; base: number; cuota: number }[];
  /** Con la anulación aceptada por la AEAT: no suman, pero se dicen. */
  nAnuladas: number;
}

const n = (x: number | string | null | undefined) => {
  const v = typeof x === 'string' ? parseFloat(x) : (x ?? 0);
  return Number.isFinite(v) ? v : 0;
};

/** Lo facturado entre dos días (incluidos), con la regla del cierre. */
export function resumenFacturado(facturas: readonly FacturaParaResumen[], t: Tramo): ResumenFacturado {
  let base = 0, cuota = 0, total = 0, nFacturas = 0, nAnuladas = 0;
  const iva = new Map<number, { tipoIva: number; base: number; cuota: number }>();
  for (const f of facturas) {
    const fecha = (f.fechaEmision ?? '').slice(0, 10);
    if (fecha < t.desde || fecha > t.hasta) continue;
    if (f.verifactuEstado === 'ANULADA') { nAnuladas++; continue; }
    nFacturas++;
    base += n(f.baseImponible); cuota += n(f.cuotaIVA); total += n(f.total);
    const tipo = n(f.tipoIVA);
    const linea = iva.get(tipo) ?? { tipoIva: tipo, base: 0, cuota: 0 };
    linea.base += n(f.baseImponible); linea.cuota += n(f.cuotaIVA);
    iva.set(tipo, linea);
  }
  return {
    base: aCentimos(base), cuota: aCentimos(cuota), total: aCentimos(total), nFacturas, nAnuladas,
    porIva: [...iva.values()].map(l => ({ ...l, base: aCentimos(l.base), cuota: aCentimos(l.cuota) })).sort((a, b) => b.tipoIva - a.tipoIva),
  };
}

/**
 * Cobros del periodo que no tienen factura, en un estudio que factura con
 * Tentare: los de efectivo (no la sacan solos) y los que quedaron pendientes de
 * sellar. `reciboConFactura` dice si un recibo ya tiene la suya.
 */
export function cobrosSinFactura<R extends { id: string; metodoCobro?: string | null; facturaPendienteSellar?: boolean | null }>(
  cobrados: readonly R[],
  reciboConFactura: (id: string) => boolean,
  importe: (r: R) => number,
): { enEfectivo: { n: number; importe: number }; pendientesDeSellar: { n: number; importe: number } } {
  const enEfectivo = { n: 0, importe: 0 }, pendientesDeSellar = { n: 0, importe: 0 };
  for (const r of cobrados) {
    if (reciboConFactura(r.id)) continue;
    const i = importe(r);
    if (i <= 0) continue;
    const grupo = r.facturaPendienteSellar ? pendientesDeSellar : r.metodoCobro === 'EFECTIVO' ? enEfectivo : null;
    if (!grupo) continue;
    grupo.n++;
    grupo.importe = aCentimos(grupo.importe + i);
  }
  return { enEfectivo, pendientesDeSellar };
}

/**
 * Veri*Factu en una frase que diga la verdad: la huella se pone al COBRAR (no
 * se afirma que «quede registrada» en la AEAT), y lo que no tiene factura, con
 * su porqué.
 */
/**
 * Con Veri*Factu apagado no se promete huella ni QR, y se dice cuándo obliga la
 * norma (calendario publicado a 2-oct-2026; que lo confirme su asesoría).
 */
export const AVISO_VERIFACTU_APAGADO =
  'Tus facturas no se envían a la AEAT (Veri*Factu desactivado). Con el calendario publicado hoy, el reglamento de sistemas de facturación obliga desde el 1 de enero de 2027 a las sociedades y desde el 1 de julio de 2027 al resto. Confírmalo con tu asesoría.';

export function fraseVerifactu(p: { nifEstudioValido: boolean; pendientesDeSellar: number; conVerifactu?: boolean }): string {
  if (!p.nifEstudioValido) return 'No se están sacando facturas: falta el NIF fiscal del estudio.';
  const base = p.conVerifactu === false
    ? 'Cada cobro saca su factura, numerada, al cobrarse.'
    : 'Cada factura se sella con su huella Veri*Factu al cobrarse.';
  if (p.pendientesDeSellar === 0) return base;
  return `${base} ${p.pendientesDeSellar === 1 ? '1 cobro se quedó' : `${p.pendientesDeSellar} cobros se quedaron`} sin factura al sellar: puedes reintentarlo desde «Lo que he cobrado».`;
}
