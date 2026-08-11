// ═══════════════════════════════════════════════════════════════════════════
// Capa de datos de la configuración de menú (Fase 4 · menú por cadena)
// ═══════════════════════════════════════════════════════════════════════════
//
// El menú/home se configura POR CADENA, no por sede: una cadena multi-sede tiene
// UN solo menú, consistente en todas sus sedes (antes cada sede tenía su fila en
// studio_layout y el menú cambiaba al cambiar de sede activa, sin explicación).
//
// Alcance = cadena_id de la sede si la tiene, si no la propia sede. El layout de
// una cadena vive en cadenas.layout_config; el de un estudio suelto sigue en
// studio_layout.config (mismo formato). Lecturas service-role + React cache.

import { z } from 'zod';
import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { invalidarCatalogoPublico } from '@/lib/cache/catalogo-estudio';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveLayout,
  layoutConfigSchema,
  layoutDraftSchema,
  bloqueHomeSchema,
  type LayoutConfig,
  type LayoutDraft,
  DEFAULT_LAYOUT,
} from '@/lib/layout-schema';
import type { BloqueHome, PantallaId } from '@/lib/portal-home-bloques';

// Dónde vive el layout de esta sede: en su cadena (compartido con las demás
// sedes) o en la propia sede si no pertenece a ninguna cadena.
type Alcance = { tipo: 'cadena'; id: string } | { tipo: 'estudio'; id: string };

async function alcanceDe(admin: SupabaseClient, studioId: string): Promise<Alcance> {
  const { data } = await admin
    .from('studios')
    .select('cadena_id')
    .eq('id', studioId)
    .maybeSingle();
  return data?.cadena_id
    ? { tipo: 'cadena', id: data.cadena_id }
    : { tipo: 'estudio', id: studioId };
}

async function leerConfig(admin: SupabaseClient, alcance: Alcance): Promise<unknown> {
  if (alcance.tipo === 'cadena') {
    const { data } = await admin
      .from('cadenas')
      .select('layout_config')
      .eq('id', alcance.id)
      .maybeSingle();
    return data?.layout_config ?? null;
  }
  const { data } = await admin
    .from('studio_layout')
    .select('config')
    .eq('studio_id', alcance.id)
    .maybeSingle();
  return data?.config ?? null;
}

/** Config de menú de la sede (compartida por cadena). Fallback a default. */
export const getLayout = cache(async (studioId: string): Promise<LayoutConfig> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_LAYOUT;
  const alcance = await alcanceDe(admin, studioId);
  return resolveLayout(await leerConfig(admin, alcance));
});

/**
 * Todas las sedes a las que afecta una escritura de este alcance.
 *
 * ⚠️ En una cadena la escritura es UNA sobre la cadena, pero el catálogo
 * público está cacheado POR SEDE: invalidar solo la sede desde la que se
 * publicó dejaría a las demás sirviendo el layout anterior. Es una consulta
 * más en una acción manual y rara (publicar), no en el camino de lectura.
 */
async function sedesDelAlcance(admin: SupabaseClient, alcance: Alcance): Promise<string[]> {
  if (alcance.tipo === 'estudio') return [alcance.id];
  const { data } = await admin.from('studios').select('id').eq('cadena_id', alcance.id);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/** Escribe la config final resuelta, en cadena o en la sede suelta según el alcance. */
async function escribirConfig(admin: SupabaseClient, alcance: Alcance, final: LayoutConfig): Promise<void> {
  if (alcance.tipo === 'cadena') {
    const { error } = await admin
      .from('cadenas')
      .update({ layout_config: final })
      .eq('id', alcance.id);
    if (error) throw new Error(`LAYOUT_GUARDAR: ${error.message}`);
  } else {
    const { error } = await admin
      .from('studio_layout')
      .upsert(
        { studio_id: alcance.id, config: final, actualizado_en: new Date().toISOString() },
        { onConflict: 'studio_id' },
      );
    if (error) throw new Error(`LAYOUT_GUARDAR: ${error.message}`);
  }
}

/**
 * Guarda (fusiona) un parche parcial de layout (owner). El merge evita que
 * guardar el MENÚ pise la config de la HOME y viceversa (son dos áreas del
 * editor que envían solo su parte). Valida con zod; lanza si inválida. En una
 * cadena escribe una sola vez, sobre la cadena: aplica a todas las sedes.
 *
 * No toca `bloques` — ese campo tiene su propio flujo borrador/publicado por
 * pantalla (guardarBloquesBorrador/publicarBloques más abajo), a diferencia
 * del resto de este esquema, que se aplica en vivo.
 */
export async function guardarLayout(studioId: string, parche: LayoutDraft): Promise<LayoutConfig> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('LAYOUT_SIN_ADMIN');
  const validado = layoutDraftSchema.parse(parche);

  const alcance = await alcanceDe(admin, studioId);
  const actual = resolveLayout(await leerConfig(admin, alcance));

  const final = layoutConfigSchema.parse({
    ...actual,
    ...validado,
    home: { ...actual.home, ...(validado.home ?? {}) },
    portalHome: { ...actual.portalHome, ...(validado.portalHome ?? {}) },
    reservar: { ...actual.reservar, ...(validado.reservar ?? {}) },
  });

  await escribirConfig(admin, alcance, final);
  // Se aplica en vivo (este esquema no tiene borrador), así que el catálogo
  // cacheado queda obsoleto en el mismo instante en que se escribe.
  invalidarCatalogoPublico(...(await sedesDelAlcance(admin, alcance)));
  return final;
}

// ── Constructor de bloques del portal (Fase 3, generalizado a todas las
// pantallas en la Fase 1 del Theme Builder) ─────────────────────────────────
// Draft/publish PROPIO por pantalla — ver comentario en layout-schema.ts.
// Mismo patrón que theme-data.ts (guardarBorradorTheme/publicarTheme), pero
// dentro de la misma fila de studio_layout/cadenas en vez de una tabla aparte
// (studio_layout.config ya es jsonb libre, cero migración de esquema).

/** Bloques BORRADOR de una pantalla del portal (editor). */
export const getBloquesBorrador = cache(async (studioId: string, pantalla: PantallaId): Promise<BloqueHome[]> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_LAYOUT.bloques[pantalla].draft;
  const alcance = await alcanceDe(admin, studioId);
  return resolveLayout(await leerConfig(admin, alcance)).bloques[pantalla].draft;
});

/** Bloques PUBLICADOS de una pantalla del portal (runtime, lo que ve la clienta). */
export const getBloquesPublicado = cache(async (studioId: string, pantalla: PantallaId): Promise<BloqueHome[]> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_LAYOUT.bloques[pantalla].publicado;
  const alcance = await alcanceDe(admin, studioId);
  return resolveLayout(await leerConfig(admin, alcance)).bloques[pantalla].publicado;
});

/** Guarda (reemplaza) el BORRADOR de bloques de una pantalla. No toca lo publicado ni las demás pantallas. */
export async function guardarBloquesBorrador(studioId: string, pantalla: PantallaId, bloques: BloqueHome[]): Promise<BloqueHome[]> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('LAYOUT_SIN_ADMIN');
  const validados = z.array(bloqueHomeSchema).parse(bloques);

  const alcance = await alcanceDe(admin, studioId);
  const actual = resolveLayout(await leerConfig(admin, alcance));
  const final = layoutConfigSchema.parse({
    ...actual,
    bloques: { ...actual.bloques, [pantalla]: { ...actual.bloques[pantalla], draft: validados } },
  });
  await escribirConfig(admin, alcance, final);
  return validados;
}

/** Publica el borrador de bloques de una pantalla: copia draft → publicado. */
export async function publicarBloques(studioId: string, pantalla: PantallaId): Promise<BloqueHome[]> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('LAYOUT_SIN_ADMIN');

  const alcance = await alcanceDe(admin, studioId);
  const actual = resolveLayout(await leerConfig(admin, alcance));
  const publicado = actual.bloques[pantalla].draft;
  const final = layoutConfigSchema.parse({
    ...actual,
    bloques: { ...actual.bloques, [pantalla]: { draft: publicado, publicado } },
  });
  await escribirConfig(admin, alcance, final);
  invalidarCatalogoPublico(...(await sedesDelAlcance(admin, alcance)));
  return publicado;
}
