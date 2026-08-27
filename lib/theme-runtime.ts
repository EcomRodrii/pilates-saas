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
import { resolveTheme, FUENTES, RADIOS, RADIO_PRESET_PX, DEFAULT_THEME, type ThemeConfig, POSICION_FOTO } from './theme-schema.ts';
import { getPreset } from './theme-presets.ts';
import { cumpleContraste, foregroundParaFondo, hexARgb } from './wcag-contrast.ts';
import { colorLegibleSobreClaro } from './color-utils.ts';
import { MODO_TOKENS } from './portal-paleta.ts';

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
  if (t.portalHeadingFontId === 'cormorant') {
    // Tema "Tentada". Peso 500 y no 600/700: en una Garamond el trazo ya
    // contrasta por sí solo y engordarlo la ensucia — mismo motivo por el que
    // Instrument Serif se queda en 400.
    return {
      '--portal-heading-font': "var(--font-cormorant), Georgia, serif",
      '--portal-heading-weight': '500',
    };
  }
  if (t.portalHeadingFontId === 'libreCaslon') {
    // Tema "Sereno". Peso 400 y no 500/700 por el mismo motivo que Instrument
    // Serif: es una Caslon de texto, el contraste del trazo ya la hace pesar a
    // los 30px del título de pantalla, y engordarla la ensucia. Su 700 se
    // carga igualmente porque el kit lo usa donde el prototipo lo pide.
    return {
      '--portal-heading-font': "var(--font-libre-caslon), Georgia, serif",
      '--portal-heading-weight': '400',
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
    '--portal-tabbar-idle-fg': 'rgba(246,245,240,.5)',
    // El prototipo da borde superior a la barra clara y NINGUNO a la oscura
    // (`borderTop: barraOscura ? 'none' : '1px solid ' + borde`): sobre el
    // verde oscuro, esa línea se lee como un corte, no como una separación.
    '--portal-tabbar-border': 'none',
  };
}

// Barra pegada abajo (`barraClasica`: Oliva y Noir). El prototipo NO le pone
// pastilla a la pestaña activa — la marca solo con color (y, en Oliva, con el
// icono macizo). Sin esto la barra clásica heredaba el fallback del
// componente, que es la píldora blanca con sombra de la barra flotante: sobre
// un fondo también blanco quedaba una sombra suelta bajo la pestaña activa,
// que no está en ningún tema del encargo.
function varsBarraClasica(t: ThemeConfig): Record<string, string> {
  if (!t.barraClasica) return {};
  return {
    '--portal-tabbar-active-bg': 'transparent',
    '--portal-tabbar-active-shadow': 'none',
    '--portal-tabbar-active-fg': colorDestacado(t),
  };
}

// Barra flotante sobre el fondo (tema "Bloom") — eje INDEPENDIENTE de
// barraOscura (ver comentario de `barraFlotanteSchema` en theme-schema.ts).
// La barra YA es una cápsula que flota sobre el contenido para TODOS los
// temas desde el rediseño 2026-08 (position:absolute, inset con margen) —
// esto solo cambia altura/radio/sombra/icono activo, que es lo que de
// verdad distingue a Bloom. Sin `barraFlotante`, ninguna var.
function varsBarraFlotante(t: ThemeConfig, marcaForeground: string): Record<string, string> {
  if (!t.barraFlotante) return {};
  return {
    '--portal-tabbar-height': '66px',
    '--portal-tabbar-radius': '999px',
    '--portal-tabbar-shadow': '0 16px 40px -18px rgba(60,40,90,.4)',
    // ⚠️ La pastilla activa es de MARCA, con el icono y el texto encima en
    // claro (`background: activo ? p.marca : 'transparent'`, `color: activo ?
    // '#FFFFFF'` en el prototipo). Antes esto dejaba la pastilla en su blanco
    // de siempre y pintaba el icono con `destacado` — en Bloom, rosa sobre
    // blanco: los dos colores del tema salían, pero la firma del tema (la
    // píldora lila que se ensancha) no se veía por ningún lado.
    // El foreground NO se fija a '#FFFFFF': se usa el mismo autoderivado por
    // contraste que ya usan los botones, así que un tema con marca clara
    // sigue siendo legible sin depender del gate de publicación.
    '--portal-tabbar-active-bg': t.primary,
    '--portal-tabbar-active-fg': marcaForeground,
    // La sombra vive en la BARRA, no en la pastilla: dos sombras apiladas
    // ensucian el borde de la píldora.
    '--portal-tabbar-active-shadow': 'none',
  };
}

// Escala tipográfica por pieza. Mismo criterio que varsRadioTema: una var por
// eje que el tema fije, ninguna para los que no — así el portal de un estudio
// sin tema de esta tanda no cambia ni un píxel.
function varsEscalaTexto(t: ThemeConfig): Record<string, string> {
  if (!t.escalaTexto) return {};
  const e = t.escalaTexto;
  const vars: Record<string, string> = {};
  if (e.seccion !== undefined) vars['--portal-text-seccion'] = `${e.seccion}px`;
  if (e.tituloPantalla !== undefined) vars['--portal-text-titulo-pantalla'] = `${e.tituloPantalla}px`;
  if (e.saludo !== undefined) vars['--portal-text-saludo'] = `${e.saludo}px`;
  if (e.tituloHero !== undefined) vars['--portal-text-titulo-hero'] = `${e.tituloHero}px`;
  if (e.bienvenida !== undefined) vars['--portal-text-bienvenida'] = `${e.bienvenida}px`;
  if (e.numeroBono !== undefined) vars['--portal-text-numero-bono'] = `${e.numeroBono}px`;
  return vars;
}

// `radius` (preset Recto/Redondeado/Píldora) siembra las 4 piezas con el
// mismo valor; `radioTema` (ajuste fino) pisa por pieza encima. Antes,
// `radius` solo alimentaba `--radius` (la escala de Tailwind del PANEL de
// gestión) — ningún componente del portal ni del widget lo leía, así que
// elegir Recto/Redondeado/Píldora no cambiaba un solo píxel visible (C1 de la
// auditoría de uso real, 2026-08-24).
function varsRadioTema(t: ThemeConfig): Record<string, string> {
  const vars: Record<string, string> = {};
  if (t.radius) {
    const preset = RADIO_PRESET_PX[t.radius];
    vars['--portal-radius-card'] = `${preset.card}px`;
    vars['--portal-radius-boton'] = `${preset.boton}px`;
    vars['--portal-radius-chip'] = `${preset.chip}px`;
    vars['--portal-radius-acceso'] = `${preset.acceso}px`;
  }
  if (!t.radioTema) return vars;
  if (t.radioTema.card !== undefined) vars['--portal-radius-card'] = `${t.radioTema.card}px`;
  if (t.radioTema.boton !== undefined) vars['--portal-radius-boton'] = `${t.radioTema.boton}px`;
  if (t.radioTema.chip !== undefined) vars['--portal-radius-chip'] = `${t.radioTema.chip}px`;
  if (t.radioTema.acceso !== undefined) vars['--portal-radius-acceso'] = `${t.radioTema.acceso}px`;
  return vars;
}

// `background` ("Fondo") → el fondo de modo DÍA del portal de siempre. Sin
// valor (null, el default — "hereda"), ninguna var: `useModo()` (lib/portal-
// modo.tsx) cae a `MODO_TOKENS.dia.bg`, el aspecto de hoy para todos los
// estudios que nunca tocaron este campo. Solo DÍA: mismo criterio que ya usa
// `paletaPortalCssText` para `/reservar` (previo al login, sin interruptor
// de modo) — Noche sigue siendo fijo hasta que se decida ese caso aparte.
function varsFondoPortal(t: ThemeConfig): Record<string, string> {
  if (!t.background) return {};
  return { '--portal-bg-dia': t.background };
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
    // A diferencia de --portal-brand-secondary (arriba), en el PANEL este color
    // se usa SIEMPRE como texto (badges, pestañas activas, iconos) — nunca como
    // superficie. Se garantiza legible aquí, no en el dato del tema (ver
    // colorLegibleSobreClaro en color-utils.ts).
    '--brand-secondary': colorLegibleSobreClaro(t.secondary),
    // Neutros y acento. Sin `--background` a propósito: era el campo "Fondo"
    // del editor, pero pintaba el PANEL de gestión (Informes, Clientas,
    // Cierre...), no el portal de las socias que la propia pantalla de
    // Apariencia promete — hallazgo C2 de la auditoría de uso real
    // (2026-08-24). El panel vuelve a su fondo fijo de siempre
    // (app/globals.css); "Fondo" ahora pinta de verdad el portal, ver
    // `varsFondoPortal` más abajo.
    '--accent': t.accent,
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
    // Barra inferior pegada abajo (Oliva y Noir) — antes que varsBarra a
    // propósito: Noir lleva las dos, y la oscura es la que manda.
    ...varsBarraClasica(t),
    // Barra inferior oscura (tema "Noir")
    ...varsBarra(t),
    // Barra flotante (tema "Bloom")
    ...varsBarraFlotante(t, marcaForeground),
    // Radio por pieza de las secciones nuevas
    ...varsRadioTema(t),
    // Fondo del portal en modo Día ("Fondo")
    ...varsFondoPortal(t),
    // Escala tipográfica por pieza (token del tema, ver theme-schema.ts)
    ...varsEscalaTexto(t),
    // Dónde se ancla la foto del estudio al recortarla para una portada.
    //
    // Va como variable CSS y no como prop porque lo consumen pantallas que no
    // reciben el `ThemeConfig`: la de acceso lee el tema publicado a través de
    // las vars, igual que el resto del portal. Quien lo use pone
    // `var(--portal-foto-pos, center center)` y así una plantilla vieja sin
    // este token sigue centrando, que es lo que hacía.
    '--portal-foto-pos': POSICION_FOTO[t.fotoEncuadre] ?? POSICION_FOTO.centro,
  };
}

/**
 * Los ajustes guardados, con los nombres de token del kit de temas en React.
 *
 * ⚠️ RETIRADO (decisión del fundador, 2026-08-27): el kit de temas
 * (`themes/registro.ts`) se borró en el PR 2 de "borrar temas del kit" — ya
 * no hay ningún `themeId` que pueda resolver un tema del kit, así que esto
 * devuelve `null` siempre. Se mantiene la función (en vez de borrarla) porque
 * sigue teniendo consumidores reales fuera de este PR (`components/theme-
 * style.tsx`, `components/theme/home-preview.tsx`), que son cirugía de PR 3.
 */
export function varsKitDelTema(raw: unknown): string | null {
  const vars = varsKitMap(raw);
  const cuerpo = Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ');
  return cuerpo ? `:root:root { ${cuerpo} }` : null;
}

/**
 * Lo mismo, como mapa.
 *
 * ⚠️ RETIRADO (decisión del fundador, 2026-08-27): siempre vacío, mismo
 * motivo que `varsKitDelTema` de arriba.
 */
export function varsKitMap(_raw: unknown): Record<string, string> {
  return {};
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

/**
 * `categoriaId` es el id real de `AJUSTES_CATEGORIAS` (theme-editor.tsx) donde
 * vive el campo causante — sin importar el tipo desde ahí para no arrastrar un
 * componente a este módulo, es un literal plano que ambos lados conocen.
 */
export interface ErrorContraste {
  mensaje: string;
  categoriaId: 'color-marca' | 'reservar-widget';
}

export interface ChequeoContraste {
  ok: boolean;
  errores: ErrorContraste[];
}

/**
 * Gate de accesibilidad al PUBLICAR: verifica los pares de color críticos a
 * WCAG AA. Se ejecuta en cliente (feedback) y se re-verifica en servidor.
 */
export function validarContrasteTheme(raw: unknown): ChequeoContraste {
  const t = resolveTheme(raw);
  const errores: ErrorContraste[] = [];
  // `background` ("Fondo") ya no pinta el panel (C2, ver varsFondoPortal) —
  // el par a proteger es el fondo EFECTIVO del portal en modo Día (el propio
  // valor si lo hay, si no el de MODO_TOKENS.dia que ya usa todo estudio sin
  // tocar este campo) contra la tinta fija de ese modo.
  const fondoPortalDia = t.background ?? MODO_TOKENS.dia.bg;
  if (!cumpleContraste(MODO_TOKENS.dia.ink, fondoPortalDia))
    errores.push({ mensaje: 'El texto del portal no contrasta bien con el fondo elegido (mínimo WCAG AA 4.5:1).', categoriaId: 'color-marca' });
  // El foreground de marca se autoderiva, así que el par marca/texto-de-marca
  // siempre cumple; validamos además la marca sobre el fondo del portal para
  // elementos como enlaces/botones fantasma que pintan `--portal-brand` ahí.
  if (!cumpleContraste(t.primary, fondoPortalDia, { grande: true }))
    errores.push({ mensaje: 'El color de marca no contrasta bien con el fondo (mínimo WCAG AA 3:1 para elementos grandes).', categoriaId: 'color-marca' });
  // Par que solo estrena la barra oscura: SOLO ahí `destacado` se pinta sobre
  // la marca (`--portal-tabbar-bg` pasa a ser `primary` en varsBarra). La
  // barra flotante también pinta sobre la marca desde que su pastilla activa
  // es de marca, pero ahí el texto es el foreground AUTODERIVADO por
  // contraste, el mismo de los botones — cumple por construcción y no
  // necesita gate.
  if (t.barraOscura && !cumpleContraste(colorDestacado(t), t.primary, { grande: true }))
    errores.push({ mensaje: 'Con la barra oscura, el color destacado no contrasta con la marca (mínimo 3:1).', categoriaId: 'color-marca' });
  // Fase 1 rediseño del widget (docs/widget-reservas-theme-builder-diseno.md
  // §2.2): solo se valida cuando el estudio TOCA el par — con ambos en `null`
  // el widget cae a MODO_TOKENS.dia/.noche, ya cubierto por
  // portal-paleta.test.ts, y no hace falta reconstruir aquí ese default para
  // validar algo que ya se sabe correcto.
  if (t.widgetTinta && t.widgetSuperficie && !cumpleContraste(t.widgetTinta, t.widgetSuperficie))
    errores.push({ mensaje: 'El texto del widget no contrasta bien con la superficie elegida (mínimo WCAG AA 4.5:1).', categoriaId: 'reservar-widget' });
  if (t.widgetTinta && typeof t.widgetFondo === 'string' && t.widgetFondo !== 'transparente'
    && !cumpleContraste(t.widgetTinta, t.widgetFondo))
    errores.push({ mensaje: 'El texto del widget no contrasta bien con el fondo elegido (mínimo WCAG AA 4.5:1).', categoriaId: 'reservar-widget' });
  // NO se valida aquí `secondary` en general: en Oliva/Bloom/Noir es una
  // "superficie suave" a propósito (ver comentario en THEME_DEFINITIONS de
  // noir), no necesariamente texto — y algunos tests de este módulo lo usan
  // como valor de prueba aislado para el par destacado/marca de arriba, sin
  // relación con su legibilidad como texto. La legibilidad de `--brand-secondary`
  // como texto del PANEL (badges, pestañas) se garantiza en el punto donde se
  // aplica esa variable (`aplicarMarca` en panel-theme.tsx / themeToVarMap
  // aquí abajo), no en este gate compartido — ver `colorLegibleSobreClaro`.
  return { ok: errores.length === 0, errores };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cuántos cambios sin publicar
// ═══════════════════════════════════════════════════════════════════════════
//
// Reubicado desde `components/theme/theme-library.tsx` (la galería de temas
// instalables, borrada en el PR 2 de "borrar temas del kit") — esta función
// no tiene nada que ver con la galería: compara el borrador contra lo
// publicado para el contador de "N cambios sin publicar" del editor a
// pantalla completa (`theme-editor-fullscreen.tsx`), que sigue vivo.

/** Los campos del tema que de verdad cambian lo que ve una socia. */
const CAMPOS_VISIBLES = [
  'primary', 'secondary', 'accent', 'background', 'text',
  'fontId', 'portalHeadingFontId', 'radius', 'buttonStyle', 'cardStyle',
  'tabBarStyle', 'barraOscura', 'barraFlotante', 'destacado', 'faviconUrl',
  // `radioTema` y `variantes` (objetos) quedan fuera a propósito, mismo
  // criterio que `navPortal`/`redesSociales`: comparar por referencia daría
  // falsos positivos (el fetch siempre crea un objeto nuevo), y el contador
  // se quedaría clavado en "1 cambio sin publicar" para siempre.
] as const satisfies readonly (keyof ThemeConfig)[];

/**
 * Cuántos de esos campos difieren entre el borrador y lo publicado. Se compara
 * campo a campo y no con un igual profundo del objeto entero para poder decir
 * "3 cambios sin publicar" en vez de un "hay cambios" sin cuerpo — y porque
 * metadatos como `themeCustomized` cambian sin que la socia note nada.
 */
export function contarCambios(borrador: ThemeConfig, publicado: ThemeConfig | null): number {
  if (!publicado) return 0;
  return CAMPOS_VISIBLES.filter((k) => borrador[k] !== publicado[k]).length;
}
