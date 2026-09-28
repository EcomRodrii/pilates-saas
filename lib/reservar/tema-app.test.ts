import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FUENTE_BASE, esReservarPorDefecto, marcaEstudioDeVars, pilaSinCiclo, temaAppParaReservar,
  temaReservarCssText, textoDeMarca, tokensDeEstilo, type MarcaEstudio,
} from './tema-app.ts';
import { ESTILOS, TIPOGRAFIAS, APARIENCIA_POR_DEFECTO, acentoDe, resolverApariencia } from '../student/apariencia.ts';
import { RESERVAR_PALETA, fuenteReservarCssVars } from '../reservar-publico-tokens.ts';
import { ratioContraste } from '../wcag-contrast.ts';

const r = (a: string, b: string) => ratioContraste(a, b) ?? 0;
const MARCA: MarcaEstudio = { brand: '#2C352C', foreground: '#FFFFFF', texto: '#2C352C' };

/** Las declaraciones `--x: valor;` del bloque de `:root`, como mapa. */
function declaraciones(css: string): Map<string, string> {
  const bloque = /^:root \{ (.*?) \}/.exec(css)?.[1] ?? '';
  const m = new Map<string, string>();
  for (const d of bloque.split(/;\s*/)) {
    const i = d.indexOf(':');
    if (i > 0) m.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return m;
}

// ── La regla de oro: sin nada elegido, lo de antes ──────────────────────────

test('sin nada elegido, /reservar emite el Jakarta de siempre y ni un color', () => {
  for (const crudo of [null, undefined, {}, { basura: 1 }, 'crema', APARIENCIA_POR_DEFECTO]) {
    const css = temaReservarCssText('#666dcc', crudo, MARCA);
    assert.ok(css.startsWith(`:root { ${fuenteReservarCssVars()} --portal-brand-estudio: #2C352C;`), css);
    assert.doesNotMatch(css, /--portal-bg:|--portal-brand:|--font-display:|--reservar-heading-weight|body\{|color-scheme/);
  }
});

test('el encuadre de la portada NO cuenta como «haber elegido algo»: solo mueve la foto de la app', () => {
  const a = resolverApariencia({ encuadre: 'arriba' });
  assert.equal(esReservarPorDefecto(a), true);
  assert.equal(temaReservarCssText('#666dcc', { encuadre: 'arriba' }, MARCA), temaReservarCssText('#666dcc', null, MARCA));
});

test('Crema son los tokens de día de siempre, el mismo objeto', () => {
  assert.equal(tokensDeEstilo(ESTILOS.find(e => e.id === 'crema')!), RESERVAR_PALETA.dia);
  assert.deepEqual(temaAppParaReservar(null), { tokens: RESERVAR_PALETA.dia, oscuro: false });
});

// ── Tipografía ──────────────────────────────────────────────────────────────

test('ninguna pareja deja una variable de fuente referenciándose a sí misma', () => {
  for (const t of TIPOGRAFIAS) {
    const d = declaraciones(temaReservarCssText('#1F4E79', { tipografia: t.id }, MARCA));
    for (const v of ['--font-ui', '--portal-heading-font', '--font-display']) {
      const valor = d.get(v);
      if (valor == null) continue;
      // Ni a sí misma ni a las otras dos que /reservar redefine: `var(--font-ui)`
      // exacto, no `var(--font-ui-latin)`, que es la base y no se redefine.
      assert.doesNotMatch(valor, /var\(--font-ui\)|var\(--font-display\)|var\(--portal-heading-font\)/, `${t.id}: ${v} = ${valor}`);
    }
  }
});

test('«Serena» y «Nítida» siguen siendo Instrument, no el Jakarta de reserva', () => {
  const serena = declaraciones(temaReservarCssText(null, { tipografia: 'serena' }, MARCA));
  assert.match(serena.get('--portal-heading-font')!, /^var\(--font-display-latin\)/);
  assert.match(serena.get('--font-ui')!, /^var\(--font-ui-latin\)/);
  const nitida = declaraciones(temaReservarCssText(null, { tipografia: 'nitida' }, MARCA));
  assert.match(nitida.get('--portal-heading-font')!, /^var\(--font-ui-latin\)/);
});

test('la composición base es la de app/_fuentes/fuentes.css, no una copia que se separe', () => {
  const hoja = readFileSync(new URL('../../app/_fuentes/fuentes.css', import.meta.url), 'utf8');
  for (const [v, base] of Object.entries(FUENTE_BASE)) {
    assert.ok(hoja.includes(`${v}: ${base};`), `${v} ya no se compone así en fuentes.css`);
  }
  assert.equal(pilaSinCiclo('var(--font-jakarta), system-ui'), 'var(--font-jakarta), system-ui');
});

test('una pareja elegida llega entera: texto, titulares, modales y peso', () => {
  const d = declaraciones(temaReservarCssText(null, { tipografia: 'editorial' }, MARCA));
  assert.match(d.get('--font-ui')!, /^var\(--font-figtree\)/);
  assert.match(d.get('--portal-heading-font')!, /^var\(--font-libre-caslon\)/);
  assert.equal(d.get('--font-display'), d.get('--portal-heading-font'));
  assert.equal(d.get('--reservar-heading-weight'), '700');
});

// ── Estilos: los neutros se leen ────────────────────────────────────────────

test('cada estilo se lee en /reservar: texto y secundario en AA sobre fondo, tarjeta y relleno', () => {
  for (const e of ESTILOS) {
    const t = tokensDeEstilo(e);
    for (const fondo of [t.bg, t.surface, t.surface2]) {
      assert.ok(r(t.ink, fondo) >= 7, `${e.id}: texto sobre ${fondo}`);
      assert.ok(r(t.muted, fondo) >= 4.5, `${e.id}: secundario sobre ${fondo}`);
      assert.ok(r(t.muted2, fondo) >= 4.5, `${e.id}: secundario 2 sobre ${fondo}`);
    }
    // Las versalitas de apoyo: AA donde viven (fondo y tarjeta) en los estilos
    // de la app. Crema es la paleta de siempre, donde van exentas a propósito
    // (versalitas hiperespaciadas, cabecera de reservar-publico-tokens.ts) y
    // no se tocan: la regla es que sin elegir nada no cambie ni un píxel.
    if (e.id === 'crema') continue;
    for (const fondo of [t.bg, t.surface]) assert.ok(r(t.micro, fondo) >= 4.5, `${e.id}: apoyo sobre ${fondo}`);
  }
});

test('un estilo que no es Crema llega como --portal-*; Carbón además pinta el body y pide color-scheme oscuro', () => {
  const arena = temaReservarCssText(null, { estilo: 'arena' }, MARCA);
  assert.match(arena, /--portal-bg: #F4EEE5;/);
  assert.match(arena, /--portal-surface: #FFFCF7;/);
  assert.match(arena, /body\{background:#F4EEE5;\}$/);
  assert.doesNotMatch(arena, /color-scheme/);
  const carbon = temaReservarCssText(null, { estilo: 'carbon' }, MARCA);
  assert.match(carbon, /--portal-bg: #17181B;/);
  assert.match(carbon, /--portal-ink: #F2F3F5;/);
  assert.match(carbon, /:root\{color-scheme:dark;\}$/);
  assert.deepEqual(temaAppParaReservar({ estilo: 'carbon' }).oscuro, true);
  assert.equal(temaAppParaReservar({ estilo: 'carbon' }).tokens.bg, '#17181B');
});

test('el degradado de la portada sale del estilo, sin un hex que no sea suyo', () => {
  for (const e of ESTILOS.filter(x => x.id !== 'crema')) {
    const hero = tokensDeEstilo(e).hero;
    assert.match(hero, /^linear-gradient\(175deg,#[0-9a-f]{6} 0%,#[0-9a-f]{6} 58%,#[0-9a-f]{6} 100%\)$/i, `${e.id}: ${hero}`);
    assert.ok(hero.toLowerCase().includes(e.background.toLowerCase()), `${e.id}: el degradado acaba o empieza en su fondo`);
  }
});

// ── Marca ───────────────────────────────────────────────────────────────────

test('ningún color de marca, en ningún estilo, deja un botón o un enlace ilegible en /reservar', () => {
  const colores = ['#FFFFFF', '#FFFF00', '#F7A6C4', '#00FF00', '#666dcc', '#6366f1', '#000000', '#E11D48', '#0EA5E9', '#C9A227'];
  for (const e of ESTILOS) for (const marca of ['suave', 'fiel'] as const) for (const c of colores) {
    const crudo = { estilo: e.id, marca, tipografia: 'editorial' };
    const d = declaraciones(temaReservarCssText(c, crudo, MARCA));
    const t = tokensDeEstilo(e);
    const brand = d.get('--portal-brand')!;
    assert.equal(brand, acentoDe(c, resolverApariencia(crudo)).accent);
    assert.ok(r(d.get('--portal-brand-foreground')!, brand) >= 4.5, `${e.id}/${marca}/${c}: texto sobre botón`);
    for (const fondo of [t.bg, t.surface, t.surface2]) {
      assert.ok(r(d.get('--portal-brand-texto')!, fondo) >= 4.5, `${e.id}/${marca}/${c}: marca como texto sobre ${fondo}`);
    }
    // Lo que la app ya garantiza: sobre un fondo oscuro, el acento se separa del fondo.
    if (e.oscuro) assert.ok(r(brand, t.bg) >= 4.5, `${e.id}/${marca}/${c}: marca sobre fondo oscuro`);
  }
});

test('la marca del estudio tal cual queda siempre a mano para el widget', () => {
  const css = temaReservarCssText('#1F4E79', { estilo: 'carbon', marca: 'fiel' }, MARCA);
  const d = declaraciones(css);
  assert.equal(d.get('--portal-brand-estudio'), '#2C352C');
  assert.equal(d.get('--portal-brand-estudio-foreground'), '#FFFFFF');
  assert.equal(d.get('--portal-brand-estudio-texto'), '#2C352C');
  assert.notEqual(d.get('--portal-brand'), '#2C352C');
  // Sin la marca del tema, la de `:root`, nunca un hueco.
  assert.equal(declaraciones(temaReservarCssText(null, null, null)).get('--portal-brand-estudio'), 'var(--portal-brand)');
});

test('la marca del tema solo se acepta si es hex: acaba dentro de un <style>', () => {
  assert.deepEqual(
    marcaEstudioDeVars({ '--portal-brand': '#2C352C', '--portal-brand-foreground': '#FFFFFF', '--portal-brand-texto': '#2C352C', '--otro': 1 }),
    { brand: '#2C352C', foreground: '#FFFFFF', texto: '#2C352C' },
  );
  assert.equal(marcaEstudioDeVars({ '--portal-brand': 'red}</style>', '--portal-brand-foreground': '#FFFFFF', '--portal-brand-texto': '#000' }), null);
  assert.equal(marcaEstudioDeVars({ '--portal-brand': '#2C352C' }), null);
  assert.equal(marcaEstudioDeVars(null), null);
});

test('la marca como texto se mide contra la superficie que peor contrasta (en Luz, la tarjeta)', () => {
  const luz = tokensDeEstilo(ESTILOS.find(e => e.id === 'luz')!);
  // Un gris medio que pasa sobre blanco (el fondo de Luz) pero no sobre su
  // tarjeta gris: medir solo el fondo lo daría por bueno.
  const gris = '#737373';
  assert.ok(r(gris, luz.bg) >= 4.5);
  assert.ok(r(gris, luz.surface) < 4.5);
  const texto = textoDeMarca(gris, luz);
  for (const f of [luz.bg, luz.surface, luz.surface2]) assert.ok(r(texto, f) >= 4.5, `sobre ${f}`);
});
