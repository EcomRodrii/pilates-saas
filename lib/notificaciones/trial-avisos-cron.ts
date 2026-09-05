// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — prueba gratuita a punto de acabar / ya bloqueada.
//
// Auditoría 23ª pasada (hallazgo pendiente): `cerrar_pruebas_vencidas` (pg_cron,
// migr 20260819110611) pasa `subscription_status` a 'trial_expirado' cada 15
// min, pero es un UPDATE SQL puro — nunca avisó a nadie, ni antes ni después.
// La dueña entraba un lunes y se encontraba el panel bloqueado sin ningún
// aviso previo.
//
// Mismo patrón que bonos-inactivas-cron.ts (piloto 2026-08-11): bucket A de
// pg_cron, un `for` sin fan-out de Inngest — pocos estudios en prueba a la vez,
// sin llamadas externas pesadas por estudio.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { estadoTrial } from '@/lib/billing/trial';
import { emitirTrialProximoAExpirar, emitirTrialExpirado } from '@/lib/notifications/emit';

interface FilaTrial {
  id: string;
  trial_ends_at: string;
  subscription_status: string | null;
  subscription_id: string | null;
}

export async function barrerTrialAvisos(): Promise<{ estudios: number; avisos: number; bloqueos: number } | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };

  // Solo pruebas LOCALES (subscription_id null — una de Stripe la cierra
  // Stripe, no este barrido) que siguen en 'trialing' o que el otro cron ya
  // cerró a 'trial_expirado'. Sin filtrar por fecha aquí: estadoTrial() ya
  // deriva la fase real, y así un tick que se retrase no deja huecos.
  const { data, error } = await fetchAllRows<FilaTrial>(
    '(global)', 'studios',
    (from, to) => admin.from('studios')
      .select('id, trial_ends_at, subscription_status, subscription_id')
      .is('subscription_id', null)
      .not('trial_ends_at', 'is', null)
      .in('subscription_status', ['trialing', 'trial_expirado'])
      .range(from, to),
  );
  if (error) throw new Error(`leyendo estudios en prueba: ${error.message}`);

  let avisos = 0, bloqueos = 0;
  for (const s of data) {
    const estado = estadoTrial({
      trialEndsAt: s.trial_ends_at,
      subscriptionStatus: s.subscription_status,
      subscriptionId: s.subscription_id,
    });
    if (estado.fase === 'AVISO' || estado.fase === 'ULTIMO_DIA') {
      await emitirTrialProximoAExpirar(admin, { studioId: s.id, dias: estado.diasRestantes, trialEndsAt: s.trial_ends_at });
      avisos++;
    } else if (estado.fase === 'EXPIRADA') {
      await emitirTrialExpirado(admin, { studioId: s.id, trialEndsAt: s.trial_ends_at });
      bloqueos++;
    }
  }
  return { estudios: data.length, avisos, bloqueos };
}
