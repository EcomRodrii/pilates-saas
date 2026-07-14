// ═══════════════════════════════════════════════════════════════════════════
// Esquema del tema white-label por estudio (Fase 1 · backbone)
// ═══════════════════════════════════════════════════════════════════════════
//
// Fuente de verdad de la FORMA de un tema: colores, tipografía (set curado, no
// libre), radio de componentes y favicon. El logo vive aparte en
// `studios.logo_url` (ya existente). Se valida con zod tanto en cliente (feedback
// en vivo) como en servidor (gate al publicar — no confiar en el input).
//
// `resolveTheme()` es el fallback robusto: ante un JSON parcial/corrupto de la DB
// rellena cada token ausente o inválido con el default del sistema, sin romper
// la UI (requisito 3 del brief).

import { z } from 'zod';

/** Hex de 3 o 6 dígitos. */
export const hexSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color hex inválido (ej: #4F46E5)');

/**
 * Set CURADO de tipografías. `jakarta` es la del sistema (ya cargada por
 * `next/font` en el root layout). Las demás se registran con `next/font` en la
 * Fase 3; el `stack` incluye fallback de sistema para degradar con gracia si la
 * fuente aún no está cargada.
 */
export const FUENTES = [
  { id: 'jakarta', label: 'Plus Jakarta Sans', stack: 'var(--font-jakarta), system-ui, sans-serif' },
  { id: 'inter', label: 'Inter', stack: 'var(--font-inter), system-ui, sans-serif' },
  { id: 'poppins', label: 'Poppins', stack: 'var(--font-poppins), system-ui, sans-serif' },
  { id: 'serif', label: 'Serif clásica', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Monoespaciada', stack: 'var(--font-plex-mono), ui-monospace, monospace' },
] as const;

export type FontId = (typeof FUENTES)[number]['id'];

/** Estilo de esquinas de los componentes → valor de `--radius`. */
export const RADIOS = [
  { id: 'sharp', label: 'Recto', value: '0.25rem' },
  { id: 'rounded', label: 'Redondeado', value: '1rem' },
  { id: 'pill', label: 'Píldora', value: '2rem' },
] as const;

export type RadiusId = (typeof RADIOS)[number]['id'];

const fontIdSchema = z.enum(FUENTES.map((f) => f.id) as [FontId, ...FontId[]]);
const radiusSchema = z.enum(RADIOS.map((r) => r.id) as [RadiusId, ...RadiusId[]]);
const faviconSchema = z.string().url().nullable();

/** Esquema completo de un tema válido (el que exige `publicar`). */
export const themeConfigSchema = z
  .object({
    primary: hexSchema,
    secondary: hexSchema,
    accent: hexSchema,
    background: hexSchema,
    text: hexSchema,
    fontId: fontIdSchema,
    radius: radiusSchema,
    faviconUrl: faviconSchema.default(null),
  })
  .strict();

export type ThemeConfig = z.infer<typeof themeConfigSchema>;

/** Esquema parcial para guardar BORRADOR mientras se edita. */
export const themeDraftSchema = themeConfigSchema.partial();
export type ThemeDraft = z.infer<typeof themeDraftSchema>;

/** Tema por defecto del sistema (paleta "Original"). */
export const DEFAULT_THEME: ThemeConfig = {
  primary: '#FFC8E2',
  secondary: '#B57A8E',
  accent: '#FFF2F7',
  background: '#EEEEE8',
  text: '#1A1A1A',
  fontId: 'jakarta',
  radius: 'rounded',
  faviconUrl: null,
};

/**
 * Fallback robusto: convierte cualquier valor crudo (jsonb de la DB, null,
 * parcial o corrupto) en un tema válido completo, tomando el default por CADA
 * token que falte o no valide. Nunca lanza.
 */
export function resolveTheme(raw: unknown): ThemeConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pick = <K extends keyof ThemeConfig>(clave: K, esquema: z.ZodType): ThemeConfig[K] => {
    const r = esquema.safeParse(obj[clave]);
    return (r.success ? r.data : DEFAULT_THEME[clave]) as ThemeConfig[K];
  };
  return {
    primary: pick('primary', hexSchema),
    secondary: pick('secondary', hexSchema),
    accent: pick('accent', hexSchema),
    background: pick('background', hexSchema),
    text: pick('text', hexSchema),
    fontId: pick('fontId', fontIdSchema),
    radius: pick('radius', radiusSchema),
    faviconUrl: pick('faviconUrl', faviconSchema),
  };
}
