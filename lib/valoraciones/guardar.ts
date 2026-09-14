import type { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { puedeCambiarValoracion } from '@/lib/valoraciones/agregado';

// La escritura de una valoración, compartida por las DOS puertas: el deep link
// del email (`/api/public/valorar`, token firmado) y la app de la alumna
// (`/api/public/valorar-clase`, JWT). Una sola forma de insertar y de resolver
// el «ya había valorado»: si mañana cambia la tabla, cambia aquí.

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type ResultadoGuardar =
  | { ok: true; actualizada: boolean }
  | { ok: false; status: 404 | 409 | 500; error: string; detalle?: unknown };

export async function guardarValoracion(admin: Admin, p: {
  studioId: string; sesionId: string; socioId: string; puntuacion: number; comentario: string | null;
}): Promise<ResultadoGuardar> {
  // La clase debe existir y ser de este estudio. La instructora valorada es quien
  // REALMENTE la dio (sesiones.instructor_id — puede ser una sustituta).
  const { data: ses } = await admin
    .from('sesiones').select('instructor_id, studio_id')
    .eq('id', p.sesionId).eq('studio_id', p.studioId).maybeSingle();
  if (!ses) return { ok: false, status: 404, error: 'Clase no encontrada' };
  if (!ses.instructor_id) return { ok: false, status: 409, error: 'Esta clase no tiene instructora asignada' };

  const { error } = await admin.from('valoraciones').insert({
    id: `val-${uid()}`,
    studio_id: p.studioId,
    instructor_id: ses.instructor_id,
    sesion_id: p.sesionId,
    socio_id: p.socioId,
    puntuacion: p.puntuacion,
    comentario: p.comentario,
  });
  if (!error) return { ok: true, actualizada: false };

  // Ya había valorado esta clase (índice único socio+sesión) → actualiza su
  // nota: reenviar el link o cambiar de opinión no duplica.
  if (error.code === '23505') {
    // Solo dentro del mismo mes (`puedeCambiarValoracion`): con el mes cerrado, la
    // valoración puede estar ya en la nota publicada y cambiarla dejaría ver el
    // cambio de una sola alumna. Tampoco se reescribe la instructora: el voto
    // se queda en el bloque en el que entró.
    const { data: previa, error: errPrevia } = await admin.from('valoraciones')
      .select('creado_en').eq('socio_id', p.socioId).eq('sesion_id', p.sesionId).maybeSingle();
    if (errPrevia) return { ok: false, status: 500, error: 'No se ha podido guardar tu valoración. Inténtalo de nuevo en unos segundos.', detalle: errPrevia };
    if (!previa || !puedeCambiarValoracion(previa.creado_en as string, new Date())) {
      return { ok: false, status: 409, error: 'Ya valoraste esta clase y ese mes está cerrado: no se puede cambiar.' };
    }
    const { error: errUpd } = await admin.from('valoraciones')
      .update({ puntuacion: p.puntuacion, comentario: p.comentario })
      .eq('socio_id', p.socioId).eq('sesion_id', p.sesionId);
    if (errUpd) return { ok: false, status: 500, error: 'No se ha podido guardar tu valoración. Inténtalo de nuevo en unos segundos.', detalle: errUpd };
    return { ok: true, actualizada: true };
  }
  return { ok: false, status: 500, error: 'No se ha podido guardar tu valoración. Inténtalo de nuevo en unos segundos.', detalle: error };
}
