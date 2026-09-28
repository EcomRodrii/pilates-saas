import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_WEB, HEX6, WIDGET_WEB_NEUTRO, borradorAParam, colorDeLaWeb, esNeutro, leerWidgetWeb, mismoWidgetWeb,
  type WidgetWeb,
} from './estilo-web-tipos.ts';
import { widgetWebSchema } from '../theme-schema.ts';

const w = (parcial: Partial<WidgetWeb> = {}): WidgetWeb => ({ ...WIDGET_WEB_NEUTRO, ...parcial });

// ── Lectura tolerante ────────────────────────────────────────────────────────

test('leerWidgetWeb: solo objetos; lo demás no es un estilo', () => {
  for (const crudo of [null, undefined, 'arena', 7, true, ['arena']]) assert.equal(leerWidgetWeb(crudo), null, String(crudo));
  assert.deepEqual(leerWidgetWeb({}), WIDGET_WEB_NEUTRO);
});

test('leerWidgetWeb: una clave corrupta vale lo de siempre y no arrastra a las demás', () => {
  assert.deepEqual(
    leerWidgetWeb({
      estilo: 'arena', letra: 'comic-sans', boton: 'rosa', web: 'crema', colorWeb: null,
      fundido: 'true', forma: 'recto', densidad: 'comoda', ocultarPie: 1, extra: 'nada',
    }),
    w({ estilo: 'arena', web: 'crema', forma: 'recto' }),
  );
  assert.deepEqual(leerWidgetWeb({ letra: 'editorial', fundido: true, ocultarPie: true, densidad: 'compacta' }),
    w({ letra: 'editorial', fundido: true, ocultarPie: true, densidad: 'compacta' }));
});

test('⚠️ el color de su web solo entra si es un hex de 6: acaba dentro de un <style>', () => {
  for (const malo of ['#fff;}</style>', 'red', '#FFF', '#12345', '#1234567', 'url(x)', 12]) {
    assert.equal(leerWidgetWeb({ web: 'otro', colorWeb: malo })!.colorWeb, null, String(malo));
  }
  assert.equal(leerWidgetWeb({ web: 'otro', colorWeb: '#1d1e1B' })!.colorWeb, '#1d1e1B');
});

test('«Otro color» sin color no es «otro color», y un color sin «Otro color» se descarta', () => {
  assert.deepEqual(leerWidgetWeb({ web: 'otro' }), w());
  assert.deepEqual(leerWidgetWeb({ web: 'otro', colorWeb: 'azul', fundido: true }), w({ fundido: true }));
  assert.deepEqual(leerWidgetWeb({ web: 'oscura', colorWeb: '#123456' }), w({ web: 'oscura' }));
});

// ── Lectura y esquema dicen lo mismo ─────────────────────────────────────────

const TABLA: unknown[] = [
  {}, null, 'x', [], w(), w({ estilo: 'carbon' }), w({ web: 'otro', colorWeb: '#ABCDEF', fundido: true }),
  w({ estilo: 'luz', letra: 'serena', boton: 'fiel', web: 'crema', forma: 'pill', densidad: 'compacta', ocultarPie: true }),
  { ...w(), estilo: 'nope' }, { ...w(), web: 'otro' }, { ...w(), colorWeb: '#123456' }, { ...w(), extra: 1 },
  { ...w(), fundido: 'si' }, { ...w(), densidad: 'comoda' }, { ...w(), colorWeb: '#fff;}</style>', web: 'otro' },
  { estilo: 'arena' },
];

test('leerWidgetWeb y widgetWebSchema coinciden: lo que el esquema acepta se lee tal cual', () => {
  for (const crudo of TABLA) {
    const r = widgetWebSchema.safeParse(crudo);
    if (r.success) assert.deepEqual(leerWidgetWeb(crudo), r.data, JSON.stringify(crudo));
  }
});

test('…y lo que devuelve la lectura, sea cual sea la entrada, el esquema lo acepta', () => {
  for (const crudo of TABLA) {
    const leido = leerWidgetWeb(crudo);
    if (leido) assert.equal(widgetWebSchema.safeParse(leido).success, true, JSON.stringify(crudo));
  }
});

test('el esquema es la cerradura: nada fuera de catálogo, ni «otro» sin color, ni claves de más', () => {
  assert.equal(widgetWebSchema.safeParse(w({ web: 'otro', colorWeb: '#123456' })).success, true);
  assert.equal(widgetWebSchema.safeParse({ ...w(), web: 'otro' }).success, false);
  assert.equal(widgetWebSchema.safeParse({ ...w(), colorWeb: '#123456' }).success, false);
  assert.equal(widgetWebSchema.safeParse({ ...w(), estilo: 'nope' }).success, false);
  assert.equal(widgetWebSchema.safeParse({ ...w(), extra: 1 }).success, false);
  assert.equal(widgetWebSchema.safeParse({ estilo: 'arena' }).success, false);
});

// ── Neutro, igualdad, color de la web ────────────────────────────────────────

test('esNeutro: cómo es su web solo cuenta si se funde', () => {
  assert.equal(esNeutro(null), true);
  assert.equal(esNeutro(undefined), true);
  assert.equal(esNeutro(w()), true);
  assert.equal(esNeutro(w({ web: 'oscura' })), true);
  assert.equal(esNeutro(w({ web: 'otro', colorWeb: '#123456' })), true);
  for (const p of [{ estilo: 'arena' }, { letra: 'editorial' }, { boton: 'tinta' }, { fundido: true },
    { forma: 'recto' }, { densidad: 'compacta' }, { ocultarPie: true }] as Partial<WidgetWeb>[]) {
    assert.equal(esNeutro(w(p)), false, JSON.stringify(p));
  }
});

test('mismoWidgetWeb: «nada elegido» ≡ null, y el resto clave a clave', () => {
  assert.equal(mismoWidgetWeb(null, null), true);
  assert.equal(mismoWidgetWeb(null, w()), true);
  assert.equal(mismoWidgetWeb(w({ web: 'oscura' }), null), true);
  assert.equal(mismoWidgetWeb(w({ estilo: 'arena' }), null), false);
  assert.equal(mismoWidgetWeb(null, w({ estilo: 'arena' })), false);
  assert.equal(mismoWidgetWeb(w({ estilo: 'arena' }), w({ estilo: 'arena' })), true);
  assert.equal(mismoWidgetWeb(w({ estilo: 'arena' }), w({ estilo: 'arena', letra: 'editorial' })), false);
  assert.equal(mismoWidgetWeb(
    w({ web: 'otro', colorWeb: '#ABCDEF', fundido: true }), w({ web: 'otro', colorWeb: '#abcdef', fundido: true }),
  ), true);
});

test('colorDeLaWeb: la web con nombre, «otro color» con el suyo, y sin contestar, blanca', () => {
  assert.equal(colorDeLaWeb(null), COLOR_WEB.blanca);
  assert.equal(colorDeLaWeb(w()), '#FFFFFF');
  assert.equal(colorDeLaWeb(w({ web: 'crema' })), COLOR_WEB.crema);
  assert.equal(colorDeLaWeb(w({ web: 'oscura' })), COLOR_WEB.oscura);
  assert.equal(colorDeLaWeb(w({ web: 'otro', colorWeb: '#123456' })), '#123456');
  for (const c of Object.values(COLOR_WEB)) assert.match(c, HEX6);
});

// ── El borrador de la vista previa ───────────────────────────────────────────

test('borradorAParam: solo lo que difiere de «nada elegido», y vuelve tal cual', () => {
  assert.equal(borradorAParam(w()), '{}');
  assert.equal(borradorAParam(w({ estilo: 'arena' })), '{"estilo":"arena"}');
  for (const x of [
    w(), w({ estilo: 'carbon', letra: 'romantica' }), w({ boton: 'suave', web: 'otro', colorWeb: '#E8E1D3', fundido: true }),
    w({ forma: 'pill', densidad: 'compacta', ocultarPie: true, web: 'oscura' }),
  ]) {
    assert.deepEqual(leerWidgetWeb(JSON.parse(borradorAParam(x))), x);
  }
});
