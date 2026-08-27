import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foregroundParaFondo,
  themeToCssVars,
  themeToCssText,
  validarContrasteTheme,
  presetAThemeConfig,
  varsKitDelTema,
  varsKitMap,
} from './theme-runtime.ts';
import { DEFAULT_THEME, themeConfigSchema } from './theme-schema.ts';
import { cumpleContraste } from './wcag-contrast.ts';

test('foregroundParaFondo: blanco sobre fondo oscuro, negro sobre fondo claro', () => {
  assert.equal(foregroundParaFondo('#131313'), '#FFFFFF');
  assert.equal(foregroundParaFondo('#FFFFFF'), '#131313');
  assert.equal(foregroundParaFondo('#0F766E'), '#FFFFFF'); // teal oscuro
});

test('themeToCssVars: mapea el tema a las CSS vars que consume la app', () => {
  const vars = themeToCssVars({
    primary: '#0F766E',
    secondary: '#FF7F50',
    accent: '#F5E6CA',
    background: null,
    text: '#111111',
    fontId: 'inter',
    radius: 'pill',
    faviconUrl: null,
  }) as Record<string, string>;
  assert.equal(vars['--portal-brand'], '#0F766E');
  assert.equal(vars['--brand'], '#0F766E');
  assert.equal(vars['--portal-brand-secondary'], '#FF7F50');
  assert.equal(vars['--foreground'], '#111111');
  assert.equal(vars['--radius'], '2rem'); // pill
  assert.match(vars['--font-sans'], /font-inter/);
  // foreground de marca autoderivado por contraste (teal oscuro → blanco)
  assert.equal(vars['--portal-brand-foreground'], '#FFFFFF');
  assert.equal(vars['--brand-foreground'], '#FFFFFF');
});

// C2 de la auditoría de uso real (2026-08-24): "Fondo" pintaba el PANEL de
// gestión (--background), no el portal de las socias que la propia pantalla
// de Apariencia promete. Se retiró del panel (vuelve a su fondo fijo de
// app/globals.css) y se conectó de verdad al portal de siempre, en modo Día.
test('themeToCssVars: ya no existe `--background` (pintaba el panel, no el portal)', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME, background: '#101820' }) as Record<string, string>;
  assert.equal(vars['--background'], undefined);
});

test('themeToCssVars: sin `background` (hereda), ninguna var de fondo del portal', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME }) as Record<string, string>;
  assert.equal(vars['--portal-bg-dia'], undefined);
});

test('themeToCssVars: `background` declara el fondo de modo Día del portal', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME, background: '#101820' }) as Record<string, string>;
  assert.equal(vars['--portal-bg-dia'], '#101820');
});

test('themeToCssVars: valores crudos/parciales caen a default por token', () => {
  const vars = themeToCssVars({ primary: 'basura' }) as Record<string, string>;
  assert.equal(vars['--portal-brand'], DEFAULT_THEME.primary);
});

test('themeToCssText: envuelve las vars en el selector dado', () => {
  const css = themeToCssText(DEFAULT_THEME, ':root');
  assert.match(css, /^:root \{/);
  assert.match(css, /--portal-brand: #343825;/);
  assert.match(css, /--radius: 1rem;/); // rounded
  const scoped = themeToCssText(DEFAULT_THEME, '.portal-scope');
  assert.match(scoped, /^\.portal-scope \{/);
});

test('validarContrasteTheme: tema legible pasa el gate', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, text: '#111111', background: null, primary: '#0F766E' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

// C2: el par que protege este gate ya no es t.text/t.background (t.background
// dejó de pintar nada del panel) — es la tinta FIJA del portal en modo Día
// (MODO_TOKENS.dia.ink) contra el "Fondo" elegido, que es justo el bug que
// motivó la auditoría: se podía publicar un fondo ilegible sin ningún aviso.
test('validarContrasteTheme: sin `background` (hereda), el gate pasa siempre — MODO_TOKENS.dia ya cumple', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, background: null });
  assert.equal(r.ok, true);
});

test('validarContrasteTheme: un `background` sin contraste con la tinta del portal falla con mensaje', () => {
  // Cercano a MODO_TOKENS.dia.ink ('#22261F') — el mismo tono oscuro que la
  // tinta fija de texto del portal, ratio ~1:1, ilegible.
  const r = validarContrasteTheme({ ...DEFAULT_THEME, background: '#242822' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.mensaje.includes('portal')));
  // C4 de la auditoría de uso real (2026-08-25): cada error lleva la categoría
  // real del editor donde vive el campo causante — sin esto, la propietaria
  // no tenía forma de saber dónde corregirlo.
  assert.ok(r.errores.every((e) => e.categoriaId === 'color-marca'));
});

test('validarContrasteTheme: un error del widget lleva categoriaId "reservar-widget"', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, widgetTinta: '#22261F', widgetSuperficie: '#22261F' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.categoriaId === 'reservar-widget' && e.mensaje.includes('widget')));
});

// `secondary` NO se valida en este gate a propósito — en Oliva/Bloom/Noir es una
// "superficie suave" deliberadamente pastel, no texto (ver THEME_DEFINITIONS).
// Su legibilidad como texto del PANEL se garantiza en themeToVarMap
// (--brand-secondary vía colorLegibleSobreClaro), comprobado más abajo.
test('themeToVarMap (vía themeToCssVars): --brand-secondary de un tema con secondary pastel (Ciruela) sale legible; --portal-brand-secondary conserva el original', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME, secondary: '#C4B5FD', background: '#FFFFFF' }) as Record<string, string>;
  assert.equal(vars['--portal-brand-secondary'], '#C4B5FD');
  assert.notEqual(vars['--brand-secondary'], '#C4B5FD');
  assert.equal(cumpleContraste(vars['--brand-secondary'], '#FFFFFF', { grande: true }), true);
});

test('themeToVarMap: --brand-secondary de un secondary ya legible no se toca', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME, secondary: '#402964', background: '#FFFFFF' }) as Record<string, string>;
  assert.equal(vars['--brand-secondary'], '#402964');
});

test('presetAThemeConfig: deriva un tema válido del preset viejo', () => {
  const t = presetAThemeConfig('teal');
  assert.equal(themeConfigSchema.safeParse(t).success, true);
  assert.equal(t.primary, '#0F766E'); // primary del preset teal
  assert.equal(t.fontId, 'jakarta'); // resto = default
});

test('presetAThemeConfig: preset desconocido/null → deriva del preset Original', () => {
  const t = presetAThemeConfig(null);
  assert.equal(t.primary, DEFAULT_THEME.primary);
});

test('themeToCssVars: buttonStyle/cardStyle por defecto (solid/flat) no declaran las vars de tarjeta', () => {
  const vars = themeToCssVars(DEFAULT_THEME) as Record<string, string>;
  // solid SÍ declara sus 3 vars (reproducen --portal-brand con border:none)
  assert.equal(vars['--portal-btn-bg'], DEFAULT_THEME.primary);
  assert.equal(vars['--portal-btn-border'], 'none');
  // flat NO declara nada a propósito: Card.tsx cae a su fallback (t.line)
  assert.equal('--portal-card-border' in vars, false);
  assert.equal('--portal-card-shadow' in vars, false);
});

test('themeToCssVars: buttonStyle outline/soft cambian fondo y borde del botón', () => {
  const outline = themeToCssVars({ ...DEFAULT_THEME, buttonStyle: 'outline' }) as Record<string, string>;
  assert.equal(outline['--portal-btn-bg'], 'transparent');
  assert.equal(outline['--portal-btn-fg'], DEFAULT_THEME.primary);
  assert.match(outline['--portal-btn-border'], /1px solid/);

  const soft = themeToCssVars({ ...DEFAULT_THEME, buttonStyle: 'soft' }) as Record<string, string>;
  assert.equal(soft['--portal-btn-border'], 'none');
  // rgba(), no color-mix(): Safari <16.2 no soporta color-mix() y el botón
  // "soft" se quedaba sin fondo (M-4).
  assert.match(soft['--portal-btn-bg'], /^rgba\(\d+, \d+, \d+, 0\.15\)$/);
});

test('themeToCssVars: cardStyle elevated/bordered declaran borde/sombra distintos', () => {
  const elevated = themeToCssVars({ ...DEFAULT_THEME, cardStyle: 'elevated' }) as Record<string, string>;
  assert.equal(elevated['--portal-card-border'], 'none');
  assert.notEqual(elevated['--portal-card-shadow'], 'none');

  const bordered = themeToCssVars({ ...DEFAULT_THEME, cardStyle: 'bordered' }) as Record<string, string>;
  assert.equal(bordered['--portal-card-shadow'], 'none');
  assert.match(bordered['--portal-card-border'], /solid/);
});

test('themeToCssVars: portalHeadingFontId por defecto (instrumentSerif) no declara vars de titular', () => {
  const vars = themeToCssVars(DEFAULT_THEME) as Record<string, string>;
  assert.equal('--portal-heading-font' in vars, false);
  assert.equal('--portal-heading-weight' in vars, false);
});

test('themeToCssVars: portalHeadingFontId "outfit" declara fuente y peso 600', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME, portalHeadingFontId: 'outfit' }) as Record<string, string>;
  assert.match(vars['--portal-heading-font'], /Outfit/);
  assert.equal(vars['--portal-heading-weight'], '600');
});

test('themeToCssVars: portalHeadingFontId "instrumentSansBold" reusa --font-ui, peso 700 (tema Editorial)', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME, portalHeadingFontId: 'instrumentSansBold' }) as Record<string, string>;
  assert.match(vars['--portal-heading-font'], /--font-ui/);
  assert.equal(vars['--portal-heading-weight'], '700');
});

// ── Variantes de forma: la única que cabe en una CSS var ────────────────────

test('themeToCssVars: sin `radioTema`, ninguna var de radio — el aspecto de siempre, para todos', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME }) as Record<string, string>;
  assert.equal(vars['--portal-radius-acceso'], undefined);
});

// Ninguna otra variante de forma produce CSS: todas deciden qué elementos
// EXISTEN en el DOM y viajan como prop JS (ver theme-variantes.ts). El icono
// activo relleno también, porque la única var candidata la emitiría
// ThemeStyle (componente de servidor) y no llegaría al preview ni a los e2e.
test('themeToCssVars: `variantes` no emite ninguna var — se resuelven en JS', () => {
  const con = themeToCssVars({ ...DEFAULT_THEME, variantes: { barra: 'todasRelleno', accesosRapidos: 'circulos' } });
  const sin = themeToCssVars({ ...DEFAULT_THEME });
  assert.deepEqual(con, sin);
});

test('themeToCssVars: `radioTema.acceso` declara el radio de la baldosa de accesos', () => {
  const vars = themeToCssVars({ ...DEFAULT_THEME, radioTema: { acceso: 22 } }) as Record<string, string>;
  assert.equal(vars['--portal-radius-acceso'], '22px');
});

test('themeToCssVars: --portal-foto-pos sale del encuadre elegido', () => {
  // La pantalla de acceso y el hero del Inicio no reciben el ThemeConfig:
  // leen esta variable. Si deja de salir, la portada vuelve a centrarse
  // siempre y el ajuste del editor no hace nada visible — sin error alguno.
  const pos = (t: unknown) => (themeToCssVars(t) as Record<string, string>)['--portal-foto-pos'];
  assert.equal(pos({ ...DEFAULT_THEME, fotoEncuadre: 'arriba' }), 'center top');
  assert.equal(pos({ ...DEFAULT_THEME, fotoEncuadre: 'abajo' }), 'center bottom');
  // Y un tema guardado antes de que este token existiera sigue centrando.
  const sinToken = { ...DEFAULT_THEME } as Record<string, unknown>;
  delete sinToken.fotoEncuadre;
  assert.equal(pos(sinToken), 'center center');
});


// ── El puente al kit de temas en React (RETIRADO) ───────────────────────────
//
// Decisión del fundador (2026-08-27): el sistema de temas del kit se retira
// por completo (PR 2 de "borrar temas del kit"). `themes/registro.ts` —de
// donde salían `varsRadioSobreTema`/`varsSombraSobreTema` y el resto del
// vocabulario del kit— se borró entero, así que los tests que comparaban su
// CSS token a token (nombres de variable, colores derivados, escala…) ya no
// tienen nada que probar. Quedan estos dos, que documentan que
// `varsKitDelTema`/`varsKitMap` siguen existiendo (los siguen llamando
// `components/theme-style.tsx` y `components/theme/home-preview.tsx`, PR 3)
// pero ya no emiten nada, para cualquier `themeId`.

test('varsKitDelTema: ya no emite nada para ningún themeId — el kit se retiró', () => {
  assert.equal(varsKitDelTema({ ...DEFAULT_THEME, themeId: 'classic' }), null);
  assert.equal(varsKitDelTema({ ...DEFAULT_THEME, themeId: 'tentada' }), null);
  assert.equal(varsKitDelTema({ ...DEFAULT_THEME, themeId: 'no-existe' }), null);
});

test('varsKitMap: siempre vacío, mismo motivo', () => {
  assert.deepEqual(varsKitMap({ ...DEFAULT_THEME, themeId: 'sereno' }), {});
});
