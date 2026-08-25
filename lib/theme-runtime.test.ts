import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foregroundParaFondo,
  themeToCssVars,
  themeToCssText,
  validarContrasteTheme,
  presetAThemeConfig,
  varsKitDelTema,
} from './theme-runtime.ts';
import { DEFAULT_THEME, themeConfigSchema } from './theme-schema.ts';
import { varsRadioSobreTema, varsSombraSobreTema } from '../themes/registro.ts';
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


// ── El puente al kit de temas en React ──────────────────────────────────────
//
// Contexto de por qué existen estos tests: los dos portales no comparten
// vocabulario, y el fichero de cada tema declara sus tokens en
// `html[data-theme="…"]`. Se midió en el navegador que inyectar
// `:root{--brand:red}` NO movía nada — la propietaria cambiaba el color en
// Apariencia, lo veía cambiar en la vista previa (que monta el portal viejo) y
// sus socias seguían viendo el de fábrica.

test('varsKitDelTema: un tema del kit sale con los nombres de token del kit', () => {
  const css = varsKitDelTema({ ...DEFAULT_THEME, themeId: 'tentada', primary: '#B03060', background: '#FFF5F8', text: '#221122' });
  assert.ok(css);
  assert.match(css, /--brand: #B03060;/);
  assert.match(css, /--bg: #FFF5F8;/);
  assert.match(css, /--ink: #221122;/);
  // Y NO los del portal de siempre: ese bloque lo emite `themeToCssText`.
  assert.doesNotMatch(css, /--portal-brand/);
});

test('⚠️ varsKitDelTema: el selector es `:root:root` — `:root` PIERDE contra `html[data-theme="…"]`', () => {
  const css = varsKitDelTema({ ...DEFAULT_THEME, themeId: 'tentada' });
  assert.ok(css?.startsWith(':root:root {'));
});

test('varsKitDelTema: un tema que no es del kit no emite nada, ni un bloque vacío', () => {
  assert.equal(varsKitDelTema({ ...DEFAULT_THEME, themeId: 'classic' }), null);
  assert.equal(varsKitDelTema({ ...DEFAULT_THEME, themeId: 'no-existe' }), null);
});

test('varsKitDelTema: el texto sobre la marca se deriva por contraste, no se pide', () => {
  const claro = varsKitDelTema({ ...DEFAULT_THEME, themeId: 'tentada', primary: '#FFFFFF' });
  const oscuro = varsKitDelTema({ ...DEFAULT_THEME, themeId: 'tentada', primary: '#000000' });
  assert.match(claro!, /--on-brand: #1[0-9A-Fa-f]{5}|--on-brand: #0/);
  assert.match(oscuro!, /--on-brand: #[Ff]/);
});

test('⚠️ varsRadioSobreTema: el token es `--radius-quick-link`, no `--radius-quick`', () => {
  // Escribía `--radius-quick`, que no existe en ningún tema: el radio de los
  // accesos rápidos no habría hecho nada aunque alguien hubiera llamado a esto
  // (y nadie lo llamaba).
  const v = varsRadioSobreTema({ acceso: 12 });
  assert.equal(v['--radius-quick-link'], '12px');
  assert.equal(v['--radius-quick'], undefined);
});


// ── Los dos fallos que se vieron en el HTML de PRODUCCIÓN, no aquí ──────────
//
// El puente se mergeó con los dos dentro y estuvo sirviéndolos. Salieron al
// mirar lo que `www.tentare.app/portal/tentare/home` devolvía de verdad —
// ninguna de estas dos cosas la habría cazado un test que no existía.

test('⚠️ el ACENTO no se traduce: en el panel es un fondo pálido y en el kit es tinta', () => {
  const css = varsKitDelTema({ ...DEFAULT_THEME, themeId: 'tentada', accent: '#F0EDE1' });
  // Producción servía `--accent: #F0EDE1` —el crema del editor— donde el tema
  // pone su verde. En Noir habría metido ese crema donde va el dorado.
  assert.doesNotMatch(css!, /--accent:/);
});

test('⚠️ sin desviación real, la escala NO se toca — un paso mal mapeado inflaba TODO', () => {
  // `numeroBono` (60px, el numerazo del saldo del portal viejo) se comparaba
  // con `pass-number` del kit (18px): cociente 3.33 que, promediado con los
  // demás, subía toda la escala un 47 %. El saludo de Tentada salía a 64.5px
  // en vez de a 44 en el HTML que servía producción.
  const css = varsKitDelTema({
    ...DEFAULT_THEME, themeId: 'tentada',
    escalaTexto: { seccion: 20, tituloPantalla: 26, saludo: 44, tituloHero: 25, bienvenida: 25, numeroBono: 60 },
  });
  assert.doesNotMatch(css ?? '', /--size-/);
});

test('la escala SÍ se toca cuando la propietaria la mueve de verdad', () => {
  const css = varsKitDelTema({
    ...DEFAULT_THEME, themeId: 'tentada',
    escalaTexto: { seccion: 30, tituloPantalla: 39, saludo: 66, tituloHero: 37.5, bienvenida: 37.5 },
  });
  assert.match(css!, /--size-greeting: 66px;/);
});

// ── Fase 1 de llevar el kit hacia el editor real: `cardStyle` → sombra ──────
//
// Antes, elegir "Elevada"/"Con borde" en la categoría "Tarjetas" del editor
// no cambiaba NADA en el preview de un tema del kit — el campo existía y se
// guardaba, pero nada del lado del kit lo leía. `varsSombraSobreTema` es el
// primer campo del kit derivado de un ajuste "de siempre" YA existente, en
// vez de un ajuste nuevo — mismo criterio que ya usan color/radio/escala.

test('varsSombraSobreTema: "flat" (el default) no declara nada — el tema conserva su propia sombra', () => {
  assert.deepEqual(varsSombraSobreTema('flat', '#221122'), {});
  assert.deepEqual(varsSombraSobreTema(undefined, '#221122'), {});
});

test('varsSombraSobreTema: "elevated" tiñe la sombra con la tinta del tema, no un negro plano', () => {
  const v = varsSombraSobreTema('elevated', '#221122');
  assert.match(v['--shadow-card'], /#221122/);
  assert.match(v['--shadow-card-hover'], /#221122/);
  assert.notEqual(v['--shadow-card'], 'none');
});

test('varsSombraSobreTema: "bordered" apaga la sombra — el borde del kit ya está siempre puesto', () => {
  assert.deepEqual(varsSombraSobreTema('bordered', '#221122'), {
    '--shadow-card': 'none', '--shadow-card-hover': 'none',
  });
});

test('varsKitDelTema: cardStyle "elevated" de un tema del kit sí llega al preview', () => {
  const css = varsKitDelTema({ ...DEFAULT_THEME, themeId: 'sereno', cardStyle: 'elevated', text: '#332211' });
  assert.match(css!, /--shadow-card: 0 12px 26px -18px color-mix\(in srgb, #332211 32%, transparent\);/);
});

test('varsKitDelTema: cardStyle "flat" no pisa la sombra propia del tema (sin --shadow-card en el bloque inyectado)', () => {
  const css = varsKitDelTema({ ...DEFAULT_THEME, themeId: 'sereno', cardStyle: 'flat' });
  assert.doesNotMatch(css!, /--shadow-card:/);
});
