// Qué marca escribe `PanelThemeProvider` (lib/panel-theme.tsx) en el contenedor
// del panel. Fase 4/5 del Brand System: el «brand slot» (brand/brand-os.md §5).
//
// El acento del panel (`--brand`) es el del ESTUDIO. Lo nuevo es qué pasa con el
// estudio que no ha elegido ninguno: hasta ahora recibía el oliva de fábrica
// (`DEFAULT_THEME` / preset `original`), la identidad anterior de Tentare, que el
// Brand System retira. Ahora el provider no escribe nada y manda el valor por
// defecto de la marca, que vive en CSS (`.marca-panel`, app/globals.css): Sand
// con texto en Ink.
//
// ⚠️ Solo el PANEL. /reservar y la app de la alumna leen el mismo tema por otro
// camino y siguen con su oliva hasta su fase (15 y 16 del plan).
//
// Sin importar theme-schema.ts (zod): este módulo acaba en TODAS las rutas del
// panel. Los dos valores de fábrica se repiten aquí y un test los ata a la fuente.
import { foregroundParaFondo } from './wcag-contrast.ts';
import { colorLegibleSobre, mezclarHex } from './color-utils.ts';

/** `DEFAULT_THEME.primary/secondary` y el preset `original`: el oliva de fábrica. */
export const MARCA_DE_FABRICA = { primary: '#343825', secondary: '#5A6142' } as const;

/** La tarjeta del panel en cada modo (`--card`, legacy-bridge.css: Paper y el `surface-raised` oscuro). */
export const CARD_CLARO = '#FFFFFF';
export const CARD_OSCURO = '#1B2027';

export interface ColoresDeTema { primary: string; secondary: string }

/**
 * ¿Es el tema de fábrica? Un estudio sin tema publicado y uno que lo publicó sin
 * tocar los colores llevan exactamente estos dos. Quien eligió otro, aunque se
 * parezca, conserva el suyo.
 */
export function esMarcaDeFabrica(t: ColoresDeTema): boolean {
  return t.primary?.toLowerCase() === MARCA_DE_FABRICA.primary.toLowerCase()
    && t.secondary?.toLowerCase() === MARCA_DE_FABRICA.secondary.toLowerCase();
}

/**
 * Las variables de marca que el provider escribe EN LÍNEA, o `null` si no debe
 * escribir ninguna (tema de fábrica → mandan los valores por defecto del CSS).
 *
 * `--brand-medio` es la marca a tamaño pequeño (enlaces, iconos, textos activos)
 * legible sobre la tarjeta. Antes era siempre el oliva, también en un estudio con
 * su propio color: la regla de marca blanca (brand/ui-rules.md §3.10) pide su
 * `--brand`.
 */
export function variablesDeMarca(t: ColoresDeTema, dark: boolean): Record<string, string> | null {
  if (esMarcaDeFabrica(t)) return null;
  const card = dark ? CARD_OSCURO : CARD_CLARO;
  return {
    '--brand': t.primary,
    '--brand-foreground': foregroundParaFondo(t.primary),
    // El fondo real de este color no es la tarjeta, sino su tinte de marca al
    // 12 % — que es donde el panel pinta badges y pestañas activas.
    '--brand-secondary': colorLegibleSobre(t.secondary, mezclarHex(t.primary, card, 0.12)),
    '--brand-medio': colorLegibleSobre(t.primary, card),
  };
}

/** Las que el provider puede haber escrito: se borran todas antes de aplicar otra marca. */
export const VARIABLES_DE_MARCA = ['--brand', '--brand-foreground', '--brand-secondary', '--brand-medio'] as const;
