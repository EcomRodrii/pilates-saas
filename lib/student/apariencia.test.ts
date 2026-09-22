import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APARIENCIA_POR_DEFECTO, ESTILOS, TIPOGRAFIAS, acentoDe, acentoFiel, resolverApariencia, temaAppCssText,
} from './apariencia.ts';
import { acentoCssText } from './tema.ts';
import { ratioContraste } from '../wcag-contrast.ts';

const r = (a: string, b: string) => ratioContraste(a, b) ?? 0;

test('sin nada elegido, la app emite EXACTAMENTE lo de antes', () => {
  for (const color of ['#666dcc', '#1A1A1A', null, '#F7A6C4']) {
    assert.equal(temaAppCssText(color, undefined), acentoCssText(color));
    assert.equal(temaAppCssText(color, APARIENCIA_POR_DEFECTO), acentoCssText(color));
    assert.equal(temaAppCssText(color, { basura: 1 }), acentoCssText(color));
  }
});

test('el estilo Crema son los valores de student.css (el aspecto de hoy)', () => {
  const crema = ESTILOS.find(e => e.id === 'crema')!;
  assert.deepEqual(
    [crema.background, crema.foreground, crema.card, crema.subtleForeground, crema.tinta, crema.tintaForeground],
    ['#FAF9F5', '#1A1A1A', '#FFFFFF', '#6C7567', '#1A1A1A', '#F1ECE1'],
  );
});

test('lectura tolerante: una clave corrupta no arrastra a las demás', () => {
  assert.deepEqual(
    resolverApariencia({ estilo: 'arena', tipografia: 'comic-sans', marca: 'fiel', boton: 7, encuadre: 'lateral' }),
    { estilo: 'arena', tipografia: 'moderna', marca: 'fiel', boton: 'tinta', encuadre: null },
  );
  assert.deepEqual(resolverApariencia(null), APARIENCIA_POR_DEFECTO);
  assert.deepEqual(resolverApariencia('arena'), APARIENCIA_POR_DEFECTO);
});

test('cada estilo se lee: texto, secundario y apoyo en AA sobre fondo, tarjeta y gris', () => {
  for (const e of ESTILOS) {
    for (const fondo of [e.background, e.card]) {
      assert.ok(r(e.foreground, fondo) >= 7, `${e.id}: texto sobre ${fondo}`);
      assert.ok(r(e.mutedForeground, fondo) >= 4.5, `${e.id}: secundario sobre ${fondo}`);
      assert.ok(r(e.subtleForeground, fondo) >= 4.5, `${e.id}: apoyo sobre ${fondo} = ${r(e.subtleForeground, fondo).toFixed(2)}`);
    }
    assert.ok(r(e.mutedForeground, e.muted) >= 4.5, `${e.id}: secundario sobre muted`);
    assert.ok(r(e.tintaForeground, e.tinta) >= 7, `${e.id}: botón en tinta`);
  }
});

test('color fiel: se conserva si ya se lee, y se oscurece solo lo justo si no', () => {
  assert.equal(acentoFiel('#1F4E79', '#FAF9F5').accent.toLowerCase(), '#1f4e79');
  const pastel = acentoFiel('#F7A6C4', '#FAF9F5');
  assert.ok(r(pastel.accent, '#FFFFFF') >= 4.5);
  assert.notEqual(pastel.accent.toLowerCase(), '#f7a6c4');
});

test('ningún color de marca, en ningún estilo, deja un botón o enlace ilegible', () => {
  const colores = ['#FFFFFF', '#FFFF00', '#F7A6C4', '#00FF00', '#666dcc', '#000000', '#E11D48', '#0EA5E9', '#C9A227'];
  for (const e of ESTILOS) for (const marca of ['suave', 'fiel'] as const) for (const c of colores) {
    const a = acentoDe(c, { ...APARIENCIA_POR_DEFECTO, estilo: e.id, marca });
    assert.ok(r(a.accentForeground, a.accent) >= 4.5, `${e.id}/${marca}/${c}: texto sobre botón`);
    assert.ok(r(a.accentSoftForeground, a.accentSoft) >= 4.5, `${e.id}/${marca}/${c}: badge`);
    // El enlace tiene que separarse del fondo en las dos intensidades cuando el
    // estilo es oscuro: ahí un acento «suave» de los de siempre sería invisible.
    if (marca === 'fiel' || e.oscuro) assert.ok(r(a.accent, e.background) >= 4.5, `${e.id}/${marca}/${c}: enlace sobre fondo`);
  }
});

test('el estilo oscuro invierte la derivación: acento claro y tinta oscura encima', () => {
  const carbon = ESTILOS.find(e => e.id === 'carbon')!;
  assert.equal(carbon.oscuro, true);
  for (const c of ['#1F4E79', '#B4708C', '#F7A6C4']) {
    const a = acentoDe(c, { ...APARIENCIA_POR_DEFECTO, estilo: 'carbon', marca: 'fiel' });
    assert.ok(r(a.accent, carbon.background) >= 4.5, `${c}: el enlace se ve sobre el fondo oscuro`);
    assert.ok(r(a.accentForeground, a.accent) >= 4.5, `${c}: el texto del botón se lee`);
    assert.ok(r(a.accentSoftForeground, a.accentSoft) >= 4.5, `${c}: el badge se lee`);
  }
  // Y el botón «oscuro» de un estilo oscuro es claro, o no se vería.
  assert.match(temaAppCssText('#1F4E79', { estilo: 'carbon' }), /--primary:#F2F3F5/);
});

test('lo elegido llega al CSS: estilo, botón en marca, tipografía y encuadre', () => {
  const css = temaAppCssText('#1F4E79', { estilo: 'arena', tipografia: 'serena', marca: 'fiel', boton: 'marca', encuadre: 'arriba' });
  assert.match(css, /^\.student-app\{/);
  assert.match(css, /--background:#F4EEE5/);
  assert.match(css, /--radius-card:20px/);
  assert.match(css, /--primary:#1f4e79/i);
  assert.match(css, /--font-heading:var\(--font-display\)/);
  assert.match(css, /--font-sans:var\(--font-ui\)/);
  assert.match(css, /--portada-y:12%/);
});

test('sin botón en marca, un estilo nuevo pone su propia tinta en el botón', () => {
  const css = temaAppCssText('#1F4E79', { estilo: 'luz' });
  assert.match(css, /--primary:#18181B/);
  assert.doesNotMatch(css, /--font-heading/);
});

test('la vista previa usa un selector más específico', () => {
  assert.match(temaAppCssText('#1F4E79', { estilo: 'luz' }, '.student-app.student-app'), /^\.student-app\.student-app\{/);
  assert.match(temaAppCssText('#1F4E79', undefined, '.student-app.student-app'), /^\.student-app\.student-app\{--accent/);
});

test('todas las tipografías usan familias que carga app/layout.tsx', () => {
  const cargadas = ['--font-jakarta', '--font-libre-caslon', '--font-figtree', '--font-cormorant', '--font-display', '--font-ui', '--font-outfit', '--font-poppins'];
  for (const t of TIPOGRAFIAS) for (const f of [t.titulos, t.texto]) {
    const v = /var\((--[a-z-]+)\)/.exec(f)?.[1];
    assert.ok(v && cargadas.includes(v), `${t.id}: ${f}`);
  }
});
