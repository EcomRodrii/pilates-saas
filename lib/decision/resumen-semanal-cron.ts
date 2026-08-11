// ─────────────────────────────────────────────────────────────────────────────
// Resumen semanal del Umbral — email de "semana tranquila".
//
// El Umbral (lib/decision/umbral.ts) decide cada día si hay algo que merezca
// interrumpir a la propietaria. Cuando una semana entera pasa sin que
// encuentre nada así, este barrido lo dice activamente: lunes por la
// mañana, mira la semana que acaba de cerrar (lunes-domingo anterior) y, si
// fue silenciosa, manda un email — activado por defecto (opt-out vía
// decision_feature_flags, flag RESUMEN_SEMANAL).
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A).
// El fan-out por estudio se colapsa en un bucle simple.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from '@/lib/inngest/estudios.ts';
import { dbSemanaFueSilenciosa, dbListFeatureFlagRows, dbIngresosEnRango } from '@/lib/decision/db';
import { enviarEmailResumenSemanal } from '@/lib/emails/resumen-semanal-server';
import { semanaAnterior, semanaPrevia } from '@/lib/inngest/resumen-semanal-fechas.ts';
import { calcularVariacionPct } from '@/lib/informes/ventas-por-tipo';
import * as Sentry from '@sentry/nextjs';

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export async function enviarResumenesSemanalesDeTodos(): Promise<{ estudios: number; enviados: number; fallidos: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { estudios: 0, enviados: 0, fallidos: 0 };
  const studios = await idsEstudios(admin);
  let enviados = 0, fallidos = 0;
  for (const { id: studioId } of studios) {
    try {
      const resultado = await procesarEstudio(admin, studioId);
      if ('ok' in resultado && resultado.ok) enviados++;
    } catch (e) {
      fallidos++;
      Sentry.captureException(e instanceof Error ? e : new Error('resumen semanal'), {
        level: 'error', tags: { area: 'decision-os' }, extra: { studioId },
      });
    }
  }
  return { estudios: studios.length, enviados, fallidos };
}

async function procesarEstudio(admin: AdminClient, studioId: string) {
  const flags = await dbListFeatureFlagRows(studioId);
  const desactivado = flags.some(f => f.flag === 'RESUMEN_SEMANAL' && f.activo === false);
  if (desactivado) return { skipped: 'opt-out' };

  const { lunes, domingo, rangoTexto } = semanaAnterior(new Date());
  const silenciosa = await dbSemanaFueSilenciosa(studioId, lunes, domingo);
  if (!silenciosa) return { skipped: 'semana con mensaje' };

  // Mismo criterio de resolución de "propietaria" que
  // lib/notifications/recipients.ts (propietaria()): studios.email +
  // studios.nombre — no hay una tabla de "personas propietarias" aparte.
  const { data: studio } = await admin.from('studios').select('nombre, email').eq('id', studioId).maybeSingle();
  if (!studio?.email) return { skipped: 'sin email de contacto' };

  // Prueba comparativa: solo se añade al email cuando hay algo genuinamente
  // bueno que contar — mismo criterio de honestidad que el resto del Umbral.
  const previa = semanaPrevia(lunes);
  const [ingresosActual, ingresosPrevia] = await Promise.all([
    dbIngresosEnRango(studioId, lunes, domingo),
    dbIngresosEnRango(studioId, previa.lunes, previa.domingo),
  ]);
  const variacion = calcularVariacionPct(ingresosActual, ingresosPrevia);
  const crecimientoPct = variacion !== null && variacion > 0 ? variacion : undefined;

  return enviarEmailResumenSemanal({
    to: studio.email as string,
    propietariaNombre: (studio.nombre as string | null) ?? 'Propietaria',
    studioId,
    estudioNombre: (studio.nombre as string | null) ?? 'tu estudio',
    rangoTexto,
    crecimientoPct,
  });
}
