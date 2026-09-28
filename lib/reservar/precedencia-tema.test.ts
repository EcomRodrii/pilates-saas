import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARCA_DEL_ESTUDIO_EN_LINEA, TEMA_APP_RESERVAR_POR_DEFECTO, paletaEfectivaReservar, varsTipografiaWidget, widgetDecidePaleta,
} from './precedencia-tema.ts';
import { temaAppParaReservar } from './tema-app.ts';
import { APARIENCIA_POR_DEFECTO, resolverApariencia } from './apariencia-widget.ts';
import { RESERVAR_PALETA, tokensCalendarioDeApariencia, varsReservarModo } from '../reservar-publico-tokens.ts';

const CARBON = temaAppParaReservar({ estilo: 'carbon', tipografia: 'editorial', marca: 'fiel' });
const params = (q: string) => resolverApariencia(null, new URLSearchParams(q));

// ── Lo de siempre ───────────────────────────────────────────────────────────

test('sin tema de la app y sin widget, exactamente lo de antes: día, nada en línea', () => {
  for (const embed of [false, true]) {
    const p = paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, embed, TEMA_APP_RESERVAR_POR_DEFECTO);
    assert.deepEqual(p.tokens, RESERVAR_PALETA.dia);
    // Y el MISMO resultado que daba la página antes de esto para ese caso.
    assert.deepEqual(p.tokens, tokensCalendarioDeApariencia(APARIENCIA_POR_DEFECTO, 'dia'));
    assert.equal(p.noche, false);
    assert.equal(p.varsEnLinea, null);
  }
});

// ── Página suelta: el tema de la app manda ──────────────────────────────────

test('la página suelta sigue el tema de la app e ignora los parámetros del widget', () => {
  // Fuera de `embed=1` la página nunca resuelve los parámetros (page.tsx), pero
  // aunque llegaran, no decide el widget.
  const p = paletaEfectivaReservar(params('fondo=%23ffffff&texto=oscuro'), false, CARBON);
  assert.equal(p.tokens, CARBON.tokens);
  assert.equal(p.noche, true);
  assert.equal(p.varsEnLinea, null);
});

// ── Incrustada: widget > tema de la app > lo de siempre ─────────────────────

test('incrustada sin parámetros de color, hereda el tema de la app (Carbón)', () => {
  for (const q of ['', 'fuente=Lobster', 'forma=recto&densidad=compacta', 'marca=%23112233', 'diseno=ligero']) {
    const p = paletaEfectivaReservar(params(q), true, CARBON);
    assert.equal(p.tokens.bg, '#17181B', q);
    assert.equal(p.noche, true, q);
    assert.equal(p.varsEnLinea, null, q);
  }
});

test('⚠️ con un widget de fondo claro sobre la app en Carbón, gana el widget ENTERO: paleta de día y marca del estudio', () => {
  const a = params('fondo=%23ffffff');
  const p = paletaEfectivaReservar(a, true, CARBON);
  assert.equal(p.noche, false);
  assert.deepEqual(p.tokens, tokensCalendarioDeApariencia(a, 'dia'));
  // La paleta COMPLETA en línea, no solo el fondo: si no, tarjetas de Carbón
  // con letra clara sobre el fondo blanco del estudio.
  assert.deepEqual(p.varsEnLinea, { ...varsReservarModo('dia'), ...MARCA_DEL_ESTUDIO_EN_LINEA, colorScheme: 'light' });
});

test('texto=claro o un fondo oscuro deciden la noche, igual que antes', () => {
  for (const q of ['texto=claro', 'fondo=%23121212', 'fondo=transparente&texto=claro']) {
    const p = paletaEfectivaReservar(params(q), true, TEMA_APP_RESERVAR_POR_DEFECTO);
    assert.equal(p.noche, true, q);
    assert.deepEqual(p.tokens, RESERVAR_PALETA.noche, q);
    const vars = p.varsEnLinea!;
    for (const [k, v] of Object.entries(varsReservarModo('noche'))) assert.equal(vars[k], v, `${q}: ${k}`);
    // En noche no se toca `color-scheme`: es lo de siempre.
    assert.equal(vars.colorScheme, undefined, q);
  }
});

test('«transparente» con texto automático es una decisión del widget, pero de día (no adivina)', () => {
  const p = paletaEfectivaReservar(params('fondo=transparente'), true, CARBON);
  assert.equal(p.noche, false);
  assert.equal(p.tokens.ink, RESERVAR_PALETA.dia.ink);
});

test('tocar uno de los «Colores del widget» también decide: el resto sale del día de siempre, no de Carbón', () => {
  const a = params('superficie=%23112233');
  assert.equal(widgetDecidePaleta(a), true);
  const p = paletaEfectivaReservar(a, true, CARBON);
  assert.equal(p.tokens.surface, '#112233');
  assert.equal(p.tokens.ink, RESERVAR_PALETA.dia.ink);
  assert.equal(p.varsEnLinea!['--portal-bg'], RESERVAR_PALETA.dia.bg);
});

test('ni la fuente, ni la forma, ni la marca deciden la paleta', () => {
  assert.equal(widgetDecidePaleta(APARIENCIA_POR_DEFECTO), false);
  assert.equal(widgetDecidePaleta(params('fuente=Lobster&fuente-display=Inter&radio=4&forma=recto&densidad=compacta')), false);
});

test('⚠️ la marca recuperada nunca se referencia a sí misma (sería un ciclo y la marca desaparecería)', () => {
  for (const [k, v] of Object.entries(MARCA_DEL_ESTUDIO_EN_LINEA)) {
    assert.ok(!v.includes(`var(${k})`) && !v.includes(`var(${k},`), `${k}: ${v}`);
    assert.match(v, /^var\(--portal-brand-estudio(-foreground|-texto)?\)$/);
  }
});

// ── Tipografía del widget ───────────────────────────────────────────────────

test('sin fuente del widget no se declara nada en línea: se hereda el tema de la app', () => {
  assert.deepEqual(varsTipografiaWidget(null, null), {});
});

test('con fuente del widget, gana a la pareja de la app y anula su peso de titular', () => {
  assert.deepEqual(varsTipografiaWidget("'Lobster', system-ui", "'Lobster', system-ui"), {
    '--font-ui': "'Lobster', system-ui",
    '--font-display': "'Lobster', system-ui",
    '--portal-heading-font': "'Lobster', system-ui",
    '--reservar-heading-weight': 'initial',
  });
});

test('solo fuente de titulares: el cuerpo sigue siendo el de la app', () => {
  const v = varsTipografiaWidget(null, "'Fraunces', serif");
  assert.equal(v['--font-ui'], undefined);
  assert.equal(v['--portal-heading-font'], "'Fraunces', serif");
  assert.equal(v['--reservar-heading-weight'], 'initial');
});
