// ─────────────────────────────────────────────────────────────────────────────
// La venta de una clase suelta en el mostrador (ver lib/reservas/clase-suelta.ts):
// la suscripción PUNTUAL de una sesión que gasta la reserva, y su recibo
// PENDIENTE, los dos con el id de la reserva. La reserva la consume dentro del
// candado de `reservar_plaza` (D-1), y el cobro sigue por su dueño de siempre
// (`marcar-cobrado` → `confirmarCobro`): aquí no se cobra nada.
//
// Va por el servidor (service-role) y no por `entregarPlanComprado`, que es el
// dueño de la compra por Stripe (ids de `cs_`/`pi_`, recibo que nace cobrado).
// La forma de la suscripción sí es la misma que la del TPV
// (`filaSuscripcionDeLinea`).
//
// Sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { filaSuscripcionDeLinea } from '../pos/suscripcion-de-linea.ts';
import { decidirReciboPrevioDeCita, idReciboDeClaseSuelta } from '../cobros/recibo-de-cita.ts';
import { idSuscripcionDeClaseSuelta } from '../reservas/clase-suelta.ts';

const YA_EXISTIA = '23505';

export interface PlanDeClaseSuelta {
  id: string;
  tipo: string;
  sesiones: number | null;
  validezDias: number | null;
  periodicidadMeses: number | null;
}

export type ResultadoVentaSuelta =
  | { ok: true; suscripcionId: string; reciboId: string }
  | { ok: false; status: 409 | 500; error: string };

/**
 * Deja vendida la clase suelta de esta reserva: la suscripción (1 sesión) y su
 * recibo pendiente. Idempotente: un reintento de la MISMA reserva encuentra las
 * dos filas y sigue con ellas, siempre que sean de la misma clienta y el mismo
 * importe (si no, se manda a revisar: nunca se cobra un recibo que ya no
 * cuadra).
 */
export async function prepararVentaClaseSuelta(admin: SupabaseClient, p: {
  studioId: string;
  socioId: string;
  reservaId: string;
  plan: PlanDeClaseSuelta;
  importe: number;
  concepto: string;
  /** Hoy en el estudio (YYYY-MM-DD). */
  hoy: string;
}): Promise<ResultadoVentaSuelta> {
  const suscripcionId = idSuscripcionDeClaseSuelta(p.reservaId);
  const reciboId = idReciboDeClaseSuelta(p.reservaId);
  if (!suscripcionId || !reciboId) return { ok: false, status: 500, error: 'No se ha podido preparar la clase suelta de esta reserva.' };

  const fila = filaSuscripcionDeLinea(
    { id: p.plan.id, tipo: p.plan.tipo, sesiones: p.plan.sesiones, validez_dias: p.plan.validezDias, periodicidad_meses: p.plan.periodicidadMeses },
    { suscripcionId, studioId: p.studioId, socioId: p.socioId, hoy: p.hoy },
  );
  const { error: errSus } = await admin.from('suscripciones').insert(fila);
  if (errSus) {
    if (errSus.code !== YA_EXISTIA) return { ok: false, status: 500, error: 'No se ha podido apuntar la clase suelta. Inténtalo otra vez.' };
    // Reintento: tiene que ser la clase suelta de ESTA clienta.
    const { data: previa } = await admin.from('suscripciones').select('socio_id, plan_id')
      .eq('id', suscripcionId).eq('studio_id', p.studioId).maybeSingle();
    if (!previa || previa.socio_id !== p.socioId) {
      return { ok: false, status: 409, error: 'Esta reserva ya tiene otra clase suelta apuntada. Revísala en la ficha de la clienta.' };
    }
  }

  const { error: errRec } = await admin.from('recibos').insert({
    id: reciboId,
    studio_id: p.studioId,
    socio_id: p.socioId,
    suscripcion_id: suscripcionId,
    concepto: p.concepto,
    importe: p.importe,
    estado: 'PENDIENTE',
    fecha_vencimiento: p.hoy,
    es_renovacion: false,
  });
  if (errRec) {
    if (errRec.code !== YA_EXISTIA) {
      // Sin recibo, la clase suelta sería una clase gratis que nadie ve: fuera.
      await anularVentaClaseSuelta(admin, { studioId: p.studioId, suscripcionId, reciboId, ahoraISO: new Date().toISOString() });
      return { ok: false, status: 500, error: 'No se ha podido apuntar la clase suelta. Inténtalo otra vez.' };
    }
    const { data: previo } = await admin.from('recibos')
      .select('estado, importe, socio_id, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en')
      .eq('id', reciboId).eq('studio_id', p.studioId).maybeSingle();
    const decision = previo
      ? decidirReciboPrevioDeCita({
        estado: previo.estado as string, importe: Number(previo.importe), socioId: (previo.socio_id as string | null) ?? null,
        importeDevuelto: (previo.importe_devuelto as number | null) ?? null,
        reembolsoStripeId: (previo.reembolso_stripe_id as string | null) ?? null,
        reembolsoSolicitadoEn: (previo.reembolso_solicitado_en as string | null) ?? null,
      }, { socioId: p.socioId, importe: p.importe }, 'clase')
      : { tipo: 'revisar' as const, error: 'No se ha podido comprobar el recibo de esta clase. Revísalo en «Quién me debe».' };
    if (decision.tipo === 'revisar') return { ok: false, status: 409, error: decision.error };
  }
  return { ok: true, suscripcionId, reciboId };
}

/**
 * Deshace una venta que no llegó a ser: la plaza no salió (lista de espera, ya
 * apuntada, error), o la reserva gastó otro bono. Dos compare-and-set, en este
 * orden:
 *  1. la suscripción, solo si sigue ACTIVA y con su sesión sin gastar;
 *  2. el recibo, solo si el 1 la tocó y el recibo sigue pendiente y sin cobrar.
 * Si la sesión ya se gastó (otra pestaña, una carrera), no se toca nada: esa
 * venta sí sirvió y su recibo se queda.
 */
export async function anularVentaClaseSuelta(admin: SupabaseClient, p: {
  studioId: string; suscripcionId: string; reciboId: string; ahoraISO: string;
}): Promise<{ anulada: boolean }> {
  const { data: sus, error: errSus } = await admin.from('suscripciones')
    .update({ estado: 'CANCELADA', sesiones_restantes: 0 })
    .eq('id', p.suscripcionId).eq('studio_id', p.studioId)
    .eq('estado', 'ACTIVA').eq('sesiones_restantes', 1)
    .select('id');
  if (errSus || !sus || sus.length === 0) return { anulada: false };
  await admin.from('recibos')
    .update({ estado: 'ANULADO', anulado_en: p.ahoraISO, proximo_reintento: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId)
    .eq('estado', 'PENDIENTE').is('fecha_cobro', null);
  return { anulada: true };
}
