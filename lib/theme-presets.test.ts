import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_PRESETS } from './theme-presets.ts';
import { cumpleContraste } from './wcag-contrast.ts';

// `secondary` de cada preset se usa por todo el panel/portal como color de
// TEXTO sobre fondos claros (badges, pestañas activas, enlaces — nunca como
// relleno sólido). 5 de los 6 presets originales tenían un `secondary` pastel
// con un contraste real de 1.28–2.50:1 contra blanco — el texto quedaba
// invisible en cualquier estudio que eligiera uno de esos temas. Este test
// bloquea que un preset nuevo (o una regresión de uno existente) reintroduzca
// el mismo bug sin que nadie se dé cuenta hasta verlo en producción.
test('THEME_PRESETS: el secondary de cada preset es legible como texto sobre blanco (WCAG AA)', () => {
  for (const p of THEME_PRESETS) {
    assert.ok(
      cumpleContraste(p.secondary, '#FFFFFF'),
      `${p.label} (${p.id}): secondary ${p.secondary} no cumple WCAG AA (4.5:1) contra blanco`,
    );
  }
});
