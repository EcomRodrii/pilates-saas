// ─────────────────────────────────────────────────────────────────────────────
// Review Boost — evaluación diaria de elegibilidad. Mismo patrón que
// minimo-asistentes.ts/penalizaciones.ts: query global, sin fan-out por
// estudio (no hace falta: solo marca una columna, no cobra ni escala nada).
//
// Cadencia diaria: "trial recién terminado" no es una guardia de seguridad
// (nadie puede "hacer trampa" esperando), así que no necesita más frecuencia.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { isEligibleForReviewBoost, type SenalesReviewBoost } from '@/lib/growth/review-boost';
import { enviarAhora } from '@/lib/analytics';
import type { SupabaseClient } from '@supabase/supabase-js';

const VENTANA_DIAS = 30;
const MS_DIA = 86_400_000;

async function evaluarUno(admin: SupabaseClient, studio: { id: string; trial_ends_at: string; stripe_account_id: string | null }) {
  const desde14dias = new Date(Date.now() - 14 * MS_DIA).toISOString();

  const [sesiones, socios, planes, reservas, tickets, feedback, recompensa] = await Promise.all([
    admin.from('sesiones').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id),
    admin.from('socios').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id),
    admin.from('planes_tarifa').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id),
    admin.from('reservas').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id).eq('estado', 'CONFIRMADA'),
    admin.from('soporte_solicitudes').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id).gte('creado_en', desde14dias),
    admin.from('review_boost_feedback').select('id').eq('studio_id', studio.id).maybeSingle(),
    admin.from('review_boost_recompensas').select('id').eq('studio_id', studio.id).maybeSingle(),
  ]);

  const senales: SenalesReviewBoost = {
    trialEndsAt: studio.trial_ends_at,
    stripeConectado: !!studio.stripe_account_id,
    numSesiones: sesiones.count ?? 0,
    numSocios: socios.count ?? 0,
    numPlanesTarifa: planes.count ?? 0,
    numReservasConfirmadas: reservas.count ?? 0,
    ticketsSoporteRecientes: tickets.count ?? 0,
    yaMostrado: false, // el filtro de la query global ya excluye `review_boost_mostrado_en IS NOT NULL`
    yaDioFeedback: !!feedback.data,
    yaRecompensado: !!recompensa.data,
  };

  if (!isEligibleForReviewBoost(senales)) return;

  await admin.from('studios').update({ review_boost_elegible_en: new Date().toISOString() }).eq('id', studio.id);
  await enviarAhora(studio.id, { nombre: 'review_boost_eligible', props: {} });
}

export const reviewBoostDispatcher = inngest.createFunction(
  { id: 'review-boost-evaluar', triggers: [{ cron: '0 6 * * *' }] },
  async ({ step }) => {
    return step.run('evaluar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      const desdeVentana = new Date(Date.now() - VENTANA_DIAS * MS_DIA).toISOString();
      const { data: studios } = await admin
        .from('studios')
        .select('id, trial_ends_at, stripe_account_id')
        .not('trial_ends_at', 'is', null)
        .lte('trial_ends_at', new Date().toISOString())
        .gte('trial_ends_at', desdeVentana)
        .is('review_boost_elegible_en', null)
        .is('review_boost_mostrado_en', null)
        .limit(500);

      if (!studios?.length) return { evaluados: 0 };
      for (const studio of studios) {
        await evaluarUno(admin, studio as never);
      }
      return { evaluados: studios.length };
    });
  },
);
