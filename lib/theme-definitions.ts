// ═══════════════════════════════════════════════════════════════════════════
// Galería de temas — registro de ThemeDefinition
// ═══════════════════════════════════════════════════════════════════════════
//
// Un `ThemeDefinition` es un tema con nombre y versión que el estudio puede
// elegir de un click, antes de afinar campo a campo en "Personalizar". Este
// archivo es el ÚNICO sitio que crece cuando se añade un tema nuevo (Luxury,
// Editorial, Organic…) — el editor, el runtime y el schema no cambian por
// añadir una entrada aquí, salvo que el tema nuevo necesite un eje visual que
// `ThemeConfig` todavía no tenga (en ese caso, se añade ese campo a
// `ThemeConfig` una vez, como ya se hizo con `buttonStyle`/`cardStyle`, y la
// `capability` correspondiente a la unión de abajo).
//
// `defaults` son los valores que el tema fija — el estudio parte de ahí y su
// propio `ThemeConfig` guarda lo que decide sobrescribir encima (mismo modelo
// mental que `resolveTheme()` ya usa con `DEFAULT_THEME`, un nivel más).

import type { ThemeConfig } from './theme-schema.ts';

export type ThemeCapability = 'colors' | 'typography' | 'buttons' | 'cards' | 'nav';

export interface ThemeDefinition {
  id: string;
  version: number;
  label: string;
  description: string;
  /** Qué ejes visuales toca este tema — metadato para el editor ("Este tema
   *  modifica: ✓ Tipografía"), no una lista exhaustiva de TODO ThemeConfig. */
  capabilities: ThemeCapability[];
  defaults: Partial<ThemeConfig>;
}

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'classic',
    version: 1,
    label: 'Clásico',
    description: 'Instrument Serif en los titulares — el aspecto de siempre.',
    capabilities: [],
    defaults: {},
  },
  {
    id: 'geometric',
    version: 1,
    label: 'Geométrico',
    description: 'Titulares en Outfit, una geométrica de trazo limpio. Mismos colores de marca.',
    capabilities: ['typography'],
    defaults: { portalHeadingFontId: 'outfit' },
  },
  {
    id: 'editorial',
    version: 1,
    label: 'Editorial',
    // Sin la palabra "tarjetas" a propósito: colisionaba con el encabezado
    // de esa sección en "Personalizar" (getByText('Tarjetas') dejaba de ser
    // único, e2e/apariencia-boton-tarjeta.spec.ts).
    description: 'Titulares en negrita, contenido destacado y barra inferior con pestaña expandible.',
    capabilities: ['typography', 'buttons', 'cards', 'nav'],
    defaults: {
      portalHeadingFontId: 'instrumentSansBold',
      buttonStyle: 'solid',
      cardStyle: 'elevated',
      tabBarStyle: 'pestanaActiva',
    },
  },
];

export function getThemeDefinition(id: string): ThemeDefinition | undefined {
  return THEME_DEFINITIONS.find((t) => t.id === id);
}
