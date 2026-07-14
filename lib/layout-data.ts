// ═══════════════════════════════════════════════════════════════════════════
// Capa de datos de la configuración de menú por estudio (Fase 4)
// ═══════════════════════════════════════════════════════════════════════════
//
// Tabla studio_layout (una fila por estudio, sin borrador/publicado: el menú se
// aplica en vivo). Lecturas service-role + React cache (patrón studio-seo).

import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  resolveLayout,
  layoutConfigSchema,
  layoutDraftSchema,
  type LayoutConfig,
  type LayoutDraft,
  DEFAULT_LAYOUT,
} from '@/lib/layout-schema';

/** Config de menú del estudio. Fallback a default si no hay fila. */
export const getLayout = cache(async (studioId: string): Promise<LayoutConfig> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_LAYOUT;
  const { data } = await admin
    .from('studio_layout')
    .select('config')
    .eq('studio_id', studioId)
    .maybeSingle();
  return resolveLayout(data?.config ?? null);
});

/**
 * Guarda (fusiona) un parche parcial de layout (owner). El merge evita que
 * guardar el MENÚ pise la config de la HOME y viceversa (son dos áreas del
 * editor que envían solo su parte). Valida con zod; lanza si inválida.
 */
export async function guardarLayout(studioId: string, parche: LayoutDraft): Promise<LayoutConfig> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('LAYOUT_SIN_ADMIN');
  const validado = layoutDraftSchema.parse(parche);

  const { data } = await admin
    .from('studio_layout')
    .select('config')
    .eq('studio_id', studioId)
    .maybeSingle();
  const actual = resolveLayout(data?.config ?? null);

  const final = layoutConfigSchema.parse({
    ...actual,
    ...validado,
    home: { ...actual.home, ...(validado.home ?? {}) },
  });

  const { error } = await admin
    .from('studio_layout')
    .upsert(
      { studio_id: studioId, config: final, actualizado_en: new Date().toISOString() },
      { onConflict: 'studio_id' },
    );
  if (error) throw new Error(`LAYOUT_GUARDAR: ${error.message}`);
  return final;
}
