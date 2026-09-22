// Cambiar de sede: un solo camino para los tres sitios que lo ofrecen (selector
// de la barra, menú de perfil, Configuración → Estudio).
//
// Antes solo el selector de la barra avisaba a las demás pestañas. Si se cambiaba
// desde Configuración, una pestaña que siguiera abierta enseñaba la sede anterior
// mientras el servidor (`current_studio_id()`, que lee `sesion_activa`) ya pensaba
// en la otra: todo lo que se guardaba ahí lo rechazaba la RLS con «tu usuario no
// puede cambiar los datos de este estudio» (visto en producción, 22-sep-2026).
//
// Puro y con dependencias inyectadas para poder probarlo con node --test.

export const CLAVE_CAMBIO_SEDE = 'tentare:sede-cambiada';
export const CLAVE_CAMBIO_GLOBAL = 'tentare:sede-cambio-global';

export interface EntornoCambio {
  guardar: (authUserId: string, studioId: string) => Promise<boolean>;
  sesion: Pick<Storage, 'setItem'> | null;
  local: Pick<Storage, 'setItem'> | null;
  ir: (url: string) => void;
  ahora?: () => number;
}

/** Guarda la sede, avisa a las otras pestañas y recarga el panel en ella. `false` si no se pudo guardar. */
export async function cambiarDeSede(
  entorno: EntornoCambio, authUserId: string, studioId: string, nombreDestino: string,
): Promise<boolean> {
  if (!(await entorno.guardar(authUserId, studioId))) return false;
  try { entorno.sesion?.setItem(CLAVE_CAMBIO_SEDE, nombreDestino); } catch { /* modo privado */ }
  try { entorno.local?.setItem(CLAVE_CAMBIO_GLOBAL, `${studioId}:${(entorno.ahora ?? Date.now)()}`); } catch { /* modo privado */ }
  entorno.ir('/dashboard');
  return true;
}

/**
 * ¿Hay que recargar porque la sede que enseña esta pestaña ya no es la activa?
 * Solo con una respuesta clara del servidor: un fallo o «sin sede» no recargan
 * (recargar en bucle sin red sería peor que el problema).
 */
export function sedeDesfasada(enPantalla: string | null | undefined, delServidor: string | null): boolean {
  return !!enPantalla && !!delServidor && enPantalla !== delServidor;
}
