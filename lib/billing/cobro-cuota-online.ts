// ─────────────────────────────────────────────────────────────────────────────
// El cobro del primer mes de una cuota comprada ONLINE (checkout hospedado y
// checkout embebido). El MISMO motor que el panel (`prorrateoDeAlta`), con las
// mismas reglas y los mismos importes, sin configuración aparte por canal: una
// alumna que compra desde la web tiene las condiciones de una dada de alta a mano
// (salvo el aplazamiento a «el día 1», que online no se puede: ver `prorrateo.ts`).
//
// El servidor RECALCULA siempre: el navegador solo manda lo que vio
// (`cuotaEsperadaCentimos`) y, si no coincide con lo que sale ahora, se contesta
// 409 `importe_cambiado` con la frase nueva antes de cobrar nada.
//
// Solo con el ajuste del estudio ACTIVO, en la compra de una cuota mensual de un
// mes SIN clase concreta (el «pagar y reservar» conserva su precio de siempre) y
// SIN recibo (pagar un recibo que ya se debe nunca se prorratea). Si la lectura del
// ajuste falla (p. ej. la migración aún no está aplicada) se cae a lo de siempre:
// jamás se bloquea una compra por esto.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { escaparLike } from '../escapar-like.ts';
import { hoyEnEstudio } from '../utils.ts';
import { aCentimos, normalizarDiasMinimos, periodoDeCuotaAnterior, prorrateoDeAlta, type ProrrateoAlta } from './prorrateo.ts';

export type CobroCuotaOnline =
  | { tipo: 'normal' }
  | { tipo: 'prorrateo'; pr: ProrrateoAlta; importe: number }
  | { tipo: 'rechazo'; status: 409; codigo: string; error: string }
  | { tipo: 'importe_cambiado'; status: 409; codigo: 'importe_cambiado'; error: string; cobro: { importe: number; frase: string } };

export interface EntradaCobroCuotaOnline {
  studioId: string;
  plan: { tipo: string; precio: number; periodicidad_meses?: number | null };
  socioId: string | null;
  email: string | null;
  /** «Pagar y reservar» una clase concreta: no se prorratea. */
  conSesion: boolean;
  /** Pagar un recibo que ya se debe: no se prorratea. */
  conRecibo: boolean;
  /** Lo que la persona vio, en céntimos (antes de cualquier código de descuento). */
  cuotaEsperadaCentimos?: number | null;
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
  const socios = e.socioId ? [e.socioId] : await sociosPorEmail(admin, e.studioId, e.email);
  if (socios.length > 0) {
    const { data: subs } = await admin.from('suscripciones')
      .select('id, socio_id, plan_id, estado, fecha_fin').eq('studio_id', e.studioId).in('socio_id', socios).eq('estado', 'CANCELADA').gte('fecha_fin', hoy);
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
          id: s.id as string, socioId: socios[0], planId: s.plan_id as string | null, estado: s.estado as string, fechaFin: s.fecha_fin as string | null,
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

  // Lo que la persona vio tiene que ser lo que se cobra (pasada la medianoche, o tocado el ajuste, cambia).
  if (typeof e.cuotaEsperadaCentimos === 'number' && e.cuotaEsperadaCentimos !== aCentimos(pr.importe)) {
    return {
      tipo: 'importe_cambiado', status: 409, codigo: 'importe_cambiado',
      error: 'El importe de tu primera cuota ha cambiado. Revísalo antes de pagar.',
      cobro: { importe: pr.importe, frase: pr.frase },
    };
  }
  return { tipo: 'prorrateo', pr, importe: pr.importe };
}

async function sociosPorEmail(admin: SupabaseClient, studioId: string, email: string | null): Promise<string[]> {
  if (!email) return [];
  const { data } = await admin.from('socios').select('id').eq('studio_id', studioId).ilike('email', escaparLike(email)).is('borrado_en', null).limit(5);
  return (data ?? []).map(r => r.id as string);
}
