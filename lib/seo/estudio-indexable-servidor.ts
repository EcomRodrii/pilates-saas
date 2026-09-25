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

/**
 * Clases futuras y reservas recientes de UN estudio, contadas en la base de
 * datos (`head: true`): nunca se traen filas. `null` si alguna lectura falla.
 */
async function contarActividad(admin: SupabaseClient, studioId: string): Promise<{ clases: number; reservas: number } | null> {
  const [clases, reservas] = await Promise.all([
    admin.from('sesiones').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).gt('inicio', new Date().toISOString())
      .or('cancelada.is.null,cancelada.eq.false'),
    admin.from('reservas').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).gte('creado_en', desdeActividad()),
  ]);
  if (clases.error || reservas.error) return null;
  return { clases: clases.count ?? 0, reservas: reservas.count ?? 0 };
}

/** Para una sola página. Cacheada por petición: la comparten metadata y layout. */
export const estudioIndexable = cache(async (studioId: string): Promise<boolean> => {
  // En la suite E2E el estudio es sembrado (lib/studio-seo.ts) y no hay base de
  // datos detrás: se declara indexable salvo que el test pida lo contrario.
  if (process.env.E2E_TEST === '1') return process.env.E2E_NO_INDEXABLE !== '1';
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  try {
    const [estudio, actividad] = await Promise.all([
      admin.from('studios')
        .select('pagina_publica_oculta, suspendido_en, subscription_status, es_demo')
        .eq('id', studioId).maybeSingle(),
      contarActividad(admin, studioId),
    ]);
    if (estudio.error || !estudio.data || !actividad) return false;
    return paginaEstudioIndexable({
      oculta: estudio.data.pagina_publica_oculta === true,
      suspendido: estudio.data.suspendido_en != null,
      esDemo: estudio.data.es_demo === true,
      estadoSuscripcion: (estudio.data.subscription_status as string | null) ?? null,
      clasesFuturas: actividad.clases,
      reservasRecientes: actividad.reservas,
    });
  } catch {
    return false;
  }
});

/**
 * Los slugs de todos los estudios indexables, para el sitemap.
 *
 * ⚠️ Se cuenta POR ESTUDIO, no trayendo filas. La primera versión pedía todas
 * las clases futuras de todos los estudios y contaba en memoria: Supabase
 * devuelve como mucho 1.000 filas por consulta, así que con ~1.900 clases
 * futuras en total los estudios que caían al final del orden «no tenían
 * clases» y el sitemap salía sin ninguno (medido en producción el 25-sep-2026).
 * Primero se filtra con lo que dice la propia fila del estudio, y solo a los
 * candidatos se les cuenta la actividad. Si una lectura falla, ese estudio no
 * entra (mejor un sitemap sin un estudio que uno con demos).
 */
export async function slugsEstudiosIndexables(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from('studios')
    .select('id, slug, pagina_publica_oculta, suspendido_en, subscription_status, es_demo')
    .not('slug', 'is', null);
  if (error || !data) return [];
  // Candidatos: todo menos la actividad. Con actividad «infinita» la regla solo
  // mira la fila, así que no se duplica ningún criterio aquí.
  const candidatos = data.filter((e) => paginaEstudioIndexable({
    oculta: e.pagina_publica_oculta === true,
    suspendido: e.suspendido_en != null,
    esDemo: e.es_demo === true,
    estadoSuscripcion: (e.subscription_status as string | null) ?? null,
    clasesFuturas: Number.POSITIVE_INFINITY,
    reservasRecientes: Number.POSITIVE_INFINITY,
  }));
  const slugs = await Promise.all(candidatos.map(async (e) => {
    const actividad = await contarActividad(admin, e.id as string);
    if (!actividad) return null;
    return actividad.clases > 0 && actividad.reservas > 0 ? (e.slug as string) : null;
  }));
  return slugs.filter((s): s is string => s !== null);
}

export type { SenalesEstudio };
