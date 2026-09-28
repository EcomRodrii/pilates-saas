import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARCA_DEL_ESTUDIO_EN_LINEA, MARCA_DEL_ESTUDIO_EN_LINEA_NOCHE, TEMA_APP_RESERVAR_POR_DEFECTO, cssDocumentoIncrustado,
  paletaEfectivaReservar, textoDeMarca, varsMarcaWidget, varsTipografiaWidget, widgetDecidePaleta,
} from './precedencia-tema.ts';
import { temaAppParaReservar } from './tema-app.ts';
import { APARIENCIA_POR_DEFECTO, resolverApariencia } from './apariencia-widget.ts';
import { RESERVAR_PALETA, tokensCalendarioDeApariencia, varsReservarModo } from '../reservar-publico-tokens.ts';
import { ratioContraste } from '../wcag-contrast.ts';

const CARBON = temaAppParaReservar({ estilo: 'carbon', tipografia: 'editorial', marca: 'fiel' });
const ARENA = temaAppParaReservar({ estilo: 'arena' });
const params = (q: string) => resolverApariencia(null, new URLSearchParams(q));
const r = (a: string, b: string) => ratioContraste(a, b) ?? 0;

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
  for (const q of ['', 'fuente=Lobster', 'forma=recto&densidad=compacta']) {
    const p = paletaEfectivaReservar(params(q), true, CARBON);
    assert.equal(p.tokens.bg, '#17181B', q);
    assert.equal(p.noche, true, q);
    assert.equal(p.varsEnLinea, null, q);
  }
});

test('⚠️ `marca=` suelta sobre Carbón decide la paleta: la de día entera, y su marca encima se lee', () => {
  // El constructor emite `marca` siempre que la identidad es «propia», pensada
  // para una web CLARA. Heredando Carbón, un `#1A1A1A` o un verde oscuro como
  // texto (contadores de plazas, «Ver más») daban 1–2:1 sobre la tarjeta.
  for (const marca of ['#1A1A1A', '#2C352C', '#1F4E79', '#112233']) {
    const p = paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, true, CARBON, { marca });
    assert.equal(p.noche, false, marca);
    assert.deepEqual(p.tokens, RESERVAR_PALETA.dia, marca);
    assert.deepEqual(p.varsEnLinea, { ...varsReservarModo('dia'), ...MARCA_DEL_ESTUDIO_EN_LINEA, colorScheme: 'light' }, marca);
    // Y la marca del snippet, que gana después (`varsMarca` va detrás en la
    // raíz), se lee como texto sobre esa paleta.
    const v = varsMarcaWidget(marca, p.tokens)!;
    assert.equal(v['--portal-brand'], marca);
    for (const f of [p.tokens.bg, p.tokens.surface, p.tokens.surface2]) {
      assert.ok(r(v['--portal-brand-texto'], f) >= 4.5, `${marca} como texto sobre ${f}`);
    }
  }
});

test('`diseno=ligero` sobre Carbón también decide el día: sus celdas son blancas FIJAS', () => {
  const p = paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, true, CARBON, { ligero: true });
  assert.equal(p.noche, false);
  assert.equal(p.tokens.bg, RESERVAR_PALETA.dia.bg);
  assert.notEqual(p.varsEnLinea, null);
});

test('sobre un estilo CLARO, ni la marca ni «ligero» deciden: se hereda el de la app', () => {
  for (const w of [{ marca: '#1A1A1A' }, { ligero: true }, { marca: '#E11D48', ligero: true }]) {
    const p = paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, true, ARENA, w);
    assert.equal(p.tokens, ARENA.tokens);
    assert.equal(p.varsEnLinea, null);
  }
  // Y la página suelta nunca: ahí no hay snippet.
  assert.equal(paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, false, CARBON, { marca: '#1A1A1A', ligero: true }).varsEnLinea, null);
});

test('un widget de NOCHE recupera la marca del estudio con su texto de noche, no el oscurecido para el día', () => {
  const p = paletaEfectivaReservar(params('texto=claro'), true, CARBON);
  assert.equal(p.noche, true);
  const v = p.varsEnLinea!;
  assert.equal(v['--portal-brand'], 'var(--portal-brand-estudio)');
  assert.equal(v['--portal-brand-texto'], 'var(--portal-brand-estudio-texto-noche)');
  assert.deepEqual(
    Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith('--portal-brand'))),
    MARCA_DEL_ESTUDIO_EN_LINEA_NOCHE,
  );
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

test('ni la fuente, ni la forma deciden la paleta (la marca, solo sobre un estilo oscuro)', () => {
  assert.equal(widgetDecidePaleta(APARIENCIA_POR_DEFECTO), false);
  assert.equal(widgetDecidePaleta(params('fuente=Lobster&fuente-display=Inter&radio=4&forma=recto&densidad=compacta')), false);
});

test('⚠️ la marca recuperada nunca se referencia a sí misma (sería un ciclo y la marca desaparecería)', () => {
  for (const vars of [MARCA_DEL_ESTUDIO_EN_LINEA, MARCA_DEL_ESTUDIO_EN_LINEA_NOCHE]) {
    for (const [k, v] of Object.entries(vars)) {
      assert.ok(!v.includes(`var(${k})`) && !v.includes(`var(${k},`), `${k}: ${v}`);
      assert.match(v, /^var\(--portal-brand-estudio(-foreground|-texto|-texto-noche)?\)$/);
    }
  }
});

// ── El documento del iframe ─────────────────────────────────────────────────

test('⚠️ cuando decide el widget, la raíz del documento vuelve a `color-scheme: normal` (si no, lienzo opaco)', () => {
  // Carbón pone `:root{color-scheme:dark}`. Un iframe con la raíz en oscuro
  // dentro de una web en claro se pinta sobre un lienzo OPACO oscuro: una losa
  // negra bajo un widget «transparente». Sin decidir el widget, no se toca.
  const transparente = params('fondo=transparente');
  const css = cssDocumentoIncrustado(transparente, paletaEfectivaReservar(transparente, true, CARBON));
  assert.equal(css, 'html,body{background:transparent !important;}:root:root{color-scheme:normal;}');
  const marca = paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, true, CARBON, { marca: '#1A1A1A' });
  assert.match(cssDocumentoIncrustado(APARIENCIA_POR_DEFECTO, marca), /:root:root\{color-scheme:normal;\}$/);
  const hereda = paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, true, CARBON);
  assert.equal(cssDocumentoIncrustado(APARIENCIA_POR_DEFECTO, hereda), 'html,body{background:var(--portal-bg) !important;}');
});

test('sin fondo del widget, el documento se pinta con la paleta que decidió él, no con la de `:root`', () => {
  // `var(--portal-bg)` en `html` es el de `:root`: Carbón, debajo de un widget de día.
  const a = params('texto=oscuro');
  assert.equal(
    cssDocumentoIncrustado(a, paletaEfectivaReservar(a, true, CARBON)),
    `html,body{background:${RESERVAR_PALETA.dia.bg} !important;}:root:root{color-scheme:normal;}`,
  );
  // Con fondo propio, el suyo; y sin tema de la app ni widget, lo de siempre, carácter a carácter.
  const blanco = params('fondo=%23ffffff');
  assert.match(cssDocumentoIncrustado(blanco, paletaEfectivaReservar(blanco, true, CARBON)), /^html,body\{background:#ffffff !important;\}/);
  assert.equal(
    cssDocumentoIncrustado(APARIENCIA_POR_DEFECTO, paletaEfectivaReservar(APARIENCIA_POR_DEFECTO, true, TEMA_APP_RESERVAR_POR_DEFECTO)),
    'html,body{background:var(--portal-bg) !important;}',
  );
});

// ── `marca=` del snippet ────────────────────────────────────────────────────

test('`marca=`: la marca, su texto encima y la marca como texto medida contra la paleta que se ve', () => {
  assert.equal(varsMarcaWidget(null, RESERVAR_PALETA.dia), null);
  const oscura = varsMarcaWidget('#112233', RESERVAR_PALETA.dia)!;
  assert.equal(oscura['--portal-brand-foreground'], '#FFFFFF');
  assert.equal(oscura['--portal-brand-texto'], '#112233');
  const clara = varsMarcaWidget('#FFD60A', RESERVAR_PALETA.dia)!;
  assert.equal(clara['--portal-brand-foreground'], '#22261F');
  // Un amarillo no se lee como texto sobre la crema: se oscurece lo justo.
  assert.notEqual(clara['--portal-brand-texto'], '#FFD60A');
  assert.ok(r(clara['--portal-brand-texto'], RESERVAR_PALETA.dia.surface2) >= 4.5);
  // Y de noche, al revés: la marca oscura se aclara.
  assert.ok(r(varsMarcaWidget('#112233', RESERVAR_PALETA.noche)!['--portal-brand-texto'], RESERVAR_PALETA.noche.surface) >= 4.5);
  assert.equal(textoDeMarca('#112233', RESERVAR_PALETA.dia), '#112233');
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
