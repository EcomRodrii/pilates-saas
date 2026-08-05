// ═══════════════════════════════════════════════════════════════════════════
// Motor de aplicación del tema en runtime (Fase 1 · backbone)
// ═══════════════════════════════════════════════════════════════════════════
//
// Sustituye al antiguo `lib/portal-theme.tsx` (que solo aceptaba un id de
// preset y se aplicaba con un `style` inline en PortalShell, pisando por
// especificidad el `:root` que ya inyecta ThemeStyle — el bug real que hizo
// que la app de socias ignorara el tema publicado del estudio). Este módulo
// acepta un tema arbitrario. Produce el conjunto de CSS variables que ya
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
import { cumpleContraste, foregroundParaFondo, hexARgb } from './wcag-contrast.ts';

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

// Estilo del botón principal → los 3 valores que necesita `Button` (fondo,
// texto, borde). La rama por defecto ('solid') reproduce EXACTAMENTE lo que
// components/portal/ui/Button.tsx pintaba antes de esta fase — un tema sin
// buttonStyle (o con 'solid') no cambia nada.
function varsBoton(t: ThemeConfig, marcaForeground: string): Record<string, string> {
  if (t.buttonStyle === 'outline') {
    return {
      '--portal-btn-bg': 'transparent',
      '--portal-btn-fg': t.primary,
      '--portal-btn-border': `1px solid ${t.primary}`,
    };
  }
  if (t.buttonStyle === 'soft') {
    // rgba(), no color-mix(): Safari <16.2 no soporta color-mix(), y como
    // valor de una custom property no cae al fallback de var() (no está
    // "vacía", solo es una función que ese motor no entiende) — el botón
    // "soft" se quedaba sin fondo entero. rgba() con el mismo 15% de opacidad
    // sobre transparente da el resultado visual idéntico y es universal.
    const rgb = hexARgb(t.primary);
    return {
      '--portal-btn-bg': rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : `color-mix(in srgb, ${t.primary} 15%, transparent)`,
      '--portal-btn-fg': t.primary,
      '--portal-btn-border': 'none',
    };
  }
  return {
    '--portal-btn-bg': t.primary,
    '--portal-btn-fg': marcaForeground,
    '--portal-btn-border': 'none',
  };
}

// Estilo de tarjeta → borde y sombra. 'flat' NO declara ninguna de las dos
// vars a propósito (en vez de un string vacío, que en CSS es un valor
// inválido para `border`/`box-shadow` y rompería el `var(..., fallback)` de
// Card.tsx): así Card.tsx sigue usando su borde de siempre (`t.line`, que
// depende del modo claro/oscuro, algo que este módulo no conoce) vía el
// fallback del propio var().
function varsTarjeta(t: ThemeConfig): Record<string, string> {
  if (t.cardStyle === 'elevated') {
    return { '--portal-card-border': 'none', '--portal-card-shadow': '0 8px 24px -12px rgba(0,0,0,.18)' };
  }
  if (t.cardStyle === 'bordered') {
    return { '--portal-card-border': `1.5px solid ${t.primary}`, '--portal-card-shadow': 'none' };
  }
  return {};
}

// Titular del portal cliente (galería de temas). 'instrumentSerif' (default)
// NO declara ninguna var a propósito — mismo mecanismo que varsTarjeta 'flat'
// — así lib/portal-design.ts sigue usando su fallback de siempre
// (var(--font-display), Instrument Serif). El peso 600 en Outfit no es
// arbitrario: Instrument Serif a 400 ya "pesa" por su contraste Didone, y
// Outfit a 400 se ve fino — 600 es el que reproduce el diseño de referencia.
function varsTitularPortal(t: ThemeConfig): Record<string, string> {
  if (t.portalHeadingFontId === 'outfit') {
    return {
      '--portal-heading-font': "var(--font-outfit), 'Outfit', sans-serif",
      '--portal-heading-weight': '600',
    };
  }
  if (t.portalHeadingFontId === 'instrumentSansBold') {
    // Reusa --font-ui (Instrument Sans, ya cargada) en negrita — tema
    // "Editorial", sin fuente nueva.
    return {
      '--portal-heading-font': "var(--font-ui), 'Instrument Sans', system-ui, sans-serif",
      '--portal-heading-weight': '700',
    };
  }
  if (t.portalHeadingFontId === 'poppins') {
    // Tema "Bloom" — reusa --font-poppins (ya cargada para el cuerpo del
    // mismo tema) en negrita para el titular, sin fuente nueva.
    return {
      '--portal-heading-font': "var(--font-poppins), 'Poppins', system-ui, sans-serif",
      '--portal-heading-weight': '700',
    };
  }
  return {};
}

// El color del icono activo de la barra cuando pisa el tema global (oscura o
// flotante): `destacado` si el tema lo trae, si no `secondary` — así un tema
// guardado antes de que existiera `destacado` (Noir en #640) sigue viéndose
// igual sin tocar nada.
function colorDestacado(t: ThemeConfig): string {
  return t.destacado ?? t.secondary;
}

// Barra inferior oscura (tema "Noir"). Como varsTarjeta('flat'): si el tema no
// la pide, NO declara ninguna var y portal-nav.tsx se queda con su fallback de
// siempre (t.tabbar, que depende del modo claro/oscuro y que este módulo no
// conoce).
function varsBarra(t: ThemeConfig): Record<string, string> {
  if (!t.barraOscura) return {};
  return {
    '--portal-tabbar-bg': t.primary,
    '--portal-tabbar-active-bg': 'transparent',
    '--portal-tabbar-active-shadow': 'none',
    '--portal-tabbar-active-fg': colorDestacado(t),
    '--portal-tabbar-idle-fg': 'rgba(255,255,255,.55)',
  };
}

// Barra flotante sobre el fondo (tema "Bloom") — eje INDEPENDIENTE de
// barraOscura (ver comentario de `barraFlotanteSchema` en theme-schema.ts).
// La barra YA es una cápsula que flota sobre el contenido para TODOS los
// temas desde el rediseño 2026-08 (position:absolute, inset con margen) —
// esto solo cambia altura/radio/sombra/icono activo, que es lo que de
// verdad distingue a Bloom. Sin `barraFlotante`, ninguna var.
function varsBarraFlotante(t: ThemeConfig): Record<string, string> {
  if (!t.barraFlotante) return {};
  return {
    '--portal-tabbar-height': '66px',
    '--portal-tabbar-radius': '999px',
    '--portal-tabbar-shadow': '0 16px 40px -18px rgba(60,40,90,.4)',
    '--portal-tabbar-active-fg': colorDestacado(t),
  };
}

// Radio por pieza de las secciones NUEVAS de cada tema (tarjeta de próxima
// clase, tiraSemana, progresoSemanal) — nunca del resto del portal, que sigue
// leyendo los números fijos de lib/portal-design.ts. Sin `radioTema`, ninguna
// var — mismo mecanismo que el resto de esta fase.
function varsRadioTema(t: ThemeConfig): Record<string, string> {
  if (!t.radioTema) return {};
  const vars: Record<string, string> = {};
  if (t.radioTema.card !== undefined) vars['--portal-radius-card'] = `${t.radioTema.card}px`;
  if (t.radioTema.boton !== undefined) vars['--portal-radius-boton'] = `${t.radioTema.boton}px`;
  if (t.radioTema.chip !== undefined) vars['--portal-radius-chip'] = `${t.radioTema.chip}px`;
  if (t.radioTema.acceso !== undefined) vars['--portal-radius-acceso'] = `${t.radioTema.acceso}px`;
  return vars;
}

// La única variante de forma que SÍ es un valor puro y no una decisión
// estructural: el icono activo relleno de Oliva. `fill` es propiedad CSS y
// gana sobre el atributo de presentación `fill="none"` que pinta lucide, así
// que basta una var — el resto de ejes de `variantes` deciden qué elementos
// EXISTEN en el DOM y por eso viajan como valor JS (ver theme-variantes.ts).
function varsVariantes(t: ThemeConfig): Record<string, string> {
  if (t.variantes?.barra !== 'todasRelleno') return {};
  return { '--portal-tabbar-active-fill': 'currentColor' };
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
    // Estilo de botón/tarjeta (Fase 1 del editor de temas)
    ...varsBoton(t, marcaForeground),
    ...varsTarjeta(t),
    // Titular del portal (galería de temas)
    ...varsTitularPortal(t),
    // Barra inferior oscura (tema "Noir")
    ...varsBarra(t),
    // Barra flotante (tema "Bloom")
    ...varsBarraFlotante(t),
    // Radio por pieza de las secciones nuevas
    ...varsRadioTema(t),
    // Variantes de forma que sí caben en una var (icono activo relleno)
    ...varsVariantes(t),
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
  // Par que solo estrena la barra oscura: SOLO ahí `--portal-tabbar-bg` pasa
  // a ser `primary` (varsBarra en theme-runtime.ts) — la barra flotante deja
  // el fondo de la pastilla activa en su valor claro de siempre
  // (`--portal-tabbar-active-bg` no lo toca `varsBarraFlotante`), así que
  // `destacado` ahí nunca se pinta sobre la marca y este par no aplica.
  if (t.barraOscura && !cumpleContraste(colorDestacado(t), t.primary, { grande: true }))
    errores.push('Con la barra oscura, el color destacado no contrasta con la marca (mínimo 3:1).');
  return { ok: errores.length === 0, errores };
}
