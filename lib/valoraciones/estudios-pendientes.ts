import type { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { idsEstudios } from '@/lib/inngest/estudios';
import { limitesDeBarrido } from '@/lib/valoraciones/momento';

// Qué estudios tienen una clase que ya toca pedir valorar. La comparten la ruta
// que dispara pg_cron cada 10 min (`/api/cron/valoraciones`) y el barrido de
// Inngest cada 12 h, que queda de red de seguridad: lo que uno pida, el otro lo
// encuentra ya marcado (`sesiones.valoracion_pedida_en`, compare-and-set).
//
// ⚠️ Mismas condiciones que la consulta del worker (lib/inngest/valoraciones.ts) y
// que el predicado del cron de la base de datos (migración 20261121094512): solo
// estudios con alguna clase terminada hace más de 20 min y menos de 48 h, sin
// pedir. Un estudio sin ninguna no gasta un run.

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export async function estudiosConValoracionesPendientes(admin: Admin, ahoraISO: string): Promise<{ id: string }[]> {
  const { desdeISO, hastaISO } = limitesDeBarrido(Date.parse(ahoraISO));
  // `suspendido_en`: un estudio suspendido no debe seguir pidiendo valoraciones a
  // sus socias en su nombre.
  const activos = await idsEstudios(admin);
  const { data: clases, error } = await fetchAllRows<{ studio_id: string }>(
    '(global)', 'sesiones',
    (from, to) => admin.from('sesiones').select('studio_id')
      .eq('cancelada', false)
      .not('instructor_id', 'is', null)
      .is('valoracion_pedida_en', null)
      .lt('fin', hastaISO)
      .gt('fin', desdeISO)
      // Orden estable: paginar sin ORDER BY puede saltarse filas pasadas las 1.000.
      .order('id')
      .range(from, to),
  );
  if (error) throw new Error(error.message);
  const conClases = new Set(clases.map(c => c.studio_id));
  return activos.filter(s => conClases.has(s.id));
}
