import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { planificarTrasFallo, type PlanReintento } from '@/lib/billing/dunning';
import { enviarEmailImpago } from '@/lib/emails/impago-server';

// Registra un intento de cobro FALLIDO de un recibo y avanza su ciclo de dunning:
// cuenta el intento, reprograma el siguiente reintento (+3 / +7 días) o marca el
// recibo FALLIDO tras el tercero, y notifica — a la socia solo en el 1.er fallo y
// en el fallo definitivo, al estudio (in-app) solo en el fallo definitivo.
//
// Lo usan el webhook de Stripe (devolución de un adeudo SEPA) y el barrido diario
// de dunning (rechazo síncrono de tarjeta), para que ambos métodos sigan el mismo
// flujo. La actualización del recibo es la parte crítica (lanza si falla); los
// avisos son best-effort (no rompen el flujo de cobro).
export async function registrarFalloCobro(params: {
  admin: SupabaseClient;
  reciboId: string;
  esSepa: boolean;
  ahoraISO: string;
}): Promise<{ estado: 'PENDIENTE' | 'FALLIDO'; intentos: number } | null> {
  const { admin, reciboId, esSepa, ahoraISO } = params;

  const { data: rec } = await admin
    .from('recibos')
    .select('id, studio_id, socio_id, concepto, importe, fecha_vencimiento, intentos_reintento')
    .eq('id', reciboId)
    .maybeSingle();
  if (!rec) return null;

  const plan = planificarTrasFallo(rec.intentos_reintento ?? 0, rec.fecha_vencimiento);

  const { error } = await admin
    .from('recibos')
    .update({
      estado: plan.estado,
      intentos_reintento: plan.intentos,
      proximo_reintento: plan.proximoReintento,
      ...(esSepa ? { sepa_estado: 'failed' } : {}),
    })
    .eq('id', reciboId);
  if (error) throw new Error(error.message);

  if (plan.esPrimerFallo || plan.esDefinitivo) {
    // Best-effort: un fallo notificando no debe tirar el registro del fallo de cobro.
    try {
      await notificarFalloCobro({ admin, rec, plan, ahoraISO });
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('Fallo al notificar impago'), {
        level: 'warning', tags: { area: 'cobros', tipo: 'dunning' }, extra: { reciboId },
      });
    }
  }

  return { estado: plan.estado, intentos: plan.intentos };
}

async function notificarFalloCobro(params: {
  admin: SupabaseClient;
  rec: { id: string; studio_id: string; socio_id: string | null; concepto: string; importe: number };
  plan: PlanReintento;
  ahoraISO: string;
}) {
  const { admin, rec, plan, ahoraISO } = params;

  const socio = rec.socio_id
    ? (await admin.from('socios').select('nombre, email').eq('id', rec.socio_id).maybeSingle()).data as { nombre: string | null; email: string | null } | null
    : null;
  const estudio = (await admin.from('studios').select('nombre').eq('id', rec.studio_id).maybeSingle()).data as { nombre: string | null } | null;
  const estudioNombre = estudio?.nombre ?? undefined;

  // Email a la socia (1.er fallo informativo o fallo definitivo).
  if (socio?.email) {
    await enviarEmailImpago({
      to: socio.email,
      toName: socio.nombre ?? 'socia',
      estudioNombre,
      concepto: rec.concepto,
      importe: rec.importe,
      definitivo: plan.esDefinitivo,
    });
  }

  // Aviso al ESTUDIO (in-app) SOLO cuando el recibo queda FALLIDO: requiere acción
  // manual. Id determinista por recibo → idempotente (un recibo solo cae a FALLIDO
  // una vez); ignora conflicto para no romper en reintentos del webhook.
  if (plan.esDefinitivo) {
    const nombreSocia = socio?.nombre ?? 'Una socia';
    const { error: notiErr } = await admin
      .from('notificaciones')
      .upsert(
        {
          id: `noti-impago-${rec.id}`,
          studio_id: rec.studio_id,
          titulo: 'Pago fallido — acción requerida',
          texto: `No se pudo cobrar «${rec.concepto}» de ${nombreSocia} (${rec.importe.toFixed(2)} €) tras 3 reintentos. Contáctala o gestiona el cobro a mano.`,
          leida: false,
          tipo: 'AVISO',
          enlace: '/cobros?tab=pendientes',
          creada_en: ahoraISO,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    if (notiErr) console.error('[dunning] no se pudo crear la notificación de impago', rec.id, notiErr);
  }
}
