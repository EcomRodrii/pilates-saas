// ─────────────────────────────────────────────────────────────────────────────
// Review Boost: dejar constancia en el estudio de que YA respondió.
//
// ⚠️ Sin esto el modal salía en cada carga del panel. Al cerrarlo sin responder
// queda `review_boost_pospuesto_en`; a los 14 días reaparece (`debeReaparecer`),
// la propietaria responde… y nada borraba ese pospuesto: responder solo marcaba
// `mostrado_en`, que ya estaba puesto. `debeMostrarModal` seguía en verdadero y
// el modal volvía con cada recarga — y cada 5★ repetida daba 409 (ya había
// feedback) y tampoco escribía nada. Visto en producción el 14-sep: feedback 5★
// a las 10:15 y el modal otra vez dos minutos después.
//
// Lo escribe el SERVIDOR al guardar el feedback (o al ver que ya estaba), con
// service-role: no depende de que una escritura del navegador pase la RLS.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';

export async function marcarReviewBoostRespondido(
  db: SupabaseClient, studioId: string, ahora: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Sin pospuesto no hay reaparición posible (`debeReaparecer`).
  const { error: errPospuesto } = await db.from('studios')
    .update({ review_boost_pospuesto_en: null })
    .eq('id', studioId);
  if (errPospuesto) return { ok: false, error: errPospuesto.message };

  // `mostrado_en` solo si faltaba: es la fecha de la PRIMERA vez, y /interno la enseña.
  const { error: errMostrado } = await db.from('studios')
    .update({ review_boost_mostrado_en: ahora.toISOString() })
    .eq('id', studioId)
    .is('review_boost_mostrado_en', null);
  if (errMostrado) return { ok: false, error: errMostrado.message };

  return { ok: true };
}
