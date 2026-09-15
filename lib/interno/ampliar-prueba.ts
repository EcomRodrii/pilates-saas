// ─────────────────────────────────────────────────────────────────────────────
// Ampliar la prueba gratuita local de un estudio desde /interno.
//
// Vive aquí y no dentro de la ruta para poder probar lo que DE VERDAD se manda a
// PostgREST (ver el test, que usa el cliente real de supabase-js): el
// compare-and-set compara `trial_ends_at` con el texto que devolvió la lectura.
// Si esa comparación no casara nunca, el botón diría «ha cambiado mientras
// tanto» siempre y no ampliaría nada, sin que el e2e (que mockea la API) lo viera.
//
// La REGLA —a quién sí, a quién no, desde cuándo— es `ampliacionDePrueba`, la
// misma que usa la pantalla. El permiso y la auditoría, en la ruta.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { ampliacionDePrueba } from '../billing/trial.ts';
import {
  mismaAncla, purgaEstudiosActiva, siguientePaso, type FaseCiclo, type FaseRegistrada,
} from '../retencion/ciclo-estudios-vencidos.ts';

export type ResultadoAmpliacion =
  | { ok: true; nombre: string; trialAntes: string | null; estadoAntes: string; hasta: string }
  | { ok: false; status: 404 | 409 | 500; error: string };

export async function ampliarPruebaEstudio(
  db: SupabaseClient,
  studioId: string,
  opciones: { ahora?: Date; purgaActiva?: boolean } = {},
): Promise<ResultadoAmpliacion> {
  const ahora = opciones.ahora ?? new Date();
  const purgaActiva = opciones.purgaActiva ?? purgaEstudiosActiva(process.env);

  const { data: e, error: errLeer } = await db.from('studios')
    .select('id, slug, nombre, cadena_id, trial_ends_at, subscription_status, subscription_id')
    .eq('id', studioId).maybeSingle();
  if (errLeer) return { ok: false, status: 500, error: 'No se ha podido leer el estudio.' };
  if (!e) return { ok: false, status: 404, error: 'Estudio no encontrado' };

  const trialAntes = (e.trial_ends_at as string | null) ?? null;
  const estadoAntes = (e.subscription_status as string | null) ?? null;
  const ampliacion = ampliacionDePrueba({
    trialEndsAt: trialAntes, subscriptionStatus: estadoAntes,
    subscriptionId: (e.subscription_id as string | null) ?? null, esSede: Boolean(e.cadena_id),
  }, undefined, ahora);
  if (!ampliacion.ok) return { ok: false, status: 409, error: ampliacion.motivo };
  // Solo el ESTADO es obligatorio. `trialAntes` puede ser NULL a propósito desde
  // #2036: un estudio en 'trial_expirado' SIN fecha de fin es el estado roto que
  // esa PR vino a reparar, y `ampliacionDePrueba` ya lo acepta usando `ahora` como
  // base. Este `if` seguía exigiendo la fecha y devolvía 409 justo en ese caso, así
  // que #2036 arreglaba la regla pura y el botón seguía fallando igual.
  if (!estadoAntes) return { ok: false, status: 409, error: 'No está en prueba gratuita.' };

  // ── ¿Siguen ahí sus datos? ────────────────────────────────────────────────
  // «Volver a entrar» a un estudio con los datos borrados (o a medio borrar) no
  // es darle unos días: es otro problema, y se habla antes. Falla CERRADO: sin
  // poder comprobarlo, no se amplía.
  const { data: filasCiclo, error: errCiclo } = await db.from('ciclo_estudios_vencidos')
    .select('fase, trial_ends_at, ejecutada_en, cancelada_en')
    .eq('studio_id', studioId);
  if (errCiclo) return { ok: false, status: 500, error: 'No se ha podido comprobar si sus datos siguen ahí.' };
  const filas = (filasCiclo ?? []) as Array<{
    fase: FaseCiclo; trial_ends_at: string; ejecutada_en: string | null; cancelada_en: string | null;
  }>;

  // 1) Una purga apuntada como hecha, de cualquier ciclo: ya no están.
  if (filas.some(f => f.fase === 'purga' && f.ejecutada_en && !f.cancelada_en)) {
    return { ok: false, status: 409, error: 'Sus datos ya se borraron por prueba vencida: ampliar no los devuelve.' };
  }
  // 2) Con el borrado real encendido y su fecha ya llegada, la fila de arriba NO
  //    basta: el cron borra ficheros y copias ANTES de apuntarla
  //    (avanzar-ciclo-estudios-vencidos.ts), así que puede estar borrando ahora
  //    mismo o haber fallado a medias sin dejar rastro. Se decide con la misma
  //    máquina de fases que usa el cron, no con una copia de sus plazos.
  if (purgaActiva) {
    const registradas: FaseRegistrada[] = filas
      .filter(f => mismaAncla(f.trial_ends_at, trialAntes))
      .map(f => ({ fase: f.fase, ejecutadaEn: f.ejecutada_en, canceladaEn: f.cancelada_en }));
    const paso = siguientePaso({ trialEndsAt: trialAntes, subscriptionStatus: estadoAntes, subscriptionId: null }, registradas, ahora);
    if (paso.tipo === 'ejecutar' && paso.fase === 'purga') {
      return {
        ok: false, status: 409,
        error: 'Ha llegado su fecha de borrado de datos: ampliar ahora podría dejarle el estudio a medio borrar.',
      };
    }
  }

  const hasta = ampliacion.hasta.toISOString();
  // `current_period_end` va con la prueba, como en `arrancar_prueba_gratuita`.
  // 'trialing' saca al estudio del ciclo de vencidos (su cron cancela los avisos
  // vivos), y los avisos de la prueba nueva salen con su fecha (dedupKey por
  // `trialEndsAt`).
  //
  // Compare-and-set sobre lo leído: dos clics a la vez, el cron cerrando la
  // prueba o el webhook de Stripe escribiendo entre la lectura y aquí → 0 filas
  // → 409, en vez de sumar dos veces o pisar lo que otro escribió. La ida y
  // vuelta del texto de `trial_ends_at` es exacta, microsegundos incluidos
  // (comprobado en producción el 14-sep).
  //
  // ⚠️ `trial_ends_at` NULL necesita `.is()`, no `.eq()`: PostgREST traduce
  // `.eq('trial_ends_at', null)` a `trial_ends_at=eq.null`, y en SQL `x = NULL`
  // nunca es cierto — el CAS no casaría NUNCA la fila y el 409 saltaría siempre,
  // justo en el estado roto que esto viene a reparar. Mismo motivo por el que
  // `subscription_id` ya se comparaba con `.is()` arriba.
  const base = db.from('studios')
    .update({ trial_ends_at: hasta, current_period_end: hasta, subscription_status: 'trialing' })
    .eq('id', studioId)
    .is('subscription_id', null)
    .eq('subscription_status', estadoAntes);
  const { data: escritas, error: errEscribir } = await (
    trialAntes === null ? base.is('trial_ends_at', null) : base.eq('trial_ends_at', trialAntes)
  )
    // Sin `select`, PostgREST no devuelve filas y el 409 saltaría SIEMPRE.
    .select('id');
  if (errEscribir) return { ok: false, status: 500, error: 'No se ha podido ampliar la prueba.' };
  if (!escritas || escritas.length === 0) {
    return { ok: false, status: 409, error: 'El estudio ha cambiado mientras tanto. Recarga y vuelve a intentarlo.' };
  }
  return { ok: true, nombre: (e.nombre as string | null) ?? (e.slug as string), trialAntes, estadoAntes, hasta };
}
