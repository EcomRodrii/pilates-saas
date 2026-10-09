// Herramientas de Comunidad: los eventos que la propietaria tiene publicados.
// Solo cuenta lo que aún no ha pasado. Nada de personas: de cada evento, cuántas
// alumnas se han apuntado, nunca quiénes.

import { diaLargo } from './definiciones.ts';
import { campo } from '../recorte.ts';
import { horaEstudio, hoyEnEstudio } from '@/lib/utils';
import type { ContextoHerramienta, ResultadoHerramienta } from '../tipos.ts';
import { exigir, sinVacios } from './comun.ts';

interface FilaEvento {
  id: string; texto: string | null; evento_fecha: string | null; evento_aforo: number | null; evento_lugar: string | null;
  /** El embebido de PostgREST: `[{ count: n }]` (la FK es post_evento_asistentes.post_id → posts_comunidad.id). */
  post_evento_asistentes: { count: number }[] | null;
}

export async function eventosProximos(_input: Record<string, never>, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  // Una sola consulta, acotada al estudio: los inscritos vienen contados por el embebido,
  // así no hay una segunda lectura de una tabla sin `studio_id`.
  const r = await ctx.admin.from('posts_comunidad')
    .select('id, texto, evento_fecha, evento_aforo, evento_lugar, post_evento_asistentes(count)')
    .eq('studio_id', ctx.studioId).eq('tipo', 'EVENTO')
    .gte('evento_fecha', ctx.ahora.toISOString())
    .order('evento_fecha', { ascending: true }).limit(10);
  const eventos = exigir(r.error ? null : ((r.data ?? []) as unknown as FilaEvento[]), 'eventos');
  const filas = eventos.map(e => {
    const fecha = e.evento_fecha ? new Date(e.evento_fecha) : null;
    return sinVacios({
      evento: campo(e.texto) || 'Evento',
      dia: fecha ? diaLargo(hoyEnEstudio(fecha)) : null,
      hora: fecha ? horaEstudio(fecha) : null,
      lugar: campo(e.evento_lugar),
      aforo: e.evento_aforo ?? null,
      alumnasApuntadas: e.post_evento_asistentes?.[0]?.count ?? 0,
    }, ['alumnasApuntadas']);
  });
  return {
    paraModelo: { eventosPorVenir: filas.length, eventos: filas },
    bloques: [],
  };
}
