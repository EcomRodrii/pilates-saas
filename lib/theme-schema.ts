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

/**
 * Estilo del botón principal (CTA de marca). `solid` es el look de siempre
 * (fondo de marca sólido) — los estudios que ya tienen tema no ven ningún
 * cambio hasta que eligen uno distinto.
 */
export const ESTILOS_BOTON = [
  { id: 'solid', label: 'Sólido' },
  { id: 'outline', label: 'Contorno' },
  { id: 'soft', label: 'Suave' },
] as const;

export type ButtonStyleId = (typeof ESTILOS_BOTON)[number]['id'];

/** Estilo de las tarjetas. `flat` es el look de siempre (borde fino, sin sombra). */
export const ESTILOS_TARJETA = [
  { id: 'flat', label: 'Plana' },
  { id: 'elevated', label: 'Elevada' },
  { id: 'bordered', label: 'Con borde' },
] as const;

export type CardStyleId = (typeof ESTILOS_TARJETA)[number]['id'];

/**
 * Tipografía de TITULARES del portal cliente (`display()` en
 * `lib/portal-design.ts`) — distinta de `fontId`/`FUENTES` de arriba, que solo
 * gobierna el cuerpo/dashboard. `instrumentSerif` es el look de siempre.
 */
export const ESTILOS_TITULAR_PORTAL = [
  { id: 'instrumentSerif', label: 'Instrument Serif (el de siempre)' },
  { id: 'outfit', label: 'Outfit' },
] as const;

export type PortalHeadingFontId = (typeof ESTILOS_TITULAR_PORTAL)[number]['id'];

const fontIdSchema = z.enum(FUENTES.map((f) => f.id) as [FontId, ...FontId[]]);
const radiusSchema = z.enum(RADIOS.map((r) => r.id) as [RadiusId, ...RadiusId[]]);
const faviconSchema = z.string().url().nullable();
const buttonStyleSchema = z.enum(ESTILOS_BOTON.map((b) => b.id) as [ButtonStyleId, ...ButtonStyleId[]]);
const cardStyleSchema = z.enum(ESTILOS_TARJETA.map((c) => c.id) as [CardStyleId, ...CardStyleId[]]);
const portalHeadingFontSchema = z.enum(ESTILOS_TITULAR_PORTAL.map((f) => f.id) as [PortalHeadingFontId, ...PortalHeadingFontId[]]);
const themeIdSchema = z.string();
const themeVersionSchema = z.number().int();
const themeCustomizedSchema = z.boolean();

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
    // Opcionales con default: un tema guardado ANTES de esta fase no trae
    // estos campos, y debe seguir viéndose exactamente igual (solid/flat).
    buttonStyle: buttonStyleSchema.default('solid'),
    cardStyle: cardStyleSchema.default('flat'),
    // Titular del portal cliente — ver ESTILOS_TITULAR_PORTAL arriba.
    portalHeadingFontId: portalHeadingFontSchema.default('instrumentSerif'),
    // Galería de temas (lib/theme-definitions.ts): de qué ThemeDefinition (y
    // qué versión) partió este tema, y si el estudio lo ha tocado a mano
    // después de elegirlo. Metadato de procedencia — no gobierna el render
    // por sí mismo, es trazabilidad para un futuro flujo de "hay una v2 de tu
    // tema" sin migración ni romper a quien se quede en la v1.
    themeId: themeIdSchema.default('classic'),
    themeVersion: themeVersionSchema.default(1),
    themeCustomized: themeCustomizedSchema.default(false),
  })
  .strict();

export type ThemeConfig = z.infer<typeof themeConfigSchema>;

/** Esquema parcial para guardar BORRADOR mientras se edita. */
export const themeDraftSchema = themeConfigSchema.partial();
export type ThemeDraft = z.infer<typeof themeDraftSchema>;

/** Tema por defecto del sistema (identidad Tentare: oliva + arena). */
export const DEFAULT_THEME: ThemeConfig = {
  primary: '#343825',
  secondary: '#5A6142',
  accent: '#F1F2EA',
  background: '#F6F7F9',
  text: '#1A1A1A',
  fontId: 'jakarta',
  radius: 'rounded',
  faviconUrl: null,
  buttonStyle: 'solid',
  cardStyle: 'flat',
  portalHeadingFontId: 'instrumentSerif',
  themeId: 'classic',
  themeVersion: 1,
  themeCustomized: false,
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
    buttonStyle: pick('buttonStyle', buttonStyleSchema),
    cardStyle: pick('cardStyle', cardStyleSchema),
    portalHeadingFontId: pick('portalHeadingFontId', portalHeadingFontSchema),
    themeId: pick('themeId', themeIdSchema),
    themeVersion: pick('themeVersion', themeVersionSchema),
    themeCustomized: pick('themeCustomized', themeCustomizedSchema),
  };
}
