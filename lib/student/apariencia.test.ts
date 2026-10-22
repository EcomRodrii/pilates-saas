import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('student.css pide sus familias de serie por la variable de app/_fuentes, no por el nombre', () => {
  // Con el literal 'Plus Jakarta Sans' la de serie («Moderna») caía a system-ui:
  // `next/font/local` registra la cara con otro nombre de familia.
  const css = readFileSync(new URL('../../app/portal/[slug]/student.css', import.meta.url), 'utf8');
  const fuentes = readFileSync(new URL('../../app/_fuentes/fuentes.css', import.meta.url), 'utf8');
  for (const [prop, esperada] of [['--font-sans', '--font-jakarta'], ['--font-mono', '--font-plex-mono']] as const) {
    const decl = new RegExp(`${prop}:\\s*([^;]+);`).exec(css)?.[1] ?? '';
    const primera = decl.split(',')[0].trim();
    assert.equal(primera, `var(${esperada})`, `${prop}: ${decl}`);
    assert.match(fuentes, new RegExp(`${esperada}:\\s*var\\(`), `${esperada} no está en app/_fuentes/fuentes.css`);
  }
  // Ninguna familia de app/_fuentes escrita por su nombre como primera opción.
  for (const m of css.matchAll(/font-family:\s*'([^']+)'/g)) assert.fail(`font-family literal: ${m[1]}`);
  assert.doesNotMatch(css, /--font-[a-z-]+:\s*'(Plus Jakarta Sans|IBM Plex Mono)'/);
});

// ── La vista previa del editor: el borrador va ENCIMA de lo publicado ─────────
// Mini-cascada: el `<style>` publicado va en el `<body>` (DESPUÉS del borrador,
// que el editor mete en el `<head>`), así que a igual especificidad gana el
// publicado. Lo que vale es lo que el borrador declare con más especificidad.

type Regla = { selector: string; decl: Map<string, string>; orden: number };
function reglas(css: string, desde: number): Regla[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, i) => ({
    selector: m[1].trim(),
    decl: new Map(m[2].split(';').filter(Boolean).map((d) => {
      const k = d.indexOf(':');
      return [d.slice(0, k).trim(), d.slice(k + 1).trim()] as [string, string];
    })),
    orden: desde + i,
  }));
}
/** Especificidad (clases y pseudoclases, tipos) de un selector compuesto simple. */
const especificidad = (sel: string) => {
  const clases = (sel.match(/[.:][a-z-]+/g) ?? []).length;
  const tipos = sel.split(/\s+/).filter((p) => /^[a-z]+/.test(p)).length;
  return clases * 100 + tipos;
};
/** A qué «objetivo» apunta la regla: la app, el body o la raíz. */
const objetivo = (sel: string) => (sel.includes('student-app') ? 'app' : sel.endsWith('body') ? 'body' : sel.includes(':root') ? 'root' : sel);
function efectivo(...hojas: string[]) {
  let orden = 0;
  const todas = hojas.flatMap((h) => { const r = reglas(h, orden); orden += r.length; return r; });
  const gana = new Map<string, { valor: string; esp: number; orden: number }>();
  for (const r of todas) for (const [p, v] of r.decl) {
    const clave = `${objetivo(r.selector)}|${p}`;
    const esp = especificidad(r.selector);
    const prev = gana.get(clave);
    if (!prev || esp > prev.esp || (esp === prev.esp && r.orden > prev.orden)) gana.set(clave, { valor: v, esp, orden: r.orden });
  }
  return new Map([...gana].map(([k, v]) => [k, v.valor]));
}

const PUBLICADOS: unknown[] = [
  { estilo: 'carbon', tipografia: 'editorial', marca: 'fiel', boton: 'marca', encuadre: 'arriba' },
  { estilo: 'piedra', tipografia: 'romantica', marca: 'suave', boton: 'tinta', encuadre: 'abajo' },
  { estilo: 'luz', tipografia: 'moderna', marca: 'fiel', boton: 'marca', encuadre: null },
  undefined,
];
const BORRADORES: unknown[] = [
  { estilo: 'crema', tipografia: 'moderna', marca: 'suave', boton: 'tinta', encuadre: null },
  { estilo: 'arena', tipografia: 'serena', marca: 'suave', boton: 'tinta', encuadre: 'centro' },
  { estilo: 'carbon', tipografia: 'moderna', marca: 'suave', boton: 'tinta', encuadre: null },
];

test('vista previa: lo publicado no se cuela en el borrador (Carbón/Editorial/marca → Crema/Moderna/tinta)', () => {
  for (const pub of PUBLICADOS) for (const bor of BORRADORES) {
    const publicado = temaAppCssText('#A85C72', pub);
    const borrador = temaAppCssText('#2F6F8F', bor, '.student-app.student-app', { completo: true });
    // Orden real del documento: el borrador en el <head>, lo publicado en el <body>.
    const visto = efectivo(borrador, publicado);
    const soloBorrador = efectivo(borrador);
    for (const [clave, valor] of efectivo(publicado)) {
      assert.ok(soloBorrador.has(clave), `el borrador no declara ${clave} (publicado ${JSON.stringify(pub)} → ${JSON.stringify(bor)}): se vería «${valor}»`);
    }
    for (const [clave, valor] of soloBorrador) {
      assert.equal(visto.get(clave), valor, `${clave}: ${JSON.stringify(pub)} → ${JSON.stringify(bor)}`);
    }
  }
});

test('vista previa: el borrador de serie trae el juego entero con los valores de student.css', () => {
  const v = efectivo(temaAppCssText('#2F6F8F', undefined, '.student-app.student-app', { completo: true }));
  const crema = ESTILOS.find((e) => e.id === 'crema')!;
  assert.equal(v.get('app|--background'), crema.background);
  assert.equal(v.get('app|--primary'), crema.tinta);
  assert.equal(v.get('app|--primary-foreground'), crema.tintaForeground);
  assert.equal(v.get('app|--radius-card'), `${crema.radios.card}px`);
  assert.equal(v.get('app|--font-sans'), TIPOGRAFIAS[0].texto);
  assert.equal(v.get('app|--heading-weight'), '800');
  assert.equal(v.get('app|--portada-y'), 'initial');
  assert.equal(v.get('body|background'), crema.background);
  assert.equal(v.get('root|color-scheme'), 'light');
  // Lo publicado de la app (sin `completo`) no cambia.
  assert.equal(temaAppCssText('#2F6F8F', undefined), acentoCssText('#2F6F8F'));
});
