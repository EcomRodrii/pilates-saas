// ═══════════════════════════════════════════════════════════════════════════
// Galería de temas — registro de ThemeDefinition
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ RETIRADO (decisión del fundador, 2026-08-27): aquí vivían "Tentada",
// "Oliva", "Bloom", "Noir" y "Sereno" — los cinco temas del kit de diseño
// (`components/portal-tema/`, `themes/*`), borrados enteros en el PR 2 de
// "borrar temas del kit". Solo queda `classic`, que es la única entrada que
// no fija ningún `default` — es el aspecto de siempre, sin tema instalado.
//
// Un `ThemeDefinition` es un tema con nombre y versión que el estudio puede
// elegir de un click, antes de afinar campo a campo en "Personalizar". Este
// archivo es el ÚNICO sitio que crece cuando se añade un tema nuevo — el
// editor, el runtime y el schema no cambian por añadir una entrada aquí,
// salvo que el tema nuevo necesite un eje visual que `ThemeConfig` todavía no
// tenga (en ese caso, se añade ese campo a `ThemeConfig` una vez, como ya se
// hizo con `buttonStyle`/`cardStyle`, y la `capability` correspondiente a la
// unión de abajo).
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
  /**
   * Orden Y PRESENCIA de los bloques `sistema` del Inicio al INSTALAR este
   * tema — ids de `BLOQUES_SISTEMA_IDS` (lib/portal-home-bloques.ts). Los que
   * no aparezcan aquí se ocultan (`oculto: true`), nunca se borran — un
   * bloque `sistema` nunca se puede quitar del todo, y la propietaria los
   * puede reactivar después. Los bloques del CATÁLOGO que la propietaria ya
   * haya añadido se preservan siempre, al final, tal cual — cambiar de tema
   * no borra contenido. Sin este campo, instalar el tema no toca los bloques
   * del Inicio en absoluto (el comportamiento de `classic`, hoy la única
   * entrada).
   */
  bloquesHome?: string[];
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
  // ⚠️ Los ids retirados NO se reciclan nunca para otro tema. Un estudio
  // puede tener 'tentada'/'oliva'/'bloom'/'noir'/'sereno' (o el 'editorial'
  // de una tanda anterior) guardado en su fila: sus colores no se pierden —
  // viven en el `ThemeConfig` de ESE estudio, no se buscan por id— pero
  // `getThemeDefinition` devuelve `undefined` para todos ellos y la pantalla
  // de Apariencia ya no ofrece ninguno para instalar. Reutilizar un id le
  // cambiaría el tema por sorpresa, que es mucho peor.
];

export function getThemeDefinition(id: string): ThemeDefinition | undefined {
  return THEME_DEFINITIONS.find((t) => t.id === id);
}
