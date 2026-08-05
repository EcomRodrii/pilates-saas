// La mitad del tema que NO es CSS, y cómo viaja por el puente del preview.
//
// El puente `tentare-theme-preview` (editor → iframe) nació transportando solo
// CSS vars, porque al principio un tema solo cambiaba color, tipografía y
// radio. Desde `variantes` (lib/theme-variantes.ts) eso ya no es cierto: hay
// ejes del tema que deciden qué elementos EXISTEN en el DOM, y esos se
// resuelven en JS —`resolveVariantes()` en lib/studio-context.tsx— nunca como
// una custom property. Resultado: el preview grande del editor
// (/portal-preview/[slug]) mostraba la paleta del borrador pero la FORMA del
// tema publicado — la propietaria elegía tema viendo la mitad de lo que cambia.
//
// Este módulo fija lo que va en el campo `temaJs` del mensaje. Tres campos, no
// solo `variantes`: `barraClasica` y `tabBarStyle` son exactamente el mismo
// tipo de eje (valor JS que decide render, no CSS var) y arrastran el mismo
// problema desde antes. Se resuelven juntos para que "la mitad JS del tema" sea
// UNA cosa que se pisa entera, y no tres overrides sueltos que puedan quedar a
// medias.
//
// Módulo PURO a propósito (sin React ni zod), como lib/theme-variantes.ts y
// lib/portal-nav.ts: lo importa tanto el emisor (components/theme/*) como el
// receptor (lib/studio-context.tsx), que se monta en TODO el portal de socias y
// no debe arrastrar zod a ese bundle. Por eso `TabBarStyleId` entra como import
// de TIPO y su validación se escribe a mano abajo.

import { resolveVariantes, type VariantesResueltas } from './theme-variantes.ts';
import type { TabBarStyleId } from './theme-schema.ts';

/** Tipo de mensaje del puente. Lo emiten ThemePreview y HomePreview; lo escuchan
 *  ThemePreviewListener (CSS vars) y StudioProvider (esto). */
export const MENSAJE_TEMA_PREVIEW = 'tentare-theme-preview';

/** Los ejes del tema que se resuelven en JS. Siempre completo, nunca parcial. */
export interface TemaJs {
  variantes: VariantesResueltas;
  barraClasica: boolean;
  tabBarStyle: TabBarStyleId;
}

/**
 * Resuelve la mitad JS de un tema. Sirve para los DOS extremos del puente:
 * el emisor la aplica sobre el `ThemeConfig` en borrador, el receptor sobre lo
 * que llegó por `postMessage` — que es entrada no confiable y se valida igual
 * de estricto que en `fetchPublicStudioData` (mismas reglas que usa
 * StudioProvider con el tema publicado: `resolveVariantes` clave a clave,
 * `=== true`, y el único valor no-'clasica' de la barra escrito a mano).
 *
 * Devuelve `null` cuando no hay nada que resolver (mensaje sin `temaJs`, tema
 * en borrador todavía sin cargar): eso significa "no pises nada", que es
 * distinto de "pisa con los valores por defecto" — un mensaje viejo sin el
 * campo no debe borrar la forma del tema publicado.
 */
export function resolveTemaJs(raw: unknown): TemaJs | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    variantes: resolveVariantes(o.variantes),
    barraClasica: o.barraClasica === true,
    tabBarStyle: o.tabBarStyle === 'pestanaActiva' ? 'pestanaActiva' : 'clasica',
  };
}
