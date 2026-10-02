// ─────────────────────────────────────────────────────────────────────────────
// ¿Qué es cada abono, antes de buscar a quién corresponde?
//
// Lo importante aquí es en qué dirección equivocarse. Clasificar como
// `NO_ALUMNA` un pago de verdad lo ESCONDE (no sale en la bandeja y nadie lo
// ve); clasificar como `COBRO` algo que no lo es solo hace que una persona lo
// descarte. Por eso solo va a `NO_ALUMNA` lo que es inequívoco (el pago de
// Stripe al estudio, un ingreso de efectivo, intereses) y todo lo dudoso se
// queda como `COBRO`.
//
// Los patrones salen de cómo escriben los conceptos los bancos y crecerán con
// cada fichero real. Puro.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetodoMovimiento, MovimientoNormalizado, TipoMovimiento } from './tipos.ts';
import type { MovimientoN43 } from './norma43.ts';
import { conceptoGuardable, normalizar, pagadorGuardable, referenciaGuardable } from './texto.ts';
import { claveNorma43 } from './idempotencia.ts';

export interface Clasificacion { tipo: TipoMovimiento; metodo: MetodoMovimiento }

// Conceptos comunes de la AEB que importan aquí.
const COMUN_CAJERO = '11';
const COMUN_TARJETAS = '12';
const COMUN_DEVOLUCIONES = '14';
const COMUN_INTERESES = '17';
const COMUN_ANULACIONES = '98';
const COMUN_TRANSFERENCIAS = '04';

const RE_BIZUM = /\bbizum\b/;
const RE_STRIPE = /\bstripe\b/;
const RE_LIQUIDACION = /\b(tpv|datafono|liq tpv|liq tarj\w*|liq comercio|remesa tarjeta\w*|abono tarjeta\w*|ventas? (con )?tarjeta\w*|liquidacion (de )?(comercio|tarjetas?|tpv))\b/;
const RE_EFECTIVO = /\b(ingreso (en )?efectivo|ingreso (en )?caja|ingreso ventanilla|deposito efectivo)\b/;
const RE_INTERESES = /\b(intereses?|liquidacion intereses|bonificacion)\b/;
const RE_TRANSFERENCIA = /\b(transf\w*|trf|ordenante|traspaso)\b/;

export function clasificarAbono(p: { conceptoComun?: string | null; texto: string }): Clasificacion {
  const t = normalizar(p.texto);
  const comun = p.conceptoComun ?? '';
  if (RE_BIZUM.test(t)) return { tipo: 'COBRO', metodo: 'BIZUM' };
  if (RE_STRIPE.test(t)) return { tipo: 'NO_ALUMNA', metodo: 'TRANSFERENCIA' };
  if (comun === COMUN_TARJETAS || RE_LIQUIDACION.test(t)) return { tipo: 'LIQUIDACION', metodo: 'TARJETA' };
  if (comun === COMUN_CAJERO || RE_EFECTIVO.test(t)) return { tipo: 'NO_ALUMNA', metodo: 'OTRO' };
  if (comun === COMUN_INTERESES || comun === COMUN_ANULACIONES || comun === COMUN_DEVOLUCIONES || RE_INTERESES.test(t)) {
    return { tipo: 'NO_ALUMNA', metodo: 'OTRO' };
  }
  if (comun === COMUN_TRANSFERENCIAS || RE_TRANSFERENCIA.test(t)) return { tipo: 'COBRO', metodo: 'TRANSFERENCIA' };
  return { tipo: 'COBRO', metodo: 'OTRO' };
}

// «Bizum de MARIA GARCIA concepto cuota», «Transferencia de García López, María»…
const RE_PAGADOR = [
  /\bbizum (?:recibido )?de ([a-zñ ]{3,60}?)(?= concepto| conc| ref|$)/,
  /\btransf\w* (?:a favor )?de ([a-zñ ]{3,60}?)(?= concepto| conc| ref|$)/,
  /\bordenante ([a-zñ ]{3,60}?)(?= concepto| conc| ref|$)/,
];

/** El nombre de quien paga, si el concepto lo dice de forma reconocible. Mejor esfuerzo. */
export function pagadorDe(texto: string): string | null {
  const t = normalizar(texto);
  for (const re of RE_PAGADOR) {
    const m = t.match(re);
    if (m?.[1]) {
      const nombre = m[1].trim();
      if (nombre.split(' ').length >= 2) return nombre.slice(0, 80);
    }
  }
  return null;
}

/**
 * Un movimiento de Norma 43 a la forma común. `aparicion` es el número de
 * aparición de esa misma línea en su cuenta y su día (ver idempotencia.ts).
 */
export function normalizarN43(m: MovimientoN43, aparicion: number): MovimientoNormalizado {
  const texto = [...m.conceptos, m.referencia1, m.referencia2].filter(Boolean).join(' ');
  const { tipo, metodo } = clasificarAbono({ conceptoComun: m.conceptoComun, texto });
  return {
    fuente: 'norma43',
    claveIdempotencia: claveNorma43(m, aparicion),
    idExterno: null,
    tipo, metodo,
    importeCentimos: m.importeCentimos,
    fechaOperacion: m.fechaOperacion,
    horaOperacion: null,
    fechaValor: m.fechaValor,
    referencia: referenciaGuardable(m.referencia2 || m.referencia1 || m.documento || null),
    tarjetaUltimos4: null,
    tarjetaMarca: null,
    terminalRef: null,
    pagadorNombre: tipo === 'COBRO' ? pagadorGuardable(pagadorDe(texto)) : null,
    concepto: conceptoGuardable(m.conceptos.join(' ')),
  };
}
