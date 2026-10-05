// La paleta de Tenti sale de app/globals.css, y este test lee el CSS de verdad
// en vez de copiar aquí los valores: si alguien renombra un token o lo escribe
// mal, Tenti caería a los colores del prototipo ('defecto') en silencio —el
// cuerpo crema que es un foco sobre el panel oscuro— y ningún e2e lo vería,
// porque la única pantalla que lo mira en e2e (la bienvenida) es siempre clara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paletaDesdeTokens, TOKENS_TENTI } from './paleta.ts';
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

test('el cuerpo y los ojos se declaran en los dos modos, no por herencia', () => {
  const oscuro = bloque('.dark');
  for (const t of [TOKENS_TENTI.cuerpoLuz, TOKENS_TENTI.cuerpoSombra, TOKENS_TENTI.tinta]) {
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
