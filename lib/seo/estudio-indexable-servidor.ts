import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { DIAS_ACTIVIDAD_INDEXABLE, paginaEstudioIndexable, type SenalesEstudio } from '@/lib/seo/estudio-indexable';

// Las señales de lib/seo/estudio-indexable.ts, leídas de la base de datos.
// Dos usos, un criterio: el `robots` de /reservar/<slug> (un estudio) y el
// sitemap (todos a la vez, sin una consulta por estudio).
//
// ⚠️ Ante un fallo de lectura se responde «no indexable». Es la opción segura:
// un estudio real que se quede un rastreo sin indexar vuelve en el siguiente;
// una demo o una prueba abandonada indexadas por error se quedan en el índice.

const desdeActividad = () => new Date(Date.now() - DIAS_ACTIVIDAD_INDEXABLE * 864e5).toISOString();

/** Para una sola página. Cacheada por petición: la comparten metadata y layout. */
export const estudioIndexable = cache(async (studioId: string): Promise<boolean> => {
  // En la suite E2E el estudio es sembrado (lib/studio-seo.ts) y no hay base de
  // datos detrás: se declara indexable salvo que el test pida lo contrario.
  if (process.env.E2E_TEST === '1') return process.env.E2E_NO_INDEXABLE !== '1';
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  try {
    const ahora = new Date().toISOString();
    const [estudio, clases, reservas] = await Promise.all([
      admin.from('studios')
        .select('pagina_publica_oculta, suspendido_en, subscription_status, es_demo')
        .eq('id', studioId).maybeSingle(),
      admin.from('sesiones').select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId).gt('inicio', ahora)
        .or('cancelada.is.null,cancelada.eq.false'),
      admin.from('reservas').select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId).gte('creado_en', desdeActividad()),
    ]);
    if (estudio.error || clases.error || reservas.error || !estudio.data) return false;
    return paginaEstudioIndexable({
      oculta: estudio.data.pagina_publica_oculta === true,
      suspendido: estudio.data.suspendido_en != null,
      esDemo: estudio.data.es_demo === true,
      estadoSuscripcion: (estudio.data.subscription_status as string | null) ?? null,
      clasesFuturas: clases.count ?? 0,
      reservasRecientes: reservas.count ?? 0,
    });
  } catch {
    return false;
  }
});

/**
 * Los slugs de todos los estudios indexables, para el sitemap. Tres consultas
 * para todos, no tres por estudio. Si alguna falla, ninguno: mejor un sitemap
 * sin páginas de estudio que uno con demos.
 */
export async function slugsEstudiosIndexables(admin: SupabaseClient): Promise<string[]> {
  const ahora = new Date().toISOString();
  const [estudios, clases, reservas] = await Promise.all([
    admin.from('studios')
      .select('id, slug, pagina_publica_oculta, suspendido_en, subscription_status, es_demo')
      .not('slug', 'is', null),
    // Sin `distinct` (PostgREST no lo expone): se deduplica aquí. Límite alto y
    // orden explícito: un truncado silencioso dejaría estudios fuera sin avisar.
    admin.from('sesiones').select('studio_id')
      .gt('inicio', ahora).or('cancelada.is.null,cancelada.eq.false')
      .order('studio_id').limit(20000),
    admin.from('reservas').select('studio_id')
      .gte('creado_en', desdeActividad())
      .order('studio_id').limit(20000),
  ]);
  if (estudios.error || clases.error || reservas.error) return [];
  const contar = (filas: { studio_id: unknown }[] | null) => {
    const m = new Map<string, number>();
    for (const f of filas ?? []) m.set(f.studio_id as string, (m.get(f.studio_id as string) ?? 0) + 1);
    return m;
  };
  const clasesPor = contar(clases.data);
  const reservasPor = contar(reservas.data);
  return (estudios.data ?? [])
    .filter((e) => paginaEstudioIndexable({
      oculta: e.pagina_publica_oculta === true,
      suspendido: e.suspendido_en != null,
      esDemo: e.es_demo === true,
      estadoSuscripcion: (e.subscription_status as string | null) ?? null,
      clasesFuturas: clasesPor.get(e.id as string) ?? 0,
      reservasRecientes: reservasPor.get(e.id as string) ?? 0,
    }))
    .map((e) => e.slug as string);
}

export type { SenalesEstudio };
