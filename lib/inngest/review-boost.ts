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
import { isEligibleForReviewBoost, REVIEW_BOOST_DIAS_DE_USO_MIN, type SenalesReviewBoost } from '@/lib/growth/review-boost';
import { enviarAhora } from '@/lib/analytics';
import { barrerEstudiosSinClases } from './embudo-alta';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Hasta qué edad del estudio se sigue evaluando. */
const VENTANA_DIAS = 120;
const MS_DIA = 86_400_000;

async function evaluarUno(admin: SupabaseClient, studio: { id: string; creado_en: string }) {
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
    diasDeUso: Math.floor((Date.now() - new Date(studio.creado_en).getTime()) / MS_DIA),
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
    const evaluados = await step.run('evaluar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      // Estudios de entre 14 y 120 días de vida que aún no han sido elegibles ni se les ha enseñado. La cota de arriba
      // evita re-evaluar cada día a los que ya no van a serlo (los que no hayan tenido uso real en cuatro meses).
      // `gratis_cerrado` fuera: sin acceso al panel, el modal no se vería.
      const ahora = Date.now();
      const { data: studios } = await admin
        .from('studios')
        .select('id, creado_en')
        .lte('creado_en', new Date(ahora - REVIEW_BOOST_DIAS_DE_USO_MIN * MS_DIA).toISOString())
        .gte('creado_en', new Date(ahora - VENTANA_DIAS * MS_DIA).toISOString())
        .not('subscription_status', 'eq', 'gratis_cerrado')
        .is('review_boost_elegible_en', null)
        .is('review_boost_mostrado_en', null)
        .limit(500);

      if (!studios?.length) return { evaluados: 0 };
      for (const studio of studios) {
        await evaluarUno(admin, studio as never);
      }
      return { evaluados: studios.length };
    });

    // Fase 3 del onboarding (embudo de alta), con su propio try/catch — mismo
    // patrón que app/api/cron/notif-trial. Un fallo aquí no tumba `evaluar`.
    // El aviso a CUENTAS sin estudio salió de aquí (1-oct-2026): ahora es el
    // cron de pg_cron `altas-sin-terminar`, con el paso exacto de cada alta.
    const embudoEstudios = await step.run('embudo-estudios-sin-clases', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      try {
        return await barrerEstudiosSinClases(admin);
      } catch (e) {
        console.error('[embudo-alta] estudios sin clases:', e instanceof Error ? e.message : e);
        return { error: true };
      }
    });

    return { evaluados, embudoEstudios };
  },
);
