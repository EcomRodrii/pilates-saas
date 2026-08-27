import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverTokensReservar, radius, serif, sans, RESERVAR_PALETA } from './reservar-publico-tokens.ts';
import { APARIENCIA_POR_DEFECTO } from './reservar/apariencia-widget.ts';

// ⚠️ El caso más importante de este fichero: sin tocar ningún campo nuevo, el
// widget tiene que verse EXACTAMENTE igual que el default de esta pantalla —
// `RESERVAR_PALETA` (lib/reservar-publico-tokens.ts), NO `MODO_TOKENS`
// (lib/portal-paleta.ts, que es del portal PRIVADO — un contexto de marca
// distinto desde el rediseño de 2026-08-26).

test('sin apariencia personalizada, los tokens son exactamente los de siempre (modo día)', () => {
  const t = resolverTokensReservar(APARIENCIA_POR_DEFECTO, 'dia');
  assert.equal(t.superficie, RESERVAR_PALETA.dia.surface);
  assert.equal(t.tinta, RESERVAR_PALETA.dia.ink);
  assert.equal(t.textoSecundario, RESERVAR_PALETA.dia.muted);
  assert.equal(t.linea, RESERVAR_PALETA.dia.line);
  assert.equal(t.relleno, RESERVAR_PALETA.dia.surface2);
  assert.equal(t.tarjeta, radius.card);
  assert.equal(t.boton, radius.pill);
  assert.equal(t.input, radius.spot);
  assert.equal(t.fuenteUI, sans);
  assert.equal(t.fuenteDisplay, serif);
});

test('en modo noche, cae a la paleta de noche', () => {
  const t = resolverTokensReservar(APARIENCIA_POR_DEFECTO, 'noche');
  assert.equal(t.superficie, RESERVAR_PALETA.noche.surface);
  assert.equal(t.tinta, RESERVAR_PALETA.noche.ink);
});

test('solo se pisa lo que el estudio toca', () => {
  const t = resolverTokensReservar({ ...APARIENCIA_POR_DEFECTO, tinta: '#000000' }, 'dia');
  assert.equal(t.tinta, '#000000');
  assert.equal(t.superficie, RESERVAR_PALETA.dia.surface);
});

test('radioBoton/radioInput heredan de `radio`, no del default fijo', () => {
  const t = resolverTokensReservar({ ...APARIENCIA_POR_DEFECTO, radio: 8 }, 'dia');
  assert.equal(t.tarjeta, 8);
  assert.equal(t.boton, 8);
  assert.equal(t.input, 8);
});

test('fuenteDisplay cae a fuenteUI si no se toca, y a serif si tampoco hay fuenteUI', () => {
  const soloUI = resolverTokensReservar({ ...APARIENCIA_POR_DEFECTO, fuente: 'Space Grotesk' }, 'dia');
  assert.equal(soloUI.fuenteDisplay, "'Space Grotesk', system-ui, sans-serif");
  const ninguna = resolverTokensReservar(APARIENCIA_POR_DEFECTO, 'dia');
  assert.equal(ninguna.fuenteDisplay, serif);
});
