import type { SupabaseClient } from '@supabase/supabase-js';
import { emitirAbrimosManana } from '../notifications/emit.ts';
import { planesDeEtapa } from './apertura-suave.ts';

export { tocaAvisarAbrimos } from './comunicaciones.ts';

/** Envía el aviso a cada socia con cuota ACTIVA de un plan de etapa. Devuelve a cuántas. */
export async function avisarAbrimos(admin: SupabaseClient, studioId: string): Promise<number> {
  const planes = await planesDeEtapa(admin, studioId);
  if (planes.size === 0) return 0;
  const [susR, studioR] = await Promise.all([
    admin.from('suscripciones').select('socio_id')
      .eq('studio_id', studioId).eq('estado', 'ACTIVA').in('plan_id', [...planes]).limit(5000),
    admin.from('studios').select('slug, nombre').eq('id', studioId).maybeSingle(),
  ]);
  if (susR.error) throw susR.error;
  if (studioR.error) throw studioR.error;
  const socias = [...new Set((susR.data ?? []).map(s => s.socio_id as string))];
  const slug = (studioR.data?.slug as string | null) ?? '';
  const estudio = (studioR.data?.nombre as string | null) ?? 'Tu estudio';
  // publish() deduplica por socia (opening-abrimos:{studio}:{socia}): repetir
  // el barrido no manda dos veces.
  for (const socioId of socias) await emitirAbrimosManana({ studioId, socioId, slug, estudio });
  return socias.length;
}
