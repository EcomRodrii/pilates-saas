// ─────────────────────────────────────────────────────────────────────────────
// «Cómo se le puede cobrar» en la ficha de Cobros: lo que hoy solo se descubre
// cuando algo falla. Y, con eso, qué botones tienen sentido para ESTA clienta
// (decisión 2 de las maquetas: «solo ofrece lo que funciona para ella»):
//   · «Cobrar con su tarjeta / domiciliación» (Stripe, sin ella delante) solo si
//     el estudio tiene Stripe conectado, ella tiene cliente de Stripe y el método
//     que elegiría el cobro (`elegirMetodoCobro`, el mismo que usa
//     `cobrarReciboOffSession`), y la tarjeta no está caducada;
//   · «Pedirle la tarjeta / una nueva / Cambiar su tarjeta», solo con Stripe;
//   · la domiciliación por remesa, solo si el estudio prepara remesas y ella
//     tiene un mandato VIGENTE.
// Dos estados honestos: los mandatos aún sin llegar («Comprobando…») y sus datos
// de pago sin poder leerse (no se afirma «sin tarjeta»).
//
// Puro (sin `@/`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { elegirMetodoCobro } from '../billing/metodo-cobro.ts';
import { caducaAntesDe, nombreDeMarca } from '../billing/tarjeta-caducidad.ts';
import type { PagoGuardadoDeLaClienta } from './reintento-automatico.ts';

export interface DatosDePagoDeLaClienta extends PagoGuardadoDeLaClienta {
  tarjetaMarca?: string | null;
  tarjetaUltimos4?: string | null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface TarjetaGuardada {
  /** «Visa ··4242», o «Link». */
  nombre: string;
  /** «05/2027», o `null` si no se guardó (Link, o aún sin rellenar). */
  caducidad: string | null;
  caducada: boolean;
}

export type MedioDeCobro =
  | { estado: 'COMPROBANDO' }
  | { estado: 'SIN_LEER' }
  | {
      estado: 'LISTO';
      tarjeta: TarjetaGuardada | null;
      /** Domiciliación por Stripe (método SEPA guardado). */
      domiciliacionStripe: boolean;
      /** Mandato VIGENTE y el estudio prepara remesas: entra en la remesa. */
      domiciliacionRemesa: boolean;
      /** Lo que cobraría «Cobrar con su …» sin ella delante, o `null` si no se puede. */
      online: { metodo: 'TARJETA' | 'SEPA'; boton: string } | null;
      /** Qué enlace de tarjeta ofrecer, o `null` (sin Stripe, o la cobra la remesa). */
      pedirTarjeta: 'PEDIR' | 'PEDIR_NUEVA' | 'CAMBIAR' | null;
      /** Una línea por medio («Visa ··4242 · caduca 05/2027», «Domiciliación (mandato firmado)»…). */
      lineas: string[];
      /** «Caducó en septiembre de 2026», si es el caso. */
      aviso: string | null;
    };

export const TEXTO_PEDIR_TARJETA: Record<'PEDIR' | 'PEDIR_NUEVA' | 'CAMBIAR', string> = {
  PEDIR: 'Pedirle la tarjeta',
  PEDIR_NUEVA: 'Pedirle una tarjeta nueva',
  CAMBIAR: 'Cambiar su tarjeta',
};

function tarjetaDe(c: DatosDePagoDeLaClienta, ahora: Date): TarjetaGuardada | null {
  if (!c.stripePaymentMethodId && !c.tarjetaUltimos4 && c.tarjetaMarca !== 'link') return null;
  if (c.tarjetaMarca === 'link') return { nombre: 'Link', caducidad: null, caducada: false };
  const nombre = c.tarjetaUltimos4 ? `${nombreDeMarca(c.tarjetaMarca)} ··${c.tarjetaUltimos4}` : nombreDeMarca(c.tarjetaMarca);
  const mes = c.tarjetaExpMes ?? null, anio = c.tarjetaExpAnio ?? null;
  return {
    nombre,
    caducidad: mes && anio ? `${String(mes).padStart(2, '0')}/${anio}` : null,
    caducada: caducaAntesDe({ expMes: mes, expAnio: anio }, ahora),
  };
}

export function comoSeLePuedeCobrar(p: {
  /** `null` si sus datos de pago no se han podido leer. */
  clienta: DatosDePagoDeLaClienta | null;
  estudioConStripe: boolean;
  /** El estudio tiene acreedor, IBAN y titular de remesas. */
  estudioHaceRemesas: boolean;
  /** ¿Han llegado ya los mandatos? (vienen en una segunda carga) */
  mandatosCargados: boolean;
  tieneMandatoVigente: boolean;
  ahora: Date;
}): MedioDeCobro {
  if (!p.mandatosCargados) return { estado: 'COMPROBANDO' };
  if (!p.clienta) return { estado: 'SIN_LEER' };
  const c = p.clienta;
  const tarjeta = tarjetaDe(c, p.ahora);
  const domiciliacionStripe = !!c.sepaPaymentMethodId;
  const domiciliacionRemesa = p.estudioHaceRemesas && p.tieneMandatoVigente;

  const metodo = elegirMetodoCobro({
    metodo_pago_preferido: c.metodoPagoPreferido ?? null,
    stripe_payment_method_id: c.stripePaymentMethodId ?? null,
    sepa_payment_method_id: c.sepaPaymentMethodId ?? null,
    sepa_mandate_id: c.sepaMandateId ?? null,
  });
  let online: { metodo: 'TARJETA' | 'SEPA'; boton: string } | null = null;
  if (p.estudioConStripe && c.stripeCustomerId && metodo.ok) {
    if (metodo.metodo === 'SEPA') online = { metodo: 'SEPA', boton: 'Cobrar por su domiciliación' };
    else if (tarjeta && !tarjeta.caducada) online = { metodo: 'TARJETA', boton: `Cobrar con su tarjeta${tarjeta.nombre === 'Link' ? ' (Link)' : c.tarjetaUltimos4 ? ` ··${c.tarjetaUltimos4}` : ''}` };
  }

  // El enlace de tarjeta lo genera Stripe: sin Stripe no hay nada que pedir. A
  // quien ya cobra la remesa no se le insiste con la tarjeta si no la tiene.
  let pedirTarjeta: 'PEDIR' | 'PEDIR_NUEVA' | 'CAMBIAR' | null = null;
  if (p.estudioConStripe) {
    if (!tarjeta) pedirTarjeta = domiciliacionRemesa || domiciliacionStripe ? null : 'PEDIR';
    else pedirTarjeta = tarjeta.caducada ? 'PEDIR_NUEVA' : 'CAMBIAR';
  }

  const lineas: string[] = [];
  if (tarjeta) {
    lineas.push(tarjeta.nombre === 'Link'
      ? 'Link (pago guardado en Stripe)'
      : `${tarjeta.nombre}${tarjeta.caducidad ? ` · caduca ${tarjeta.caducidad}` : ' (sin fecha de caducidad guardada)'}`);
  }
  if (domiciliacionStripe) lineas.push('Domiciliación con Stripe');
  if (domiciliacionRemesa) lineas.push('Domiciliación (mandato firmado)');
  if (lineas.length === 0) lineas.push('Sin tarjeta ni domiciliación');

  const aviso = tarjeta?.caducada && c.tarjetaExpMes && c.tarjetaExpAnio
    ? `Caducó en ${MESES[c.tarjetaExpMes - 1]} de ${c.tarjetaExpAnio}`
    : null;

  return { estado: 'LISTO', tarjeta, domiciliacionStripe, domiciliacionRemesa, online, pedirTarjeta, lineas, aviso };
}
