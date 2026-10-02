// ─────────────────────────────────────────────────────────────────────────────
// «Próximas cuotas» (decisión 7 de las maquetas aprobadas el 2-oct-2026), en
// lugar de «Ver las N suscripciones activas», cuyos botones no hacían nada:
// cómo se va a cobrar cada cuota que se renueva en los próximos días, con lo que
// hacen de verdad los crons (`lib/inngest/renovaciones.ts` y `dunning.ts`):
//   · solo se renuevan las cuotas MENSUALES ACTIVAS con fecha de fin, de
//     clientas en activo; el recibo nace el día SIGUIENTE al fin, por la mañana;
//   · con la baja programada (`bajaAlVencer`) no se renueva: se cancela;
//   · se cobra sola si el estudio tiene Stripe y ella cliente de Stripe con
//     tarjeta o domiciliación guardadas; una tarjeta que caduca antes fallará
//     tres veces y la cuota se cancelará sola (`dunning.ts`, fallo definitivo);
//   · sin eso, va en la remesa si el estudio la prepara y ella tiene mandato, y
//     si no, la cobra el estudio (a ella se le avisa ese día).
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { elegirMetodoCobro } from '../billing/metodo-cobro.ts';
import { caducaAntesDe } from '../billing/tarjeta-caducidad.ts';
import type { PagoGuardadoDeLaClienta } from './reintento-automatico.ts';
import { sumarDias } from './lo-cobrado.ts';

export type ComoSeCobraraLaCuota = 'SOLA_TARJETA' | 'SOLA_DOMICILIACION' | 'TARJETA_CADUCA' | 'REMESA' | 'A_MANO' | 'NO_SE_RENUEVA' | 'NO_SE_SABE';

export interface ProximaCuota {
  suscripcionId: string;
  socioId: string;
  planNombre: string;
  importe: number;
  /** El día en que nace su recibo ('YYYY-MM-DD'). */
  dia: string;
  como: ComoSeCobraraLaCuota;
}

export interface CuotaParaProximas {
  id: string;
  socioId: string;
  planId: string;
  estado: string;
  fechaFin: string | null;
  bajaAlVencer?: boolean;
}

export function proximasCuotas(p: {
  suscripciones: readonly CuotaParaProximas[];
  planes: ReadonlyMap<string, { tipo: string; nombre: string; precio: number }>;
  /** La clienta en activo, y sus datos de pago (`null` si no se han podido leer). */
  clienta: (socioId: string) => { activa: boolean; pago: PagoGuardadoDeLaClienta | null } | undefined;
  tieneMandatoVigente: (socioId: string) => boolean;
  estudioConStripe: boolean;
  estudioHaceRemesas: boolean;
  hoy: string;
  /** Cuántos días por delante. */
  dias?: number;
}): { cuotas: ProximaCuota[]; sinFechaDeFin: number } {
  const dias = p.dias ?? 30;
  const hasta = sumarDias(p.hoy, dias);
  const cuotas: ProximaCuota[] = [];
  let sinFechaDeFin = 0;
  for (const s of p.suscripciones) {
    if (s.estado !== 'ACTIVA') continue;
    const plan = p.planes.get(s.planId);
    if (!plan || plan.tipo !== 'MENSUAL') continue;
    const clienta = p.clienta(s.socioId);
    if (!clienta?.activa) continue;
    if (!s.fechaFin) { sinFechaDeFin++; continue; }
    const dia = sumarDias(s.fechaFin.slice(0, 10), 1);
    if (dia < p.hoy || dia > hasta) continue;
    cuotas.push({
      suscripcionId: s.id, socioId: s.socioId, planNombre: plan.nombre, importe: plan.precio, dia,
      como: comoSeCobrara(s, clienta.pago, dia, p),
    });
  }
  cuotas.sort((a, b) => a.dia.localeCompare(b.dia) || a.socioId.localeCompare(b.socioId));
  return { cuotas, sinFechaDeFin };
}

function comoSeCobrara(
  s: CuotaParaProximas,
  pago: PagoGuardadoDeLaClienta | null,
  dia: string,
  p: { estudioConStripe: boolean; estudioHaceRemesas: boolean; tieneMandatoVigente: (socioId: string) => boolean },
): ComoSeCobraraLaCuota {
  if (s.bajaAlVencer) return 'NO_SE_RENUEVA';
  if (!pago) return 'NO_SE_SABE';
  const metodo = elegirMetodoCobro({
    metodo_pago_preferido: pago.metodoPagoPreferido ?? null,
    stripe_payment_method_id: pago.stripePaymentMethodId ?? null,
    sepa_payment_method_id: pago.sepaPaymentMethodId ?? null,
    sepa_mandate_id: pago.sepaMandateId ?? null,
  });
  if (p.estudioConStripe && pago.stripeCustomerId && metodo.ok) {
    if (metodo.metodo === 'SEPA') return 'SOLA_DOMICILIACION';
    // El cobro es ese día por la mañana: si para entonces ya no vale, fallará.
    const momento = new Date(`${dia}T12:00:00Z`);
    return caducaAntesDe({ expMes: pago.tarjetaExpMes ?? null, expAnio: pago.tarjetaExpAnio ?? null }, momento) ? 'TARJETA_CADUCA' : 'SOLA_TARJETA';
  }
  if (p.estudioHaceRemesas && p.tieneMandatoVigente(s.socioId)) return 'REMESA';
  return 'A_MANO';
}

/** La frase de cada cuota. `fecha` es el día ya escrito para la pantalla («1 nov»). */
export function textoComoSeCobrara(como: ComoSeCobraraLaCuota, fecha: string): string {
  switch (como) {
    case 'SOLA_TARJETA': return 'Se cobra sola con su tarjeta';
    case 'SOLA_DOMICILIACION': return 'Se cobra sola por domiciliación';
    case 'TARJETA_CADUCA': return 'Su tarjeta caduca antes: pídele otra. Si no, fallará tres veces y su cuota se cancelará sola';
    case 'REMESA': return `Irá en la remesa que prepares a partir del ${fecha}`;
    case 'A_MANO': return 'La cobras tú: no tiene tarjeta ni domiciliación. A ella se le avisa ese día';
    case 'NO_SE_RENUEVA': return 'No se renueva: tiene la baja programada';
    case 'NO_SE_SABE': return 'No hemos podido leer sus datos de pago';
  }
}
