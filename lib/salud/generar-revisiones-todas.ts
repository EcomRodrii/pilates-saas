// ─────────────────────────────────────────────────────────────────────────────
// Recordatorios de revisión de ficha clínica (FICHA-CLINICA.md §10).
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A).
// El fan-out por estudio se colapsa en un bucle simple — solo notificación
// in-app, sin Resend, idempotente por condición+mes vía el dedupKey del
// Notification Engine.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from '@/lib/inngest/estudios.ts';
import { generarRecordatoriosRevision } from '@/lib/db/supabase-data-admin';
import * as Sentry from '@sentry/nextjs';

export async function generarRevisionesDeTodos(): Promise<{ estudios: number; fallidos: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { estudios: 0, fallidos: 0 };
  const nowISO = new Date().toISOString();
  // `suspendido_en`: un estudio suspendido no necesita revisiones nuevas.
  const studios = await idsEstudios(admin);
  let fallidos = 0;
  for (const { id: studioId } of studios) {
    try {
      await generarRecordatoriosRevision(studioId, nowISO);
    } catch (e) {
      fallidos++;
      Sentry.captureException(e instanceof Error ? e : new Error('revisiones de salud'), {
        level: 'error', tags: { area: 'salud' }, extra: { studioId },
      });
    }
  }
  return { estudios: studios.length, fallidos };
}
