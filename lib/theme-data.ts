// ═══════════════════════════════════════════════════════════════════════════
// Capa de datos del tema por estudio (Fase 1 · backbone)
// ═══════════════════════════════════════════════════════════════════════════
//
// Tabla `studio_theme` (una fila por estudio): `config_draft` (borrador que se
// edita) y `config_published` (lo que ve producción). El runtime lee SIEMPRE
// `published`; el editor y el preview leen `draft`.
//
// Lecturas de runtime: service-role + React `cache()` (mismo patrón que
// `lib/studio-seo.ts`; la tabla es una fila pequeña por request). La caché
// persistente cross-request (unstable_cache/Cache Components) queda como
// optimización DIFERIDA — no se introduce aquí para no añadir un paradigma de
// caché que el resto del repo no usa.
//
// Escrituras (guardarBorrador/publicar): usadas por el route handler del editor
// en la Fase 3, que verifica antes que el llamante es PROPIETARIO del estudio.

import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  resolveTheme,
  themeDraftSchema,
  type ThemeConfig,
  type ThemeDraft,
  DEFAULT_THEME,
} from '@/lib/theme-schema';

/** Tema PUBLICADO de un estudio (runtime). Fallback a default si no hay fila. */
export const getThemePublicado = cache(async (studioId: string): Promise<ThemeConfig> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_THEME;
  const { data } = await admin
    .from('studio_theme')
    .select('config_published')
    .eq('studio_id', studioId)
    .maybeSingle();
  return resolveTheme(data?.config_published ?? null);
});

/** Tema BORRADOR de un estudio (editor/preview). Fallback a lo publicado. */
export const getThemeBorrador = cache(async (studioId: string): Promise<ThemeConfig> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_THEME;
  const { data } = await admin
    .from('studio_theme')
    .select('config_draft, config_published')
    .eq('studio_id', studioId)
    .maybeSingle();
  // Si aún no hay borrador, se parte de lo publicado (o del default).
  return resolveTheme(data?.config_draft ?? data?.config_published ?? null);
});

/**
 * Guarda (fusiona) un parche parcial en el BORRADOR. Valida el parche con zod;
 * lanza si es inválido. No toca lo publicado. Devuelve el borrador resuelto.
 */
export async function guardarBorradorTheme(
  studioId: string,
  parche: ThemeDraft,
): Promise<ThemeConfig> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('THEME_SIN_ADMIN');
  const validado = themeDraftSchema.parse(parche);

  const { data: fila } = await admin
    .from('studio_theme')
    .select('config_draft, config_published')
    .eq('studio_id', studioId)
    .maybeSingle();

  const baseActual = resolveTheme(fila?.config_draft ?? fila?.config_published ?? null);
  const fusionado: ThemeConfig = { ...baseActual, ...validado };

  const { error } = await admin
    .from('studio_theme')
    .upsert(
      { studio_id: studioId, config_draft: fusionado, actualizado_en: new Date().toISOString() },
      { onConflict: 'studio_id' },
    );
  if (error) throw new Error(`THEME_GUARDAR_BORRADOR: ${error.message}`);
  return fusionado;
}

/**
 * Publica el borrador: copia `config_draft` → `config_published`. El gate de
 * contraste WCAG lo aplica el route handler (validarContrasteTheme) ANTES de
 * llamar aquí. Devuelve el tema publicado resuelto.
 */
export async function publicarTheme(studioId: string): Promise<ThemeConfig> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('THEME_SIN_ADMIN');

  const { data: fila } = await admin
    .from('studio_theme')
    .select('config_draft')
    .eq('studio_id', studioId)
    .maybeSingle();

  const publicado = resolveTheme(fila?.config_draft ?? null);
  const ahora = new Date().toISOString();
  const { error } = await admin
    .from('studio_theme')
    .upsert(
      {
        studio_id: studioId,
        config_draft: publicado,
        config_published: publicado,
        actualizado_en: ahora,
        publicado_en: ahora,
      },
      { onConflict: 'studio_id' },
    );
  if (error) throw new Error(`THEME_PUBLICAR: ${error.message}`);
  return publicado;
}
