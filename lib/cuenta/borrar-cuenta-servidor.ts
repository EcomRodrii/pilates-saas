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
//   3. Desvincular sus fichas (`socios.auth_user_id = null`). La FK ya lo haría
//      al borrar (SET NULL), pero va explícito para no depender de esa regla: si
//      algún día cambiara a NO ACTION, el borrado fallaría en vez de llevarse nada.
//      Si el paso 4 falla, la cuenta queda viva y sin fichas, y reintentar termina.
//   4. Borrar la cuenta de Auth (con reintentos; «ya no existe» cuenta como hecho).
//   5. Confirmar con Auth que ya no está.
//
// ⚠️ Lo que se lleva la cascada al borrar la cuenta (FK ON DELETE CASCADE hacia
// auth.users): sus dispositivos de confianza y segundos pasos, su `sesion_activa`,
// sus favoritos de Network de alumna y sus filas de `conversacion_participantes`.
// Esta última es del estudio: la conversación y los mensajes se quedan
// (`mensajes.remitente_auth_user_id` es SET NULL), pero sin la fila de la alumna.

export type ResultadoBorrarCuenta =
  | { ok: true }
  | { ok: false; motivo: MotivoNoBorrable | 'no_verificable'; vinculos?: string[] }
  | { ok: false; motivo: 'fallo'; paso: 'avisos' | 'fichas' | 'cuenta' | 'confirmar'; error: string };

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
