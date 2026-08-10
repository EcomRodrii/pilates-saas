// ─────────────────────────────────────────────────────────────────────────────
// La lista de estudios que alimenta cada fan-out. Paginada, siempre.
//
// Por qué existe. Todos los dispatchers leían la lista con un `select` global
// sin paginar, y PostgREST corta a 1.000 filas EN SILENCIO. Pasado el estudio
// 1.001, los que caen fuera del corte **dejan de existir para el sistema**: sin
// backups, sin recordatorios, sin renovaciones, sin dunning, sin análisis del
// Decision OS. Y sin ningún error que lo señale.
//
// Es el mismo truncado que ya costó los backups (#684) y que se acaba de cerrar
// en los crons de query global, pero sobre la tabla que crece con CLIENTES en
// vez de con uso — así que el umbral no hay que estimarlo, es exacto: 1.000
// estudios. Con 10 hoy sobra margen; el peligro real es que se olvide, porque
// entonces aparecería de golpe y afectando solo a los clientes más nuevos.
//
// Solo cubre la forma repetida (`select('id')` + filtro de suspendidos). Los
// dispatchers que necesitan más columnas o filtros propios usan `fetchAllRows`
// directamente: meterlos aquí obligaría a este helper a crecer en opciones
// hasta dejar de ser uno.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/supabase-data';

export async function idsEstudios(
  admin: SupabaseClient,
  opts: { incluirSuspendidos?: boolean } = {},
): Promise<{ id: string }[]> {
  const { data, error } = await fetchAllRows<{ id: string }>(
    '(global)', 'studios',
    (from, to) => {
      const q = admin.from('studios').select('id');
      return (opts.incluirSuspendidos ? q : q.is('suspendido_en', null)).range(from, to);
    },
  );
  if (error) throw new Error(error.message);
  return data;
}
