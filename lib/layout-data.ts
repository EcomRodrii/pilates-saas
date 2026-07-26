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

import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveLayout,
  layoutConfigSchema,
  layoutDraftSchema,
  type LayoutConfig,
  type LayoutDraft,
  DEFAULT_LAYOUT,
} from '@/lib/layout-schema';

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
 * Guarda (fusiona) un parche parcial de layout (owner). El merge evita que
 * guardar el MENÚ pise la config de la HOME y viceversa (son dos áreas del
 * editor que envían solo su parte). Valida con zod; lanza si inválida. En una
 * cadena escribe una sola vez, sobre la cadena: aplica a todas las sedes.
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
  });

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
  return final;
}
