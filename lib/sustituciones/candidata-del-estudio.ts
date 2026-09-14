import type { SupabaseClient } from '@supabase/supabase-js';

// La candidata que se CONFIRMA como sustituta tiene que ser una ficha activa
// de ESTE estudio. `confirmar_sustitucion` escribe `sesiones.instructor_id`
// con lo que le llegue, y el `instructorId` de `PATCH /api/sustituciones`
// viene del cuerpo de la petición: sin esta comprobación, un id de otro
// estudio acababa dando la clase y su nombre llegaba a las alumnas.
//
// Una instructora que trabaja en varias sedes de la misma cadena tiene una
// fila de `instructores` por sede (P2-14), así que se la confirma con SU
// fila de esta sede, nunca con la de otra. Mismo criterio que ya aplica
// `contactarCandidata` antes de escribirle.
export async function candidataDelEstudio(
  admin: SupabaseClient,
  instructorId: string,
  studioId: string,
): Promise<{ id: string; nombre: string | null } | null> {
  const { data, error } = await admin
    .from('instructores').select('id, nombre, activo')
    .eq('id', instructorId).eq('studio_id', studioId).maybeSingle();
  if (error || !data) return null;
  const fila = data as { id: string; nombre: string | null; activo: boolean | null };
  // `activo` NULL cuenta como activa: es el `coalesce(activo, true)` del resto
  // del repo (`current_instructor_id`, `current_rol`).
  if (fila.activo === false) return null;
  return { id: fila.id, nombre: fila.nombre };
}
