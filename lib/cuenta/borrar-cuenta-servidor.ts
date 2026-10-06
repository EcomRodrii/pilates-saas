import type { SupabaseClient } from '@supabase/supabase-js';
import { contarVinculosCuenta } from '../socios/cuenta-acceso-servidor.ts';
import { conReintentos, cuentaYaNoExiste, mensajeDe } from '../socios/terceros-supresion.ts';
import { decidirAutoborrado, type MotivoNoBorrable } from './borrar-cuenta.ts';

// «Borrar mi cuenta de Tentare», lado servidor (la ruta es
// app/api/public/cuenta/borrar/route.ts; quién puede, en ./borrar-cuenta.ts).
//
// Con service-role y SOLO sobre la cuenta del JWT (quien llama pasa `userId` ya
// verificado). Cada paso comprueba su resultado; nada se da por borrado sin
// confirmarlo con Auth. Reintentar es seguro: los tres pasos de escritura son
// idempotentes (quitar avisos, desvincular, borrar una cuenta que ya no existe).
//
// Orden, y por qué:
//   1. Comprobar los vínculos ANTES de escribir nada: si no se puede borrar,
//      no se toca nada.
//   2. Sus avisos push (`push_subscription.user_id` no tiene FK: sin esto, el
//      dispositivo seguiría registrado a nombre de una cuenta que ya no existe).
//   2b. Sus «me gusta» del tablón (`post_likes.user_id`, tampoco tiene FK: se
//      quedarían contando para siempre a nombre de nadie), y el contador de cada
//      publicación, recontado como lo hace `toggle_like_post`.
//   3. Desvincular sus fichas (`socios.auth_user_id = null`). La FK ya lo haría
//      al borrar (SET NULL), pero va explícito para no depender de esa regla: si
//      algún día cambiara a NO ACTION, el borrado fallaría en vez de llevarse nada.
//      Si el paso 4 falla, la cuenta queda viva y sin fichas, y reintentar termina.
//   4. Borrar la cuenta de Auth (con reintentos; «ya no existe» cuenta como hecho).
//   5. Confirmar con Auth que ya no está.
//
// Lo que se lleva la cascada al borrar la cuenta (FK ON DELETE CASCADE hacia
// auth.users) es solo suyo: dispositivos de confianza y segundos pasos, su
// `sesion_activa` y sus favoritos de Network de alumna. Sus chats con el estudio
// se quedan con su nombre (decisión del fundador, migr 20261004120218): su fila de
// `conversacion_participantes` pasa a `auth_user_id = null` y conserva `socio_id`,
// y sus mensajes, a remitente nulo. Con sus comentarios del tablón, lo mismo: se
// quedan con su nombre corto y su ficha (`socio_id`). Las normas que aceptó se van
// con la cuenta (FK en cascada), y sus bloqueos, que son de su FICHA en cada
// estudio (`socio_companeras`, `conversacion_participantes.bloqueo_en`), siguen
// en pie: borrar la cuenta no debe abrirle la puerta a quien bloqueó.

export type ResultadoBorrarCuenta =
  | { ok: true }
  | { ok: false; motivo: MotivoNoBorrable | 'no_verificable'; vinculos?: string[] }
  | { ok: false; motivo: 'fallo'; paso: 'avisos' | 'meGusta' | 'fichas' | 'cuenta' | 'confirmar'; error: string };

export async function borrarMiCuenta(
  admin: SupabaseClient,
  userId: string,
  opciones: { esperaBaseMs?: number } = {},
): Promise<ResultadoBorrarCuenta> {
  const decision = decidirAutoborrado(await contarVinculosCuenta(admin, userId));
  if (!decision.borrar) {
    return decision.motivo === 'no_verificable'
      ? { ok: false, motivo: 'no_verificable', vinculos: decision.sinComprobar }
      : { ok: false, motivo: decision.motivo, vinculos: decision.vinculos };
  }

  const avisos = await admin.from('push_subscription').delete().eq('user_id', userId);
  if (avisos.error) return { ok: false, motivo: 'fallo', paso: 'avisos', error: mensajeDe(avisos.error) };

  const meGusta = await quitarMeGusta(admin, userId);
  if (meGusta) return { ok: false, motivo: 'fallo', paso: 'meGusta', error: meGusta };

  const fichas = await admin.from('socios').update({ auth_user_id: null }).eq('auth_user_id', userId);
  if (fichas.error) return { ok: false, motivo: 'fallo', paso: 'fichas', error: mensajeDe(fichas.error) };

  const borrado = await conReintentos(async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !cuentaYaNoExiste(error)) throw error;
  }, { esperaBaseMs: opciones.esperaBaseMs });
  if (!borrado.ok) return { ok: false, motivo: 'fallo', paso: 'cuenta', error: borrado.error };

  // «Sin error» no es «borrada»: se pregunta a Auth.
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error && cuentaYaNoExiste(error)) return { ok: true };
    if (error) return { ok: false, motivo: 'fallo', paso: 'confirmar', error: mensajeDe(error) };
    if (data?.user) return { ok: false, motivo: 'fallo', paso: 'confirmar', error: 'la cuenta sigue existiendo' };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: 'fallo', paso: 'confirmar', error: mensajeDe(e) };
  }
}

/** Borra sus «me gusta» y recuenta cada publicación afectada. Devuelve el error, o `null` si fue bien. */
async function quitarMeGusta(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from('post_likes').select('post_id, studio_id').eq('user_id', userId);
  if (error) return mensajeDe(error);
  const borrado = await admin.from('post_likes').delete().eq('user_id', userId);
  if (borrado.error) return mensajeDe(borrado.error);
  for (const l of (data ?? []) as { post_id: string; studio_id: string }[]) {
    const { count, error: e1 } = await admin.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('post_id', l.post_id);
    if (e1) return mensajeDe(e1);
    const { error: e2 } = await admin.from('posts_comunidad').update({ likes: count ?? 0 }).eq('id', l.post_id);
    if (e2) return mensajeDe(e2);
  }
  return null;
}
