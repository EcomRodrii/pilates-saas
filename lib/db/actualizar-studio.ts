import type { SupabaseClient } from '@supabase/supabase-js';

// UPDATE de la fila del estudio desde el panel, con la sesión de quien lo usa.
//
// La RLS de `studios` (`owner_studios`, FOR ALL: PROPIETARIO e
// `id = current_studio_id()`) no da error cuando no casa: PostgREST contesta 200
// con CERO filas. Mirando solo `error`, el panel decía «Guardado» sin haber
// guardado nada. Por eso se piden las filas de vuelta y se cuentan — lo mismo
// que ya hacía dbUpdateHorarioEstudio con `studio_horario`.
//
// Vive fuera de lib/supabase-data.ts para poder probarlo con node --test (ese
// fichero usa el alias `@/` y el cliente de navegador).

export const ERROR_STUDIO_SIN_FILAS =
  'No se ha guardado: tu usuario no puede cambiar los datos de este estudio.';

export type ResultadoFilaStudio = { ok: true } | { ok: false; error: unknown };

export async function actualizarFilaStudio(
  db: SupabaseClient,
  studioId: string,
  columnas: Record<string, unknown>,
): Promise<ResultadoFilaStudio> {
  // Un PATCH vacío tampoco devuelve filas. Sin este corte, los campos que el
  // mapeo no escribe (los «desconectar» de Integraciones) contarían como fallo.
  if (Object.keys(columnas).length === 0) return { ok: true };
  const { data, error } = await db.from('studios').update(columnas).eq('id', studioId).select('id');
  if (error) return { ok: false, error };
  // `{ message }` a secas, sin `status` ni `code`: con un 403 dentro,
  // mensajeDeFalloAlGuardar lo cambiaría por «vuelve a entrar», que aquí no
  // arregla nada.
  if (!data?.length) return { ok: false, error: { message: ERROR_STUDIO_SIN_FILAS } };
  return { ok: true };
}
