import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THEME } from './theme-schema.ts';
import { getPreset } from './theme-presets.ts';
import { ratioContraste } from './wcag-contrast.ts';
import { CARD_CLARO, CARD_OSCURO, MARCA_DE_FABRICA, esMarcaDeFabrica, variablesDeMarca } from './panel-marca.ts';

// El brand slot del panel (fase 4/5 del Brand System). Qué se escribe en línea y
// qué se deja al valor por defecto del CSS (`.marca-panel`, app/globals.css).

const raiz = join(import.meta.dirname, '..');

test('el tema de fábrica es el de DEFAULT_THEME y el del preset «original»', () => {
  // panel-marca.ts repite los dos valores para no meter zod en el panel: si la
  // fuente cambia, este test lo dice antes de que el panel deje de reconocerla.
  assert.equal(MARCA_DE_FABRICA.primary.toLowerCase(), DEFAULT_THEME.primary.toLowerCase());
  assert.equal(MARCA_DE_FABRICA.secondary.toLowerCase(), DEFAULT_THEME.secondary.toLowerCase());
  const original = getPreset('original');
  assert.ok(esMarcaDeFabrica(original), 'el preset original es el tema de fábrica');
  assert.ok(esMarcaDeFabrica(DEFAULT_THEME));
});

test('con el tema de fábrica no se escribe nada: manda el valor por defecto de la marca', () => {
  assert.equal(variablesDeMarca(DEFAULT_THEME, false), null);
  assert.equal(variablesDeMarca({ primary: '#343825', secondary: '#5a6142' }, true), null, 'sin distinguir mayúsculas');
});

test('un estudio con su color lo conserva, aunque se parezca al de fábrica', () => {
  const vars = variablesDeMarca({ primary: '#333B24', secondary: '#ECDFD2' }, false);
  assert.ok(vars);
  assert.equal(vars['--brand'], '#333B24');
  assert.ok(!esMarcaDeFabrica({ primary: '#343825', secondary: '#ECDFD2' }), 'el secundario también cuenta');
});

test('--brand-medio es legible sobre la tarjeta, también con un color de marca claro', () => {
  // Antes era el oliva para todos. Un estudio con una marca pastel la ponía tal
  // cual como texto (`text-brand`) y no se leía.
  for (const primary of ['#E9DAAF', '#F7A6C4', '#333B24', '#1F4E79', '#FFFFFF']) {
    for (const dark of [false, true]) {
      const vars = variablesDeMarca({ primary, secondary: '#5A6142' }, dark)!;
      const card = dark ? CARD_OSCURO : CARD_CLARO;
      const r = ratioContraste(vars['--brand-medio'], card)!;
      assert.ok(r >= 4.5, `${primary} (${dark ? 'oscuro' : 'claro'}) → ${vars['--brand-medio']} da ${r.toFixed(2)}:1 sobre ${card}`);
      const f = ratioContraste(vars['--brand-foreground'], primary)!;
      assert.ok(f >= 4.5, `texto sobre ${primary}: ${f.toFixed(2)}:1`);
    }
  }
});

test('las tarjetas con las que se calcula son las del panel', () => {
  // `--card` claro es Paper y oscuro el `surface-raised` de la base oscura (el
  // puente los reapunta). Con la tarjeta vieja (#1E1E22) el cálculo se hacía
  // contra un fondo que ya no existe.
  const tokens = readFileSync(join(raiz, 'brand/tokens.css'), 'utf8');
  assert.match(tokens, new RegExp(`--t-paper:\\s*${CARD_CLARO}`, 'i'));
  const oscuro = tokens.slice(tokens.indexOf('.dark, [data-theme="dark"]'));
  assert.match(oscuro, new RegExp(`--t-surface-raised:\\s*${CARD_OSCURO}`, 'i'));
});
