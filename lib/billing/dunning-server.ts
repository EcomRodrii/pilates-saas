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
// `studioId` es obligatorio a propósito: `admin` es service-role y bypassa RLS,
// así que sin acotar por tenant un reciboId de otro estudio avanzaría su ciclo de
// dunning (y le mandaría avisos a sus socias). Debe venir de una fuente fiable —
// en el webhook, de la cuenta Connect que firma el evento, no de la metadata.
export async function registrarFalloCobro(params: {
  admin: SupabaseClient;
  reciboId: string;
  studioId: string;
  esSepa: boolean;
  ahoraISO: string;
}): Promise<{ estado: 'PENDIENTE' | 'FALLIDO'; intentos: number } | null> {
  const { admin, reciboId, studioId, esSepa } = params;

  const { data: rec } = await admin
    .from('recibos')
    .select('id, studio_id, socio_id, concepto, importe, fecha_vencimiento, intentos_reintento')
    .eq('id', reciboId)
    .eq('studio_id', studioId)
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
    .eq('id', reciboId)
    .eq('studio_id', studioId);
  if (error) throw new Error(error.message);

  if (plan.esPrimerFallo || plan.esDefinitivo) {
    // Best-effort: un fallo notificando no debe tirar el registro del fallo de cobro.
    try {
      await notificarFalloCobro({ admin, rec, plan });
      // Notification Engine: solo al quedar FALLIDO (requiere acción manual) se
      // avisa a la propietaria + socia in-app/push. El email a la socia (1.er
      // fallo informativo o definitivo) lo sigue enviando notificarFalloCobro.
      if (plan.esDefinitivo) {
        const { emitirPagoFallido } = await import('@/lib/notifications/emit');
        await emitirPagoFallido(admin, { studioId, reciboId });
      }
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
}) {
  const { admin, rec, plan } = params;

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
      studioId: rec.studio_id,
      concepto: rec.concepto,
      importe: rec.importe,
      definitivo: plan.esDefinitivo,
    });
  }

  // El aviso in-app a la dueña al quedar FALLIDO lo emite ahora el Notification
  // Engine (evento pago.fallido, ver registrarFalloCobro) — ya no se escribe a la
  // tabla legacy `notificaciones`.
}
