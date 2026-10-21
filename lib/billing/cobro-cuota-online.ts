// ─────────────────────────────────────────────────────────────────────────────
// El cobro del primer mes de una cuota comprada ONLINE (checkout hospedado y
// checkout embebido). El MISMO motor que el panel (`prorrateoDeAlta`), con las
// mismas reglas y los mismos importes, sin configuración aparte por canal: una
// alumna que compra desde la web tiene las condiciones de una dada de alta a mano
// (salvo el aplazamiento a «el día 1», que online no se puede: ver `prorrateo.ts`).
//
// El servidor RECALCULA siempre y es el único que decide el importe: el cobro
// (PaymentIntent o sesión) se crea con ESE importe y la pantalla enseña lo que el
// servidor devuelve (`total` y `cuotaFrase`) antes de que la alumna confirme el pago.
//
// Solo con el ajuste del estudio ACTIVO, en la compra de una cuota mensual de un
// mes SIN clase concreta (el «pagar y reservar» conserva su precio de siempre) y
// SIN recibo (pagar un recibo que ya se debe nunca se prorratea). Si la lectura del
// ajuste falla (p. ej. la migración aún no está aplicada) se cae a lo de siempre:
// jamás se bloquea una compra por esto.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { hoyEnEstudio } from '../utils.ts';
import { normalizarDiasMinimos, periodoDeCuotaAnterior, prorrateoDeAlta, type ProrrateoAlta } from './prorrateo.ts';

export type CobroCuotaOnline =
  | { tipo: 'normal' }
  | { tipo: 'prorrateo'; pr: ProrrateoAlta; importe: number }
  | { tipo: 'rechazo'; status: 409; codigo: string; error: string };

export interface EntradaCobroCuotaOnline {
  studioId: string;
  planId: string;
  plan: { tipo: string; precio: number; periodicidad_meses?: number | null };
  socioId: string | null;
  /** «Pagar y reservar» una clase concreta: no se prorratea. */
  conSesion: boolean;
  /** Pagar un recibo que ya se debe: no se prorratea. */
  conRecibo: boolean;
  hoyISO?: string;
}

export async function cobroCuotaOnline(admin: SupabaseClient, e: EntradaCobroCuotaOnline): Promise<CobroCuotaOnline> {
  if (e.conSesion || e.conRecibo) return { tipo: 'normal' };
  const hoy = e.hoyISO ?? hoyEnEstudio();

  const { data: ajuste, error: errAjuste } = await admin.from('studios')
    .select('cobro_proporcional_alta_activo, cobro_proporcional_dias_minimos').eq('id', e.studioId).maybeSingle();
  if (errAjuste || ajuste?.cobro_proporcional_alta_activo !== true) return { tipo: 'normal' };

  const pr = prorrateoDeAlta(
    { tipo: e.plan.tipo as 'MENSUAL', precio: Number(e.plan.precio), periodicidadMeses: e.plan.periodicidad_meses ?? undefined },
    hoy, normalizarDiasMinimos(ajuste.cobro_proporcional_dias_minimos), 'online',
  );
  if (!pr) return { tipo: 'normal' };

  // El mismo periodo no se cobra dos veces: una cuota CANCELADA suya cuyo ciclo llega a hoy y que se cobró
  // (o se debe) ya cubre estos días. La alumna lo arregla con el estudio, no pagando otra vez.
  // Solo con la clienta ya identificada por su sesión y para ESE mismo plan: buscar por el email de una
  // invitada revelaría a cualquiera si un email tiene cuota, y bloquear otro plan no evita ningún doble cobro.
  const socios = e.socioId ? [e.socioId] : [];
  if (socios.length > 0) {
    const { data: subs } = await admin.from('suscripciones')
      .select('id, socio_id, plan_id, estado, fecha_fin').eq('studio_id', e.studioId).in('socio_id', socios).eq('estado', 'CANCELADA').eq('plan_id', e.planId).gte('fecha_fin', hoy);
    const ids = (subs ?? []).map(s => s.id as string);
    if (ids.length > 0) {
      const [{ data: recs }, { data: planes }] = await Promise.all([
        admin.from('recibos').select('suscripcion_id, estado').eq('studio_id', e.studioId).in('suscripcion_id', ids),
        admin.from('planes_tarifa').select('id, tipo, periodicidad_meses').eq('studio_id', e.studioId)
          .in('id', [...new Set((subs ?? []).map(s => s.plan_id as string).filter(Boolean))]),
      ]);
      const previa = periodoDeCuotaAnterior({
        socioId: socios[0],
        suscripciones: (subs ?? []).map(s => ({
          id: s.id as string, socioId: s.socio_id as string | null, planId: s.plan_id as string | null, estado: s.estado as string, fechaFin: s.fecha_fin as string | null,
        })),
        recibos: (recs ?? []).map(r => ({ suscripcionId: r.suscripcion_id as string, estado: r.estado as string })),
        planes: (planes ?? []).map(p => ({ id: p.id as string, tipo: p.tipo as string, periodicidadMeses: p.periodicidad_meses as number | null })),
        hoyISO: hoy,
      });
      if (previa) {
        return {
          tipo: 'rechazo', status: 409, codigo: 'periodo_ya_cobrado',
          error: 'Ya tienes una cuota de este mes pagada o pendiente de cobro. Habla con tu estudio para retomarla sin pagar dos veces.',
        };
      }
    }
  }

  return { tipo: 'prorrateo', pr, importe: pr.importe };
}
