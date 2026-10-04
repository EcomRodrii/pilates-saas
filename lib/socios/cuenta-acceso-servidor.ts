import type { SupabaseClient } from '@supabase/supabase-js';
import { VINCULOS_CUENTA, decidirBorradoCuenta, type RecuentoVinculos } from './borrado-cuenta.ts';
import { conReintentos, cuentaYaNoExiste, type TerceroPendiente } from './terceros-supresion.ts';

// Borrar la cuenta de acceso (auth.users) de una persona SUPRIMIDA — una socia
// (app/api/socios/eliminar) o alguien del equipo (app/api/equipo/eliminar) — SOLO si
// no le queda ningún otro vínculo. La decisión es de `decidirBorradoCuenta`
// (fail-closed: un recuento que no se pudo hacer no da vía libre).
//
// Se llama DESPUÉS de la función SQL de la supresión, que ya ha desenlazado esta
// ficha: por eso cualquier fila restante con la cuenta es OTRA ficha (otra sede,
// otro estudio, otro rol).
//
// Con otros vínculos la cuenta se conserva a propósito: no es un pendiente. Un fallo de
// verdad (Supabase Auth caído, un recuento que no llegó) SÍ lo es: se devuelve para que
// quien llama lo guarde y se reintente.

/**
 * Cuántas filas de cada `VINCULOS_CUENTA` apuntan a la cuenta; `null` donde no se
 * pudo contar (la decisión lo trata como no comprobado). Lo comparten la supresión
 * y «Borrar mi cuenta» de la alumna (lib/cuenta/borrar-cuenta-servidor.ts).
 */
export async function contarVinculosCuenta(admin: SupabaseClient, authUserId: string): Promise<RecuentoVinculos> {
  const recuento: RecuentoVinculos = {};
  await Promise.all(VINCULOS_CUENTA.map(async v => {
    const { count, error } = await admin
      .from(v.tabla).select(v.columna, { count: 'exact', head: true }).eq(v.columna, authUserId);
    recuento[v.clave] = error ? null : (count ?? null);
  }));
  return recuento;
}

export async function borrarCuentaSiQuedaSuelta(
  admin: SupabaseClient,
  authUserId: string,
  /** Solo para el log: qué ruta lo pide. */
  origen = 'socios/eliminar',
): Promise<{ pendiente: TerceroPendiente | null; conservada: boolean }> {
  const pendiente = (motivo: string): TerceroPendiente => ({
    tercero: 'cuenta_acceso', ref: authUserId, motivo, en: new Date().toISOString(),
  });

  const recuento = await contarVinculosCuenta(admin, authUserId);
  const decision = decidirBorradoCuenta(recuento);
  if (!decision.borrar) {
    // Con otros vínculos la cuenta se conserva a propósito: no es un pendiente.
    if (decision.motivo === 'tiene_vinculos') return { pendiente: null, conservada: true };
    return { pendiente: pendiente(`No se pudieron comprobar sus otros vínculos (${decision.sinComprobar.join(', ')})`), conservada: false };
  }

  const r = await conReintentos(async () => {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error && !cuentaYaNoExiste(error)) throw error;
  });
  if (!r.ok) {
    console.error(`[${origen}] no se pudo borrar la cuenta de acceso`, r.error);
    return { pendiente: pendiente(`Cuenta: ${r.error}`), conservada: false };
  }
  return { pendiente: null, conservada: false };
}
