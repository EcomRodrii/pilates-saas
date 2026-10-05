import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
// Relativas a propósito (como lib/clientas/estado-servidor.ts): así lo pueden
// cargar las pruebas de `node --test`, que no resuelven `@/`.
import { todasLasFilas, type Pagina } from '../clientas/estado-servidor.ts';
import { estaSinCobrar } from '../billing/situacion-recibo.ts';
import type { Tramo } from './lo-cobrado.ts';
import type { ReciboDeInforme } from '../informes/dinero.ts';

// Los recibos que hacen falta para las cifras de dinero EN EL SERVIDOR, con la
// forma del panel (`ReciboDeInforme`), para pasarlos por las MISMAS funciones
// puras que Informes › Dinero y «Lo que he cobrado» (`dineroDelTramo`,
// `cobradoEnTramo`, `resumirRecibos`): docs/cifras-financieras.md.
//
// Paginados de 1.000 en 1.000. `dbIngresosEnRango` (lib/decision/db.ts) no
// pagina y solo mira COBRADO: vale para una semana del resumen semanal, no para
// un año o para «todo lo que se debe». Ese no se toca.
//
// `null` si falla cualquier página: una cifra de dinero a medias es peor que
// ninguna.

const COLUMNAS = 'id, socio_id, suscripcion_id, estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, '
  + 'fecha_cobro, fecha_vencimiento, metodo_cobro, stripe_payment_intent_id, conciliado_por';

interface FilaRecibo {
  id: string;
  socio_id: string | null;
  suscripcion_id: string | null;
  estado: string;
  importe: number | string;
  importe_devuelto: number | string | null;
  reembolso_stripe_id: string | null;
  reembolso_solicitado_en: string | null;
  fecha_cobro: string | null;
  fecha_vencimiento: string | null;
  metodo_cobro: string | null;
  stripe_payment_intent_id: string | null;
  conciliado_por: string | null;
}

export function aReciboDeInforme(r: FilaRecibo): ReciboDeInforme {
  return {
    id: r.id,
    socioId: r.socio_id,
    suscripcionId: r.suscripcion_id,
    estado: r.estado,
    importe: r.importe,
    importeDevuelto: r.importe_devuelto,
    reembolsoStripeId: r.reembolso_stripe_id,
    reembolsoSolicitadoEn: r.reembolso_solicitado_en,
    fechaCobro: r.fecha_cobro,
    fechaVencimiento: r.fecha_vencimiento,
    metodoCobro: r.metodo_cobro,
    stripePaymentIntentId: r.stripe_payment_intent_id,
    conciliadoPor: r.conciliado_por,
  };
}

/**
 * Los recibos con fecha de COBRO dentro del tramo, en cualquier estado: quien
 * decide qué cuenta es `cobradoEnTramo` (un devuelto entero sigue en su día y
 * suma 0), igual que en el navegador.
 */
export async function recibosCobradosEnTramo(
  admin: SupabaseClient, studioId: string, tramo: Tramo,
): Promise<ReciboDeInforme[] | null> {
  const { data, error } = await todasLasFilas<FilaRecibo>((d, h) =>
    admin.from('recibos').select(COLUMNAS).eq('studio_id', studioId)
      .gte('fecha_cobro', tramo.desde).lte('fecha_cobro', tramo.hasta)
      .order('id').range(d, h) as unknown as Pagina<FilaRecibo>);
  if (error) return null;
  return data.map(aReciboDeInforme);
}

/** Todo lo que aún no ha entrado y puede entrar (la lista «Sin cobrar» de Cobros: `estaSinCobrar`). */
export async function recibosSinCobrar(
  admin: SupabaseClient, studioId: string,
): Promise<ReciboDeInforme[] | null> {
  const { data, error } = await todasLasFilas<FilaRecibo>((d, h) =>
    admin.from('recibos').select(COLUMNAS).eq('studio_id', studioId)
      .in('estado', ['PENDIENTE', 'EN_CURSO', 'FALLIDO', 'DEVUELTO'])
      .order('id').range(d, h) as unknown as Pagina<FilaRecibo>);
  if (error) return null;
  return data.map(aReciboDeInforme).filter(estaSinCobrar);
}
