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
//
// ── Tanda de 3 temas con identidad propia (Oliva · Bloom · Noir) ────────────
// A diferencia de `geometric`/`editorial`, que solo tocaban tipografía y
// componentes, estos tres SÍ fijan paleta: son los tres puntos de partida que
// cubren los tres tipos de estudio (boutique, joven, premium). Los tres pasan
// el gate de `validarContrasteTheme()` sin tocar nada — lo verifica
// theme-definitions.test.ts recorriendo TODO el registro, así que ningún tema
// futuro puede entrar roto.
//
// `barraOscura` es el eje nuevo que pide Noir (barra inferior sobre fondo
// oscuro, icono activo en el color secundario), añadido a `ThemeConfig` una
// sola vez — mismo patrón que `buttonStyle`/`cardStyle` en su día.

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
  {
    id: 'oliva',
    version: 1,
    label: 'Oliva',
    description: 'Oliva profundo sobre crema. Premium, natural y sin adornos: para estudios boutique.',
    capabilities: ['colors', 'typography', 'buttons', 'cards'],
    defaults: {
      primary: '#3E4A2B',
      secondary: '#8B9472',
      accent: '#E9E4D4',
      background: '#F6F3EC',
      text: '#2A2E22',
      fontId: 'jakarta',
      // La sans ya cargada en negrita: el titular pesa sin meter otra fuente.
      portalHeadingFontId: 'instrumentSansBold',
      radius: 'rounded',
      buttonStyle: 'solid',
      // Plana a propósito: el aire y el contraste del oliva ya separan las
      // tarjetas del fondo crema. Una sombra encima las ensucia.
      cardStyle: 'flat',
      tabBarStyle: 'clasica',
      barraOscura: false,
    },
  },
  {
    id: 'bloom',
    version: 1,
    label: 'Bloom',
    description: 'Lila y rosa, esquinas de píldora y contenido que flota. Energía y comunidad, para público joven.',
    capabilities: ['colors', 'typography', 'buttons', 'cards', 'nav'],
    defaults: {
      primary: '#7C6BF5',
      secondary: '#F26D8A',
      accent: '#F1EEFE',
      background: '#FFFFFF',
      text: '#221B33',
      fontId: 'poppins',
      portalHeadingFontId: 'outfit',
      radius: 'pill',
      buttonStyle: 'solid',
      cardStyle: 'elevated',
      // Pestaña activa expandida: la barra es parte del carácter del tema.
      tabBarStyle: 'pestanaActiva',
      barraOscura: false,
    },
  },
  {
    id: 'noir',
    version: 1,
    label: 'Noir',
    description: 'Verde casi negro con dorado y barra inferior oscura. Lujo discreto, para marcas muy cuidadas.',
    capabilities: ['colors', 'typography', 'buttons', 'cards', 'nav'],
    defaults: {
      primary: '#1D2A21',
      // El dorado NO es el color de marca: es el acento. Como relleno de botón
      // daría 1,9:1 con texto claro; como icono activo y detalle sobre el verde
      // oscuro es exactamente lo que hace que el tema se lea como premium.
      secondary: '#C9A24D',
      accent: '#EFE8D5',
      background: '#F4F2EA',
      text: '#17201A',
      fontId: 'jakarta',
      portalHeadingFontId: 'instrumentSerif',
      radius: 'rounded',
      buttonStyle: 'solid',
      cardStyle: 'elevated',
      tabBarStyle: 'clasica',
      barraOscura: true,
    },
  },
];

export function getThemeDefinition(id: string): ThemeDefinition | undefined {
  return THEME_DEFINITIONS.find((t) => t.id === id);
}
