import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverTokensReservar, tokensCalendarioDeApariencia, radius, serif, sans, RESERVAR_PALETA,
  paletaOscura, pesoTitular, textoSemantico,
} from './reservar-publico-tokens.ts';
import { APARIENCIA_POR_DEFECTO } from './reservar/apariencia-widget.ts';
import { semantic } from './portal-tokens.ts';
import { ratioContraste } from './wcag-contrast.ts';
import { ESTILOS } from './student/apariencia.ts';
import { tokensDeEstilo } from './reservar/tema-app.ts';

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

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría de UX (2026-08-31): `tokensCalendarioDeApariencia` es el fix del
// bug real que dejaba "Colores del widget" (Theme Builder) sin efecto en
// `/reservar/[slug]` — ver el docblock de la función. Mismo criterio de test
// que `resolverTokensReservar` de arriba: sin tocar nada, tokens idénticos a
// la paleta de siempre; tocando un campo, SOLO ese campo cambia, y el resto
// de `ModoTokens` (bg, hero, micro...) queda intacto.
test('tokensCalendarioDeApariencia: sin apariencia personalizada, es exactamente RESERVAR_PALETA.dia', () => {
  const t = tokensCalendarioDeApariencia(APARIENCIA_POR_DEFECTO, 'dia');
  assert.deepEqual(t, RESERVAR_PALETA.dia);
});

test('tokensCalendarioDeApariencia: en noche, es exactamente RESERVAR_PALETA.noche', () => {
  const t = tokensCalendarioDeApariencia(APARIENCIA_POR_DEFECTO, 'noche');
  assert.deepEqual(t, RESERVAR_PALETA.noche);
});

test('tokensCalendarioDeApariencia: pisa superficie/tinta/textoSecundario/linea/relleno, nada más', () => {
  const a = { ...APARIENCIA_POR_DEFECTO, superficie: '#FF00FF', tinta: '#000000', textoSecundario: '#111111', linea: '#222222', relleno: '#333333' };
  const t = tokensCalendarioDeApariencia(a, 'dia');
  assert.equal(t.surface, '#FF00FF');
  assert.equal(t.ink, '#000000');
  assert.equal(t.muted, '#111111');
  assert.equal(t.muted2, '#111111');
  assert.equal(t.line, '#222222');
  assert.equal(t.surface2, '#333333');
  // El resto de ModoTokens (fuera del alcance de los 5 controles) no se toca.
  assert.equal(t.bg, RESERVAR_PALETA.dia.bg);
  assert.equal(t.hero, RESERVAR_PALETA.dia.hero);
  assert.equal(t.micro, RESERVAR_PALETA.dia.micro);
  assert.equal(t.accentInk, RESERVAR_PALETA.dia.accentInk);
});

test('tokensCalendarioDeApariencia: solo el campo tocado cambia', () => {
  const t = tokensCalendarioDeApariencia({ ...APARIENCIA_POR_DEFECTO, tinta: '#ABCDEF' }, 'dia');
  assert.equal(t.ink, '#ABCDEF');
  assert.equal(t.surface, RESERVAR_PALETA.dia.surface);
  assert.equal(t.line, RESERVAR_PALETA.dia.line);
});

// ── Colores de estado sobre la paleta que se ve ─────────────────────────────

test('textoSemantico: sobre el día de siempre, el MISMO hex de antes (sin estilo elegido no cambia un píxel)', () => {
  for (const tipo of ['success', 'warning', 'danger'] as const) {
    assert.equal(textoSemantico(tipo, RESERVAR_PALETA.dia), semantic[tipo].text, tipo);
  }
  assert.equal(paletaOscura(RESERVAR_PALETA.dia), false);
  assert.equal(paletaOscura(RESERVAR_PALETA.noche), true);
});

test('⚠️ textoSemantico: en AA sobre la tarjeta y el fondo de TODOS los estilos y de la noche del widget', () => {
  // `semantic.*.text` fijo daba 3,1:1 (ámbar) y 2,9:1 (rojo) sobre la tarjeta de Carbón.
  const paletas = [...ESTILOS.map(e => [e.id, tokensDeEstilo(e)] as const), ['noche', RESERVAR_PALETA.noche] as const];
  for (const [id, t] of paletas) for (const tipo of ['success', 'warning', 'danger'] as const) {
    assert.ok((ratioContraste(textoSemantico(tipo, t), t.surface) ?? 0) >= 4.5, `${id}/${tipo} sobre la tarjeta`);
    assert.ok((ratioContraste(textoSemantico(tipo, t, t.bg), t.bg) ?? 0) >= 4.5, `${id}/${tipo} sobre el fondo`);
  }
});

test('pesoTitular: sin pareja elegida, el peso de siempre (también «normal» para los titulares que no llevaban)', () => {
  assert.equal(pesoTitular(800), 'var(--reservar-heading-weight, 800)');
  assert.equal(pesoTitular('normal'), 'var(--reservar-heading-weight, normal)');
});
