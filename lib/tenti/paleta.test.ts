// La paleta de Tenti sale de app/globals.css, y este test lee el CSS de verdad
// en vez de copiar aquí los valores: si alguien renombra un token o lo escribe
// mal, Tenti caería a los colores del prototipo ('defecto') en silencio —el
// cuerpo crema que es un foco sobre el panel oscuro— y ningún e2e lo vería,
// porque la única pantalla que lo mira en e2e (la bienvenida) es siempre clara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coloresDeTrajeDesdeTokens, hexDeColorCss, paletaDesdeTokens, siluetaDelTraje, TOKENS_TENTI, TOKENS_TRAJE } from './paleta.ts';
import { TRAJES } from './trajes.ts';
import { luminanciaRelativa, hexARgb, ratioContraste } from '../wcag-contrast.ts';

const css = readFileSync(join(import.meta.dirname, '../../app/globals.css'), 'utf8');

/** Los tokens hex de un bloque: el PRIMER `:root {` y el `.dark {`. */
function bloque(selector: ':root' | '.dark'): Record<string, string> {
  const i = css.indexOf(`\n${selector} {`);
  assert.notEqual(i, -1, `no se encuentra el bloque ${selector} en globals.css`);
  const cuerpo = css.slice(i, css.indexOf('\n}', i));
  return Object.fromEntries([...cuerpo.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [m[1], m[2]]));
}
const CLARO = bloque(':root');
// .dark solo redefine lo que cambia; el resto lo hereda de :root.
const OSCURO = { ...CLARO, ...bloque('.dark') };
const MODOS = [['claro', CLARO], ['oscuro', OSCURO]] as const;

// getPropertyValue devuelve el valor con el espacio de después de los dos puntos.
const lector = (tokens: Record<string, string>) => (t: string) => (t in tokens ? ` ${tokens[t]}` : '');

for (const [modo, tokens] of MODOS) {
  test(`(${modo}) la paleta es exactamente la de globals.css`, () => {
    assert.deepEqual(paletaDesdeTokens(lector(tokens)), {
      cuerpo: [tokens['--tenti-cuerpo-luz'], tokens['--tenti-cuerpo-sombra']],
      tinta: tokens['--tenti-tinta'],
      rubor: tokens['--tenti-rubor'],
      chispa: tokens['--tenti-chispa'],
      hecho: tokens['--success'],
    });
  });

  // Decorativas, así que no se les pide AA, pero por debajo de 2:1 dejan de
  // verse: la chispa blanca del prototipo daba 1:1 sobre --card en claro.
  test(`(${modo}) las chispas se ven sobre --background y sobre --card`, () => {
    const chispa = tokens['--tenti-chispa'];
    for (const fondo of ['--background', '--card']) {
      const r = ratioContraste(chispa, tokens[fondo])!;
      assert.ok(r >= 2, `--tenti-chispa (${chispa}) da ${r.toFixed(2)}:1 sobre ${fondo} (${tokens[fondo]})`);
    }
  });
}

// La silueta del icono (components/tenti/tenti-icono.tsx) es lo único que lo
// recorta del fondo en claro: el cuerpo crema da 1,04:1 sobre --card. Va aparte
// de TOKENS_TENTI porque la lee el CSS del SVG, no el canvas. 3:1 es lo que
// WCAG 1.4.11 pide a un objeto gráfico; el icono es decorativo, pero sin ese
// borde a 18 px solo quedan dos ojos flotando.
for (const [modo, tokens] of MODOS) {
  test(`(${modo}) la silueta del icono se ve sobre --card y sobre --background (≥ 3:1)`, () => {
    const silueta = tokens['--tenti-silueta'];
    assert.ok(silueta, `falta --tenti-silueta (${modo})`);
    for (const fondo of ['--card', '--background']) {
      const r = ratioContraste(silueta, tokens[fondo])!;
      assert.ok(r >= 3, `--tenti-silueta (${silueta}) da ${r.toFixed(2)}:1 sobre ${fondo} (${tokens[fondo]})`);
    }
  });
}

// El Orb se fue con sus colores: la lavanda y el rubor eran la única excepción
// de morado y rosa del producto, y no pasan a Tenti. En CUALQUIER bloque, no
// solo en los dos que lee este test (el Orb vivía en un segundo :root).
test('no queda ningún token del Orb en globals.css', () => {
  assert.doesNotMatch(css, /--orb-[\w-]*\s*:/);
});

test('el cuerpo y los ojos se declaran en los dos modos, no por herencia', () => {
  const oscuro = bloque('.dark');
  for (const t of [TOKENS_TENTI.cuerpoLuz, TOKENS_TENTI.cuerpoSombra, TOKENS_TENTI.tinta, '--tenti-silueta']) {
    assert.ok(CLARO[t], `falta ${t} en :root`);
    assert.ok(oscuro[t], `falta ${t} en .dark: heredaría el valor claro`);
  }
});

test('en oscuro el cuerpo no es un foco: más apagado que en claro y nunca más que el texto', () => {
  const L = (hex: string) => luminanciaRelativa(hexARgb(hex)!);
  const luzOscuro = L(OSCURO['--tenti-cuerpo-luz']);
  assert.ok(luzOscuro < L(CLARO['--tenti-cuerpo-luz']), 'el cuerpo oscuro no está más apagado que el claro');
  assert.ok(luzOscuro < L(OSCURO['--foreground']), 'en oscuro, el cuerpo brilla más que el texto del panel');
});

test('un token que falta, vacío o que no es #RRGGBB tira la paleta entera (null)', () => {
  for (const malo of ['', '   ', 'var(--success)', 'rgb(47, 107, 79)', '#FFF', '#2F6B4', 'transparent']) {
    const leer = (t: string) => (t === TOKENS_TENTI.hecho ? malo : lector(CLARO)(t));
    assert.equal(paletaDesdeTokens(leer), null, `aceptó «${malo}» como color`);
  }
  assert.equal(paletaDesdeTokens(() => null), null);
  assert.equal(paletaDesdeTokens(() => undefined), null);
});

test('acepta hex con mayúsculas y minúsculas mezcladas, como el --destructive oscuro', () => {
  assert.match(OSCURO['--destructive'], /[a-f]/, 'el ejemplo real ya no mezcla: actualiza este test');
  const leer = (t: string) => (t === TOKENS_TENTI.chispa ? ' #E08a6B ' : lector(CLARO)(t));
  assert.equal(paletaDesdeTokens(leer)?.chispa, '#E08a6B');
});

// ── El gorro de bruja (--tenti-traje-a/-b) ───────────────────────────────────

test('los colores del gorro se declaran en los dos modos, y en claro son los de TRAJES', () => {
  const oscuro = bloque('.dark');
  for (const t of Object.values(TOKENS_TRAJE)) {
    assert.ok(CLARO[t], `falta ${t} en :root`);
    assert.ok(oscuro[t], `falta ${t} en .dark: heredaría el oliva de claro, que desaparece sobre el fondo oscuro`);
  }
  // TRAJES es lo de por si faltan los tokens: que no diga otra cosa que el CSS.
  assert.deepEqual(coloresDeTrajeDesdeTokens(lector(CLARO)), TRAJES.bruja.colores);
});

for (const [modo, tokens] of MODOS) {
  test(`(${modo}) el cono del gorro se ve sobre --card y --background (≥ 3:1), y la banda contra el cono (≥ 2:1)`, () => {
    const cono = tokens[TOKENS_TRAJE.a], banda = tokens[TOKENS_TRAJE.b];
    for (const fondo of ['--card', '--background']) {
      const r = ratioContraste(cono, tokens[fondo])!;
      assert.ok(r >= 3, `--tenti-traje-a (${cono}) da ${r.toFixed(2)}:1 sobre ${fondo} (${tokens[fondo]})`);
      // Y ahí no lleva borde: no le hace falta.
      assert.equal(siluetaDelTraje(cono, tokens[fondo], 'rgb(1, 2, 3)'), null, `(${modo}) borde de más sobre ${fondo}`);
    }
    const rb = ratioContraste(banda, cono)!;
    assert.ok(rb >= 2, `la banda (${banda}) da ${rb.toFixed(2)}:1 contra el cono (${cono})`);
  });
}

test('(oscuro) el cono se despega del cuerpo (≥ 3:1)', () => {
  const r = ratioContraste(OSCURO[TOKENS_TRAJE.a], OSCURO['--tenti-cuerpo-luz'])!;
  assert.ok(r >= 3, `el gorro da ${r.toFixed(2)}:1 contra el cuerpo`);
});

test('(claro) sobre bg-primary el cono no se despega, y lleva el borde del color del texto', () => {
  const cono = CLARO[TOKENS_TRAJE.a], primario = CLARO['--primary'];
  assert.ok(ratioContraste(cono, primario)! < 3, 'el cono ya se ve sobre bg-primary: el borde sobra, revisa siluetaDelTraje');
  assert.equal(siluetaDelTraje(cono, primario, ' rgb(250, 250, 250) '), 'rgb(250, 250, 250)');
  // Superficie que no se sabe leer: con borde (mejor de más que un gorro invisible).
  assert.equal(siluetaDelTraje(cono, null, 'rgb(250, 250, 250)'), 'rgb(250, 250, 250)');
});

test('un token del gorro que falta no tira la paleta del cuerpo', () => {
  const sinGorro = (t: string) => (Object.values(TOKENS_TRAJE).includes(t as never) ? '' : lector(CLARO)(t));
  assert.equal(coloresDeTrajeDesdeTokens(sinGorro), null);
  assert.notEqual(paletaDesdeTokens(sinGorro), null);
});

test('hexDeColorCss lee los colores calculados del navegador, y nada transparente', () => {
  assert.equal(hexDeColorCss('rgb(19, 19, 19)'), '#131313');
  assert.equal(hexDeColorCss('rgba(255, 255, 255, 1)'), '#ffffff');
  assert.equal(hexDeColorCss('rgb(19 19 19 / 100%)'), '#131313');
  assert.equal(hexDeColorCss('color(srgb 1 0.5 0)'), '#ff8000');
  assert.equal(hexDeColorCss('#ABCDEF'), '#abcdef');
  for (const nada of ['rgba(0, 0, 0, 0)', 'transparent', 'rgb(0 0 0 / 40%)', 'oklab(0.5 0 0)', '', null]) {
    assert.equal(hexDeColorCss(nada), null, String(nada));
  }
});
