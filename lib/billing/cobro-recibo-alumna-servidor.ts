// Las lecturas de las que sale «quién cobra cada recibo de la alumna» (`cobro-recibo-alumna.ts`), en UN sitio.
//
// La regla es pura y vive allí; esto solo junta sus datos: el mandato (si el estudio hace remesas), la cuota de cada
// recibo con su tipo de plan y el estado de sus penalizaciones. Antes solo lo hacía fetchPublicStudioData, y las otras
// dos puertas que tocan la renovación (`/api/public/renovar-plan` y el aviso «renovación sin tarjeta» del cron) no
// miraban quién la cobra: le reutilizaban para pagar con tarjeta una renovación que iba en la remesa, o le avisaban «no
// tienes tarjeta guardada» a una domiciliada. Una lectura que falle devuelve `null` y quien llama falla CERRADO (no
// ofrece pagar, no avisa): con dinero de por medio, no saber no es «le toca a ella».
//
// Sin `@/`: lo prueba `node --test` con un cliente falso.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cobroDeReciboAlumna, type CobroDeReciboAlumna, type ContextoCobroAlumna, type FilaReciboAlumna,
} from './cobro-recibo-alumna.ts';
import type { SocioMetodoPago } from './metodo-cobro.ts';
import { tipoPlanEmbebido } from './renovacion-adoptable.ts';

/** Las columnas de `recibos` que lee la regla (`FilaReciboAlumna`), más de quién es. */
export const COLUMNAS_RECIBO_COBRO_ALUMNA =
  'id, socio_id, estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, es_renovacion, '
  + 'proximo_reintento, fecha_vencimiento, suscripcion_id, cobro_off_session_clave, cobro_mostrador_pi, tras_cancelar_cuota, '
  + 'checkout_session_id, stripe_payment_intent_id';
/** Sus métodos guardados: el MISMO dato con el que elige el cobro diario (`elegirMetodoCobro`). */
export const COLUMNAS_SOCIO_METODO_COBRO = 'metodo_pago_preferido, stripe_payment_method_id, sepa_payment_method_id';
/** Si cobra online (Stripe) y si hace remesas (datos de acreedor SEPA). */
export const COLUMNAS_ESTUDIO_COBRO_ALUMNA = 'stripe_account_id, sepa_acreedor_id, sepa_iban, sepa_titular';

export interface EstudioCobroAlumna {
  stripe_account_id?: string | null;
  sepa_acreedor_id?: string | null;
  sepa_iban?: string | null;
  sepa_titular?: string | null;
}

const ESTADOS_DEUDA = ['PENDIENTE', 'FALLIDO', 'DEVUELTO'];
const vacio = { data: [] as Record<string, unknown>[], error: null };

/**
 * El contexto de la regla para UNA alumna. Lee solo si debe algo (si no, ningún recibo es deuda y la regla no mira el
 * contexto). `null` = alguna lectura falló: quien llama no ofrece pagar ni avisa.
 */
export async function contextoCobroAlumna(
  admin: SupabaseClient,
  p: {
    studioId: string; socioId: string; estudio: EstudioCobroAlumna; socio: SocioMetodoPago;
    recibos: readonly Pick<FilaReciboAlumna, 'id' | 'estado'>[]; hoy: string;
  },
): Promise<ContextoCobroAlumna | null> {
  const haceRemesas = !!(p.estudio.sepa_acreedor_id && p.estudio.sepa_iban && p.estudio.sepa_titular);
  const deudas = p.recibos.filter((r) => ESTADOS_DEUDA.includes(r.estado));
  const idsPenalizacion = deudas.map((r) => r.id).filter((id) => id.startsWith('rec-penaliz-'));
  const [mandatoRes, cuotasRes, penalizacionesRes] = deudas.length === 0
    ? [vacio, vacio, vacio]
    : await Promise.all([
      haceRemesas
        ? admin.from('mandatos_sepa').select('socio_id').eq('studio_id', p.studioId).eq('socio_id', p.socioId).eq('estado', 'VIGENTE').limit(1)
        : Promise.resolve(vacio),
      admin.from('suscripciones').select('id, estado, fecha_fin, planes_tarifa(tipo)').eq('studio_id', p.studioId).eq('socio_id', p.socioId),
      idsPenalizacion.length > 0
        ? admin.from('penalizaciones').select('recibo_id, estado').eq('studio_id', p.studioId).in('recibo_id', idsPenalizacion)
        : Promise.resolve(vacio),
    ]);
  if (mandatoRes.error || cuotasRes.error || penalizacionesRes.error) return null;
  return {
    pagableOnline: Boolean(p.estudio.stripe_account_id),
    socio: p.socio,
    domiciliadaEnRemesa: ((mandatoRes.data ?? []) as unknown[]).length > 0,
    cuotas: new Map(((cuotasRes.data ?? []) as Record<string, unknown>[]).map((c) => [c.id as string, {
      estado: (c.estado as string | null) ?? null, fechaFin: (c.fecha_fin as string | null) ?? null, tipoPlan: tipoPlanEmbebido(c.planes_tarifa),
    }])),
    penalizaciones: new Map(((penalizacionesRes.data ?? []) as Record<string, unknown>[])
      .filter((x) => typeof x.recibo_id === 'string').map((x) => [x.recibo_id as string, x.estado as string])),
    hoy: p.hoy,
  };
}

export type CobroDeReciboEnServidor =
  | { ok: true; cobro: CobroDeReciboAlumna | null; socioId: string }
  | { ok: false };

/**
 * Quién cobra UN recibo, leyéndolo todo del servidor (el recibo, la alumna y el estudio). Para las puertas que solo
 * tienen el id: `/api/public/renovar-plan` (antes de reutilizar una renovación) y el aviso del cron. `ok: false` = no se
 * ha podido saber (lectura fallida, o un recibo sin alumna o de otro estudio): quien llama falla cerrado.
 */
export async function cobroDeReciboEnServidor(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; hoy: string },
): Promise<CobroDeReciboEnServidor> {
  const [reciboRes, estudioRes] = await Promise.all([
    admin.from('recibos').select(COLUMNAS_RECIBO_COBRO_ALUMNA).eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle(),
    admin.from('studios').select(COLUMNAS_ESTUDIO_COBRO_ALUMNA).eq('id', p.studioId).maybeSingle(),
  ]);
  if (reciboRes.error || estudioRes.error || !reciboRes.data || !estudioRes.data) return { ok: false };
  const recibo = reciboRes.data as unknown as FilaReciboAlumna & { socio_id: string | null };
  if (!recibo.socio_id) return { ok: false };
  const socioRes = await admin.from('socios').select(COLUMNAS_SOCIO_METODO_COBRO)
    .eq('id', recibo.socio_id).eq('studio_id', p.studioId).maybeSingle();
  if (socioRes.error || !socioRes.data) return { ok: false };
  const ctx = await contextoCobroAlumna(admin, {
    studioId: p.studioId, socioId: recibo.socio_id, estudio: estudioRes.data as EstudioCobroAlumna,
    socio: socioRes.data as SocioMetodoPago, recibos: [recibo], hoy: p.hoy,
  });
  if (!ctx) return { ok: false };
  return { ok: true, cobro: cobroDeReciboAlumna(recibo, ctx), socioId: recibo.socio_id };
}
