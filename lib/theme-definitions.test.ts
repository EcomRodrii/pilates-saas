import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DEFINITIONS, getThemeDefinition } from './theme-definitions.ts';
import { themeDraftSchema, themeConfigSchema, DEFAULT_THEME } from './theme-schema.ts';
import { validarContrasteTheme, themeToCssVars } from './theme-runtime.ts';

// ⚠️ RETIRADO (decisión del fundador, 2026-08-27): este fichero probaba
// "Tentada", "Oliva", "Bloom", "Noir" y "Sereno" — los cinco temas del kit de
// diseño, borrados enteros en el PR 2 de "borrar temas del kit". Solo queda
// `classic` en `THEME_DEFINITIONS`, así que los guardias que recorrían el
// registro ENTERO (ThemeDraft válido, ThemeConfig completo, gate de
// contraste) siguen aquí tal cual — siguen siendo la red de seguridad de
// cualquier tema futuro — pero todas las aserciones específicas de un tema
// concreto (paleta, radioTema, escalaTexto, variantes, barra…) se retiran con
// sus temas.

test('THEME_DEFINITIONS: ids únicos, y "classic" existe con defaults vacíos (el tema de siempre)', () => {
  const ids = THEME_DEFINITIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const clasico = getThemeDefinition('classic');
  assert.ok(clasico);
  assert.deepEqual(clasico!.defaults, {});
  assert.deepEqual(clasico!.capabilities, []);
});

test('THEME_DEFINITIONS: cada "defaults" es un ThemeDraft válido (nada que rompa al aplicarlo)', () => {
  for (const def of THEME_DEFINITIONS) {
    const r = themeDraftSchema.safeParse(def.defaults);
    assert.equal(r.success, true, `defaults de "${def.id}" no es un ThemeDraft válido`);
  }
});

test('getThemeDefinition: id desconocido → undefined', () => {
  assert.equal(getThemeDefinition('no-existe'), undefined);
});

test('THEME_DEFINITIONS: cada tema aplicado sobre DEFAULT_THEME es un ThemeConfig completo válido', () => {
  for (const def of THEME_DEFINITIONS) {
    const r = themeConfigSchema.safeParse({ ...DEFAULT_THEME, ...def.defaults });
    assert.equal(r.success, true, `El tema "${def.id}" no valida contra themeConfigSchema`);
  }
});

test('THEME_DEFINITIONS: todos los temas pasan el gate de contraste, sin retocar colores', () => {
  for (const def of THEME_DEFINITIONS) {
    const chequeo = validarContrasteTheme({ ...DEFAULT_THEME, ...def.defaults });
    assert.equal(chequeo.ok, true, `El tema "${def.id}" no pasa el contraste: ${chequeo.errores.map((e) => e.mensaje).join(' / ')}`);
  }
});

test('la biblioteca es solo "classic" — el kit de temas se retiró entero', () => {
  assert.deepEqual(THEME_DEFINITIONS.map((t) => t.id), ['classic']);
});

// ⚠️ Antes había una guardia que exigía lo contrario ("siguen estando los
// temas anteriores"), porque borrar un id deja sin nombre al estudio que lo
// tenga guardado. Se retiran igualmente por decisión de producto — lo que sí
// sigue prohibido es RECICLAR un id: a un estudio con 'tentada' (o
// 'editorial', de una tanda aún anterior) guardado le cambiaría el tema por
// sorpresa, que es mucho peor que quedarse sin nombre.
test('los ids retirados no se reciclan para otro tema', () => {
  for (const id of ['geometric', 'editorial', 'tentada', 'oliva', 'bloom', 'noir', 'sereno']) {
    assert.equal(getThemeDefinition(id), undefined, `"${id}" ha vuelto al registro`);
  }
});

test('validarContrasteTheme: sin barra oscura, el par destacado/marca no se comprueba', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, destacado: DEFAULT_THEME.primary, barraOscura: false });
  assert.equal(r.ok, true);
});

test('validarContrasteTheme: sin `destacado`, el gate cae a `secondary` (tema guardado antes de esta fase)', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, barraOscura: true, secondary: '#FFFFFF', destacado: null });
  assert.equal(r.ok, true); // blanco sobre el primary por defecto sí contrasta
});

test('un estudio sin tema instalado conserva la píldora blanca de siempre', () => {
  // La regresión que más caro saldría: estos vars no deben declararse salvo
  // que el estudio los pida de verdad — ya no hay ningún tema de fábrica que
  // los fije por él.
  const v = themeToCssVars(DEFAULT_THEME) as Record<string, string>;
  for (const clave of ['--portal-tabbar-active-bg', '--portal-tabbar-active-shadow',
                       '--portal-tabbar-active-fg', '--portal-tabbar-border']) {
    assert.equal(v[clave], undefined, clave);
  }
});

test('un estudio sin tema instalado no declara ninguna var de escala de texto', () => {
  const v = themeToCssVars(DEFAULT_THEME) as Record<string, string>;
  assert.equal(Object.keys(v).some((k) => k.startsWith('--portal-text-')), false);
});
