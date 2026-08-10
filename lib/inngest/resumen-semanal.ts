// ─────────────────────────────────────────────────────────────────────────────
// Resumen semanal del Umbral — email de "semana tranquila".
//
// El Umbral (lib/decision/umbral.ts) decide cada día si hay algo que merezca
// interrumpir a la propietaria. Cuando una semana entera pasa sin que
// encuentre nada así, hoy eso solo se ve si ella abre la app. Este cron lo
// dice activamente: lunes por la mañana, mira la semana que acaba de cerrar
// (lunes–domingo anterior) y, si fue silenciosa, manda un email — activado
// por defecto (opt-out vía decision_feature_flags, flag RESUMEN_SEMANAL).
//
// Mismo patrón dispatcher→fan-out→worker que notif-automations.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest, EVENTS, enviarFanOutEnLotes } from './client.ts';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { dbSemanaFueSilenciosa, dbListFeatureFlagRows, dbIngresosEnRango } from '@/lib/decision/db';
import { enviarEmailResumenSemanal } from '@/lib/emails/resumen-semanal-server';
import { semanaAnterior, semanaPrevia } from './resumen-semanal-fechas.ts';
import { calcularVariacionPct } from '@/lib/informes/ventas-por-tipo';

async function estudiosIds(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin.from('studios').select('id').is('suspendido_en', null);
  return (data ?? []).map((s) => s.id as string);
}

export const resumenSemanalDispatcher = inngest.createFunction(
  { id: 'resumen-semanal-dispatcher', triggers: [{ cron: '15 9 * * 1' }] },
  async ({ step }) => {
    const studios = await step.run('studios', estudiosIds);
    await enviarFanOutEnLotes(step, 'fan-out', EVENTS.RESUMEN_SEMANAL_ESTUDIO, studios, (studioId: string) => ({ studioId }));
    return { studios: studios.length };
  },
);

export const procesarResumenSemanalEstudio = inngest.createFunction(
  { id: 'resumen-semanal-estudio', triggers: [{ event: EVENTS.RESUMEN_SEMANAL_ESTUDIO }], concurrency: { limit: 5 }, retries: 2 },
  async ({ event, step }) => {
    const { studioId } = event.data as { studioId: string };
    return step.run('procesar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      const flags = await dbListFeatureFlagRows(studioId);
      const desactivado = flags.some(f => f.flag === 'RESUMEN_SEMANAL' && f.activo === false);
      if (desactivado) return { skipped: 'opt-out' };

      const { lunes, domingo, rangoTexto } = semanaAnterior(new Date());
      const silenciosa = await dbSemanaFueSilenciosa(studioId, lunes, domingo);
      if (!silenciosa) return { skipped: 'semana con mensaje' };

      // Mismo criterio de resolución de "propietaria" que
      // lib/notifications/recipients.ts (propietaria()): studios.email +
      // studios.nombre — no hay una tabla de "personas propietarias" aparte,
      // el contacto vive en la propia fila del estudio.
      const { data: studio } = await admin.from('studios').select('nombre, email').eq('id', studioId).maybeSingle();
      if (!studio?.email) return { skipped: 'sin email de contacto' };

      // Prueba comparativa: solo se añade al email cuando hay algo
      // genuinamente bueno que contar — mismo criterio de honestidad que el
      // resto del Umbral ("nunca se explica de más"). Un % nulo (sin base,
      // semana previa sin ingresos) o ≤0 se queda fuera del email sin más,
      // no se disfraza de "0%" ni se muestra en negativo.
      const previa = semanaPrevia(lunes);
      const [ingresosActual, ingresosPrevia] = await Promise.all([
        dbIngresosEnRango(studioId, lunes, domingo),
        dbIngresosEnRango(studioId, previa.lunes, previa.domingo),
      ]);
      const variacion = calcularVariacionPct(ingresosActual, ingresosPrevia);
      const crecimientoPct = variacion !== null && variacion > 0 ? variacion : undefined;

      const resultado = await enviarEmailResumenSemanal({
        to: studio.email as string,
        propietariaNombre: (studio.nombre as string | null) ?? 'Propietaria',
        studioId,
        estudioNombre: (studio.nombre as string | null) ?? 'tu estudio',
        rangoTexto,
        crecimientoPct,
      });
      return resultado;
    });
  },
);
