import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DEFINITIONS, getThemeDefinition } from './theme-definitions.ts';
import { themeDraftSchema, themeConfigSchema, DEFAULT_THEME } from './theme-schema.ts';
import { validarContrasteTheme } from './theme-runtime.ts';

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

test('getThemeDefinition: "geometric" fija portalHeadingFontId a outfit y declara la capability', () => {
  const geo = getThemeDefinition('geometric');
  assert.ok(geo);
  assert.equal(geo!.defaults.portalHeadingFontId, 'outfit');
  assert.ok(geo!.capabilities.includes('typography'));
});

test('getThemeDefinition: id desconocido → undefined', () => {
  assert.equal(getThemeDefinition('no-existe'), undefined);
});

test('getThemeDefinition: "editorial" fija tipografía negrita, botón/tarjeta y barra de pestaña activa', () => {
  const ed = getThemeDefinition('editorial');
  assert.ok(ed);
  assert.equal(ed!.defaults.portalHeadingFontId, 'instrumentSansBold');
  assert.equal(ed!.defaults.buttonStyle, 'solid');
  assert.equal(ed!.defaults.cardStyle, 'elevated');
  assert.equal(ed!.defaults.tabBarStyle, 'pestanaActiva');
  assert.deepEqual(ed!.capabilities.sort(), ['buttons', 'cards', 'nav', 'typography']);
});

// ── Tanda Oliva/Bloom/Noir ──────────────────────────────────────────────────
// Estas dos guardias recorren el registro ENTERO, no los temas que hay hoy:
// cualquier tema futuro tiene que pasar por aquí. Un tema que no valide contra
// el schema completo, o que no pase el gate de contraste, sería imposible de
// publicar desde el editor — mejor que falle en CI que en la cara de la
// propietaria.

test('THEME_DEFINITIONS: cada tema aplicado sobre DEFAULT_THEME es un ThemeConfig completo válido', () => {
  for (const def of THEME_DEFINITIONS) {
    const r = themeConfigSchema.safeParse({ ...DEFAULT_THEME, ...def.defaults });
    assert.equal(r.success, true, `El tema "${def.id}" no valida contra themeConfigSchema`);
  }
});

test('THEME_DEFINITIONS: todos los temas pasan el gate de contraste, sin retocar colores', () => {
  for (const def of THEME_DEFINITIONS) {
    const chequeo = validarContrasteTheme({ ...DEFAULT_THEME, ...def.defaults });
    assert.equal(chequeo.ok, true, `El tema "${def.id}" no pasa el contraste: ${chequeo.errores.join(' / ')}`);
  }
});

test('THEME_DEFINITIONS: siguen estando los temas anteriores a esta tanda', () => {
  // Un estudio que ya eligió `geometric`/`editorial` tiene ese id guardado en su
  // ThemeConfig; borrarlos del registro dejaría su tema sin nombre en la galería.
  for (const id of ['classic', 'geometric', 'editorial', 'oliva', 'bloom', 'noir']) {
    assert.ok(getThemeDefinition(id), `Falta el tema "${id}" en el registro`);
  }
});

test('Noir es el único que pide barra oscura; Bloom el único que pide barra flotante', () => {
  assert.equal(getThemeDefinition('noir')!.defaults.barraOscura, true);
  assert.equal(THEME_DEFINITIONS.filter((t) => t.defaults.barraOscura).length, 1);
  assert.equal(getThemeDefinition('bloom')!.defaults.barraFlotante, true);
  assert.equal(THEME_DEFINITIONS.filter((t) => t.defaults.barraFlotante).length, 1);
});

test('Oliva y Noir piden barra clásica; Bloom no la pide (sigue flotando)', () => {
  assert.equal(getThemeDefinition('oliva')!.defaults.barraClasica, true);
  assert.equal(getThemeDefinition('noir')!.defaults.barraClasica, true);
  assert.ok(!getThemeDefinition('bloom')!.defaults.barraClasica);
  assert.equal(THEME_DEFINITIONS.filter((t) => t.defaults.barraClasica).length, 2);
});

// Valores exactos del prototipo real (paleta() → radCard/radBoton), leído vía
// el MCP claude_design — ver harmonic-discovering-kettle.md. Antes de esta
// ronda solo Bloom traía `radioTema` (y solo `card`), así que Button.tsx/
// Card.tsx (usados en TODO el portal) nunca reflejaban ninguna diferencia
// real entre temas — "todos iguales pero de otro color".
test('radioTema completo (card+boton) por tema, con los valores exactos del prototipo', () => {
  assert.deepEqual(getThemeDefinition('oliva')!.defaults.radioTema, { card: 26, boton: 20 });
  assert.deepEqual(getThemeDefinition('bloom')!.defaults.radioTema, { card: 30, boton: 999 });
  assert.deepEqual(getThemeDefinition('noir')!.defaults.radioTema, { card: 24, boton: 18 });
});

test('cardStyle: solo Bloom tiene sombra de tarjeta — Oliva y Noir son planas, como el prototipo', () => {
  assert.equal(getThemeDefinition('oliva')!.defaults.cardStyle, 'flat');
  assert.equal(getThemeDefinition('bloom')!.defaults.cardStyle, 'elevated');
  assert.equal(getThemeDefinition('noir')!.defaults.cardStyle, 'flat');
});

test('validarContrasteTheme: con barra oscura, un destacado ilegible sobre la marca se rechaza', () => {
  const malo = validarContrasteTheme({
    ...DEFAULT_THEME, ...getThemeDefinition('noir')!.defaults,
    destacado: '#1E2B22', // casi el mismo verde que la marca: invisible como icono activo
  });
  assert.equal(malo.ok, false);
  assert.ok(malo.errores.some((e) => e.includes('destacado')));
});

test('validarContrasteTheme: con barra flotante (sin oscura), el par destacado/marca NO se comprueba', () => {
  // Solo `barraOscura` pinta `--portal-tabbar-bg` como la marca (varsBarra);
  // la barra flotante deja el fondo de la pastilla activa en su claro de
  // siempre — `destacado` nunca se pinta sobre `primary` ahí.
  const r = validarContrasteTheme({
    ...DEFAULT_THEME, ...getThemeDefinition('bloom')!.defaults,
    destacado: getThemeDefinition('bloom')!.defaults.primary, // a propósito, ilegible SI se comprobara
  });
  assert.equal(r.ok, true);
});

test('validarContrasteTheme: sin barra oscura, ese par no se comprueba', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, destacado: DEFAULT_THEME.primary, barraOscura: false });
  assert.equal(r.ok, true);
});

test('validarContrasteTheme: sin `destacado`, el gate cae a `secondary` (tema guardado antes de esta fase)', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, barraOscura: true, secondary: '#FFFFFF', destacado: null });
  assert.equal(r.ok, true); // blanco sobre el primary por defecto (oliva oscuro) sí contrasta
});

test('THEME_DEFINITIONS: bloquesHome de Oliva/Bloom/Noir solo referencia ids reales de bloques sistema', () => {
  const idsValidos = new Set(['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio', 'listadoClases', 'listadoBonos', 'tiraSemana', 'progresoSemanal', 'retos']);
  for (const id of ['oliva', 'bloom', 'noir']) {
    const def = getThemeDefinition(id)!;
    assert.ok(def.bloquesHome && def.bloquesHome.length > 0, `"${id}" no trae bloquesHome`);
    for (const b of def.bloquesHome!) {
      assert.ok(idsValidos.has(b), `"${id}" referencia un id de bloque desconocido: "${b}"`);
    }
  }
  // Retos sí se construyó de verdad (conteo real, ver lib/retos-portal.ts) —
  // Bloom lo instala primero, antes de "Accesos rápidos".
  assert.deepEqual(getThemeDefinition('bloom')!.bloquesHome, ['retos', 'accesosRapidos', 'contenidoEstudio']);
});
