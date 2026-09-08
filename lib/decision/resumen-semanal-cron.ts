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
import { emailDeLaPropietaria } from '@/lib/notifications/recipients';

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
      // `enviarEmailResumenSemanal` NUNCA lanza: devuelve {ok:false, error} en
      // sus tres caminos de fallo. Sin esta rama, una caída de Resend un lunes
      // daba el MISMO {estudios:9, enviados:0, fallidos:0} + Sentry limpio que
      // «ninguna semana fue silenciosa» — indistinguible. Y como la fila de
      // dedup se reclama ANTES de enviar (a propósito, para no duplicar), ese
      // estudio no recibe el resumen de esa semana nunca: si se pierde, al
      // menos tiene que verse.
      else if ('ok' in resultado && !resultado.ok) {
        fallidos++;
        Sentry.captureMessage('[resumen-semanal] el email no salió', {
          level: 'warning', tags: { area: 'decision-os' },
          extra: { studioId, error: 'error' in resultado ? resultado.error : null },
        });
      }
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
  // lib/notifications/recipients.ts (`emailDeLaPropietaria`): el email PÚBLICO
  // del estudio si lo hay y, si no, el de su CUENTA. Antes se quedaba en
  // `studios.email` a secas y, como ese campo está vacío en la mayoría de los
  // estudios de producción, el resumen semanal no llegaba a casi ninguno —
  // y ni siquiera contaba como fallo, salía por `skipped`.
  const { data: studio } = await admin.from('studios')
    .select('nombre, email, owner_auth_user_id').eq('id', studioId).maybeSingle();
  if (!studio) return { skipped: 'estudio no encontrado' };
  const email = studio.owner_auth_user_id
    ? await emailDeLaPropietaria(admin, studio.owner_auth_user_id as string, studio.email)
    : ((studio.email as string | null) ?? null);
  if (!email) return { skipped: 'sin email de contacto' };

  // Compare-and-set: reclama la fila ANTES de enviar, no después. A
  // diferencia del resto del Notification Engine, este email no pasa por
  // `publish()` (va directo a Resend), así que no tenía ningún `dedup_key` —
  // dos invocaciones la misma semana mandarían el email dos veces de
  // verdad. Si el INSERT choca (23505), ya se envió: no reenviar.
  const { error: dedupError } = await admin
    .from('resumen_semanal_envios')
    .insert({ studio_id: studioId, semana_lunes: lunes });
  if (dedupError) {
    if (dedupError.code === '23505') return { skipped: 'ya enviado esta semana' };
    throw new Error(dedupError.message);
  }

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
    to: email,
    propietariaNombre: (studio.nombre as string | null) ?? 'Propietaria',
    studioId,
    estudioNombre: (studio.nombre as string | null) ?? 'tu estudio',
    rangoTexto,
    crecimientoPct,
  });
}
