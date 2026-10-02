// ─────────────────────────────────────────────────────────────────────────────
// Lo que va a pasar al pulsar «Cobrar» en «Nuevo cobro»: si se apunta en la caja
// y si sale factura. Antes la maqueta decía «Se apunta en la caja y, si facturas
// con Tentare, sale su factura», y no siempre es verdad:
//   · la caja solo apunta un cobro en efectivo, tarjeta o Bizum, y solo con una
//     caja ABIERTA (`apuntar_cobro_en_caja`, efecto `caja` de `confirmarCobro`);
//     sin caja abierta no apunta, y no es un error;
//   · la factura sale sola si el cobro no es en efectivo (`emiteFacturaAutomatica`;
//     desde el 2-oct-2026 todo estudio factura). En efectivo, solo si se marca
//     «Hacerle factura» (decisión del fundador, 2-oct-2026). Sin NIF válido del
//     estudio (`nifEmisorValido`, la guarda del sellado) queda pendiente y sale
//     cuando lo pongan.
// Y «Es la renovación de su plan» no se puede marcar si esa cuota ya tiene una
// renovación viva: lo prohíbe un índice único (`recibos_renovacion_viva_por_suscripcion`).
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { emiteFacturaAutomatica, emiteFacturas } from '../factura-automatica.ts';
import { nifEmisorValido } from '../nif.ts';
import type { MetodoCobro, ModoFacturacion } from '../types.ts';

const PASAN_POR_CAJA: ReadonlySet<string> = new Set(['EFECTIVO', 'TARJETA', 'BIZUM']);

export interface QueVaAPasar {
  /** La frase de la caja, o `null` si no hay nada que decir (transferencia, o no se sabe). */
  caja: string | null;
  /** La frase de la factura, o `null` si el estudio no factura con Tentare. */
  factura: string | null;
  /** ¿Se pide factura? (sin NIF del estudio, queda pendiente) */
  saleFactura: boolean;
  /** ¿Se ofrece la casilla «Hacerle factura»? (estudio que factura, cobro en efectivo) */
  ofrecerHacerFactura: boolean;
}

export function queVaAPasar(p: {
  metodo: MetodoCobro | null;
  /** ¿Hay caja abierta? `null` = no se sabe (cargando, o no se pudo leer). */
  cajaAbierta: boolean | null;
  modoFacturacion: ModoFacturacion | null;
  nifEstudio: string | null;
  /** «Hacerle factura» marcado (solo cuenta en efectivo). */
  hacerFactura: boolean;
}): QueVaAPasar {
  let caja: string | null = null;
  if (p.metodo && PASAN_POR_CAJA.has(p.metodo) && p.cajaAbierta !== null) {
    caja = p.cajaAbierta ? 'Se apunta en la caja.' : 'No hay caja abierta: no se apunta en la caja.';
  }
  if (!emiteFacturas(p.modoFacturacion)) {
    return { caja, factura: null, saleFactura: false, ofrecerHacerFactura: false };
  }
  const efectivo = p.metodo === 'EFECTIVO';
  const quiereFactura = emiteFacturaAutomatica(p.metodo, p.modoFacturacion) || (efectivo && p.hacerFactura);
  if (!quiereFactura) {
    return { caja, factura: 'En efectivo no sale factura sola: marca «Hacerle factura» si te la pide.', saleFactura: false, ofrecerHacerFactura: true };
  }
  if (!nifEmisorValido(p.nifEstudio)) {
    // Se pide igual: queda pendiente y sale en cuanto el estudio ponga su NIF.
    return { caja, factura: 'Su factura queda pendiente hasta que pongas el NIF del estudio (Configuración → Cobros y facturas).', saleFactura: true, ofrecerHacerFactura: efectivo };
  }
  return { caja, factura: 'Sale su factura.', saleFactura: true, ofrecerHacerFactura: efectivo };
}

/**
 * ¿Esta cuota ya tiene una renovación viva (pendiente o en el banco)? Entonces
 * no se puede crear otra con «Es la renovación de su plan»: la base de datos la
 * rechazaría con un error genérico. Mismo criterio que el índice único.
 */
export function renovacionYaPendiente(
  suscripcionId: string | null,
  recibos: readonly { suscripcionId: string | null; estado: string; esRenovacion?: boolean }[],
): boolean {
  if (!suscripcionId) return false;
  return recibos.some(r => r.suscripcionId === suscripcionId && r.esRenovacion === true && (r.estado === 'PENDIENTE' || r.estado === 'EN_CURSO'));
}

/** «12,5» o «12.50» → 12.5; `null` si no es un importe válido (positivo, como mucho 2 decimales). */
export function leerImporte(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}
