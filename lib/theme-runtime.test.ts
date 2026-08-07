import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foregroundParaFondo,
  themeToCssVars,
  themeToCssText,
  validarContrasteTheme,
  presetAThemeConfig,
} from './theme-runtime.ts';
import { DEFAULT_THEME, themeConfigSchema } from './theme-schema.ts';

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
    background: '#FFFFFF',
    text: '#111111',
    fontId: 'inter',
    radius: 'pill',
    faviconUrl: null,
  }) as Record<string, string>;
  assert.equal(vars['--portal-brand'], '#0F766E');
  assert.equal(vars['--brand'], '#0F766E');
  assert.equal(vars['--portal-brand-secondary'], '#FF7F50');
  assert.equal(vars['--background'], '#FFFFFF');
  assert.equal(vars['--foreground'], '#111111');
  assert.equal(vars['--radius'], '2rem'); // pill
  assert.match(vars['--font-sans'], /font-inter/);
  // foreground de marca autoderivado por contraste (teal oscuro → blanco)
  assert.equal(vars['--portal-brand-foreground'], '#FFFFFF');
  assert.equal(vars['--brand-foreground'], '#FFFFFF');
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
  const r = validarContrasteTheme({ ...DEFAULT_THEME, text: '#111111', background: '#FFFFFF', primary: '#0F766E' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('validarContrasteTheme: texto sin contraste falla con mensaje', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, text: '#EEEEEE', background: '#FFFFFF' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('texto')));
});

// `secondary` se usa por todo el panel/portal como color de TEXTO sobre fondos
// claros (nunca como relleno sólido) — antes de este par, un `secondary` pastel
// (p.ej. #C4B5FD del preset "Ciruela") pasaba el gate sin avisar y quedaba
// invisible en el badge "Recomendación" y en las pestañas de Membresías.
test('validarContrasteTheme: secundario pastel sin contraste falla con mensaje', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, secondary: '#C4B5FD', background: '#FFFFFF' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('secundario')));
});

test('validarContrasteTheme: secundario oscuro (post-fix del preset Ciruela) pasa el gate', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, secondary: '#402964', background: '#FFFFFF' });
  assert.equal(r.ok, true);
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
