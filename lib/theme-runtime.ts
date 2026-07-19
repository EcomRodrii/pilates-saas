// ═══════════════════════════════════════════════════════════════════════════
// Motor de aplicación del tema en runtime (Fase 1 · backbone)
// ═══════════════════════════════════════════════════════════════════════════
//
// Generaliza `lib/portal-theme.tsx` (que solo aceptaba un id de preset) para
// aceptar un tema arbitrario. Produce el conjunto de CSS variables que ya
// consume el resto de la app (`--portal-brand*`, `--brand*`, `--background`,
// `--foreground`, `--accent`, `--radius`, `--font-*`), así que NO hay que tocar
// componentes: solo se sobreescriben los valores de las variables.
//
// Dos salidas:
//  - themeToCssVars(): objeto CSSProperties para inline `style` (cliente/preview).
//  - themeToCssText(): texto CSS para inyección server-side en un <style> (Fase 2,
//    evita el FOUC / flash sin tema).

import type { CSSProperties } from 'react';
import { resolveTheme, FUENTES, RADIOS, DEFAULT_THEME, type ThemeConfig } from './theme-schema.ts';
import { getPreset } from './theme-presets.ts';
import { cumpleContraste, foregroundParaFondo } from './wcag-contrast.ts';

// foregroundParaFondo vive en wcag-contrast.ts (cero dependencias) y se
// reexporta aquí por compatibilidad — así PanelThemeProvider (montado en TODO
// el panel) puede importarla directamente de ahí sin arrastrar theme-schema.ts
// (y con él, zod) a un chunk que se descarga en las 22 rutas del dashboard.
export { foregroundParaFondo };

/**
 * Puente de retrocompatibilidad: convierte el preset con nombre que un estudio
 * ya tenía (`studios.tema_portal`, sistema viejo de 6 opciones) en un tema
 * completo. Se usa cuando el estudio aún no tiene fila en `studio_theme`, para
 * que NO pierda su color al activarse el white-label.
 */
export function presetAThemeConfig(temaPortal: string | null | undefined): ThemeConfig {
  const p = getPreset(temaPortal);
  return {
    ...DEFAULT_THEME,
    primary: p.primary,
    secondary: p.secondary,
  };
}

/** Mapa var→valor a partir de un tema (crudo o resuelto). Interno. */
function themeToVarMap(raw: unknown): Record<string, string> {
  const t = resolveTheme(raw);
  // El texto sobre el color de marca se deriva por contraste (garantiza
  // legibilidad sin pedírselo al usuario).
  const marcaForeground = foregroundParaFondo(t.primary);
  const radius = RADIOS.find((r) => r.id === t.radius)?.value ?? RADIOS[1].value;
  const font = FUENTES.find((f) => f.id === t.fontId)?.stack ?? FUENTES[0].stack;
  return {
    // App de socias (portal)
    '--portal-brand': t.primary,
    '--portal-brand-foreground': marcaForeground,
    '--portal-brand-secondary': t.secondary,
    // Panel de gestión (marca del estudio; el dark/light sigue siendo por-usuario)
    '--brand': t.primary,
    '--brand-foreground': marcaForeground,
    '--brand-secondary': t.secondary,
    // Neutros y acento
    '--accent': t.accent,
    '--background': t.background,
    '--foreground': t.text,
    // Forma y tipografía
    '--radius': radius,
    '--font-sans': font,
    '--font-heading': font,
  };
}

/** CSS variables como objeto para inline `style` (cliente / preview en vivo). */
export function themeToCssVars(raw: unknown): CSSProperties {
  const vars = themeToVarMap(raw);
  const style: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) style[k] = v;
  return style as CSSProperties;
}

/**
 * Texto CSS para inyectar en un <style> server-side sobre `selector`
 * (por defecto `:root`). Evita el FOUC porque el tema llega ya en el HTML.
 */
export function themeToCssText(raw: unknown, selector = ':root'): string {
  const vars = themeToVarMap(raw);
  const cuerpo = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return `${selector} { ${cuerpo} }`;
}

export interface ChequeoContraste {
  ok: boolean;
  errores: string[];
}

/**
 * Gate de accesibilidad al PUBLICAR: verifica los pares de color críticos a
 * WCAG AA. Se ejecuta en cliente (feedback) y se re-verifica en servidor.
 */
export function validarContrasteTheme(raw: unknown): ChequeoContraste {
  const t = resolveTheme(raw);
  const errores: string[] = [];
  if (!cumpleContraste(t.text, t.background))
    errores.push('El texto no contrasta bien con el fondo (mínimo WCAG AA 4.5:1).');
  // El foreground de marca se autoderiva, así que el par marca/texto-de-marca
  // siempre cumple; validamos además la marca sobre el fondo para elementos
  // como enlaces/botones fantasma que pintan `--portal-brand` sobre `--background`.
  if (!cumpleContraste(t.primary, t.background, { grande: true }))
    errores.push('El color de marca no contrasta bien con el fondo (mínimo WCAG AA 3:1 para elementos grandes).');
  return { ok: errores.length === 0, errores };
}
