import type { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverDestinatariasCampana } from '@/lib/marketing/segmentos';
import type { Socio, Suscripcion, Recibo, DestinatariosCampana } from '@/lib/types';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * ¿Esta socia está dentro de la audiencia de este post del tablón?
 *
 * FUENTE ÚNICA. Nació dentro de `posts/[id]/asistentes/route.ts` como arreglo
 * de F-24 (auditoría 20ª pasada): el RSVP no comprobaba
 * `posts_comunidad.audiencia`, así que una socia fuera del segmento —el evento
 * es «solo VIP», o «solo con bono»— podía apuntarse con un POST directo, sin
 * pasar nunca por la pantalla que filtra.
 *
 * Vive aquí, y no copiada en cada ruta, porque #1673 abrió dos puertas nuevas
 * al MISMO post (comentarios y like) y ninguna heredó el guard: el filtro se
 * aplicaba al LISTADO (`GET /api/public/comunidad/posts`) pero se saltaba en
 * cuanto se pedía por `postId`, y los ids son adivinables (en producción
 * conviven `post-1`, `post-2`… con los `post-<uid()>`). Replicar el `if` por
 * tercera vez es justo lo que hace que la familia no se cierre.
 *
 * Reutiliza `resolverDestinatariasCampana` —la MISMA función que decide el
 * fan-out de notificación al crear el post— sobre los datos de esta única
 * socia, en vez de un criterio de segmento paralelo que pudiera divergir del
 * real.
 */
export async function socioEnLaAudiencia(
  admin: Admin,
  p: { studioId: string; socioId: string; audiencia: DestinatariosCampana },
): Promise<boolean> {
  if (p.audiencia === 'TODAS') return true;
  const [{ data: socioRaw }, { data: susRaw }, { data: recRaw }] = await Promise.all([
    admin.from('socios').select('id, activo, tags, fecha_nacimiento').eq('id', p.socioId).eq('studio_id', p.studioId).maybeSingle(),
    admin.from('suscripciones').select('socio_id, estado, sesiones_restantes, fecha_fin').eq('socio_id', p.socioId).eq('studio_id', p.studioId).eq('estado', 'ACTIVA'),
    admin.from('recibos').select('socio_id, estado').eq('socio_id', p.socioId).eq('studio_id', p.studioId).eq('estado', 'FALLIDO'),
  ]);
  if (!socioRaw) return false;
  const socios = [{
    id: socioRaw.id, activo: socioRaw.activo, tags: socioRaw.tags ?? undefined, fechaNacimiento: socioRaw.fecha_nacimiento ?? undefined,
  }] as unknown as Socio[];
  const suscripciones = ((susRaw ?? []).map(r => ({
    socioId: r.socio_id, estado: r.estado, sesionesRestantes: r.sesiones_restantes, fechaFin: r.fecha_fin,
  }))) as unknown as Suscripcion[];
  const recibos = ((recRaw ?? []).map(r => ({ socioId: r.socio_id, estado: r.estado }))) as unknown as Recibo[];
  return resolverDestinatariasCampana(p.audiencia, { socios, suscripciones, recibos }).some(s => s.id === p.socioId);
}

/**
 * Lee la audiencia de un post del estudio. `null` = el post no existe aquí.
 *
 * Devuelve 'TODAS' cuando la columna está a null: es el default de la tabla y
 * el valor con el que nacieron los posts anteriores a la segmentación.
 */
export async function audienciaDelPost(
  admin: Admin,
  p: { postId: string; studioId: string },
): Promise<DestinatariosCampana | null> {
  const { data } = await admin
    .from('posts_comunidad')
    .select('audiencia')
    .eq('id', p.postId)
    .eq('studio_id', p.studioId)
    .maybeSingle();
  if (!data) return null;
  return ((data.audiencia as DestinatariosCampana | null) ?? 'TODAS');
}
