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
  type LayoutConfig,
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

/** Guarda la config de menú completa (owner). Valida con zod; lanza si inválida. */
export async function guardarLayout(studioId: string, config: LayoutConfig): Promise<LayoutConfig> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('LAYOUT_SIN_ADMIN');
  const validado = layoutConfigSchema.parse(config);
  const { error } = await admin
    .from('studio_layout')
    .upsert(
      { studio_id: studioId, config: validado, actualizado_en: new Date().toISOString() },
      { onConflict: 'studio_id' },
    );
  if (error) throw new Error(`LAYOUT_GUARDAR: ${error.message}`);
  return validado;
}
