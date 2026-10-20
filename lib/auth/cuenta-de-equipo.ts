// ¿Esta cuenta es del EQUIPO de algún estudio, o de Tentare?
//
// Un solo dueño para la pregunta: lo usan quitar la verificación en dos pasos
// desde la ficha de una alumna (lib/auth/quitar-doble-factor.ts) y el puente de
// acceso del widget sin marco (app/api/auth/cuenta-de-equipo), que no entrega a
// la web de un estudio la sesión de una cuenta de equipo (decisión del
// fundador, 16-oct-2026). Cuenta TODO sitio donde la cuenta es algo más que
// alumna: ficha de equipo en cualquier estudio (instructora, recepción,
// gerencia), propietaria de un estudio o de una cadena, o del equipo de
// Tentare. Fila en la tabla, activa o no: «ya no» puede volver a ser «sí».
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const DONDE_ES_EQUIPO: ReadonlyArray<readonly [tabla: string, columna: string]> = [
  ['instructores', 'auth_user_id'],
  ['studios', 'owner_auth_user_id'],
  ['cadenas', 'owner_auth_user_id'],
  ['plataforma_admin', 'auth_user_id'],
];

/** Lanza si alguna lectura falla: quien pregunta decide cómo fallar (cerrado). */
export async function esCuentaDeEquipo(admin: SupabaseClient, authUserId: string): Promise<boolean> {
  const cuentas = await Promise.all(DONDE_ES_EQUIPO.map(([tabla, columna]) =>
    admin.from(tabla).select(columna, { count: 'exact', head: true }).eq(columna, authUserId)));
  const fallo = cuentas.find((r) => r.error);
  if (fallo?.error) throw fallo.error;
  return cuentas.some((r) => (r.count ?? 0) > 0);
}
