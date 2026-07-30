import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  themeConfigSchema,
  resolveTheme,
  DEFAULT_THEME,
  FUENTES,
  RADIOS,
} from './theme-schema.ts';

test('themeConfigSchema acepta un tema completo válido', () => {
  const r = themeConfigSchema.safeParse({
    primary: '#4F46E5',
    secondary: '#22D3EE',
    accent: '#FDE68A',
    background: '#FFFFFF',
    text: '#111111',
    fontId: 'inter',
    radius: 'pill',
    faviconUrl: 'https://cdn.example.com/f.ico',
  });
  assert.equal(r.success, true);
});

test('themeConfigSchema rechaza hex inválido y claves extra (strict)', () => {
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, primary: 'rojo' }).success, false);
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, extra: 1 }).success, false);
});

test('themeConfigSchema rechaza fontId/radius fuera del set curado', () => {
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, fontId: 'comic-sans' }).success, false);
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, radius: 'huge' }).success, false);
});

test('resolveTheme: null/garbage → tema por defecto completo', () => {
  assert.deepEqual(resolveTheme(null), DEFAULT_THEME);
  assert.deepEqual(resolveTheme('nope'), DEFAULT_THEME);
  assert.deepEqual(resolveTheme(42), DEFAULT_THEME);
});

test('resolveTheme: parcial rellena solo los tokens ausentes', () => {
  const r = resolveTheme({ primary: '#000000', fontId: 'serif' });
  assert.equal(r.primary, '#000000');
  assert.equal(r.fontId, 'serif');
  assert.equal(r.background, DEFAULT_THEME.background); // ausente → default
  assert.equal(r.radius, DEFAULT_THEME.radius);
});

test('resolveTheme: fallback POR TOKEN ante un valor inválido', () => {
  const r = resolveTheme({ primary: '#123456', secondary: 'no-es-hex' });
  assert.equal(r.primary, '#123456'); // válido, se respeta
  assert.equal(r.secondary, DEFAULT_THEME.secondary); // inválido → default, sin tumbar el resto
});

test('resolveTheme: faviconUrl inválido → null', () => {
  assert.equal(resolveTheme({ faviconUrl: 'no-url' }).faviconUrl, null);
  assert.equal(resolveTheme({ faviconUrl: 'https://x.com/f.ico' }).faviconUrl, 'https://x.com/f.ico');
});

test('registros curados coherentes', () => {
  assert.ok(FUENTES.some((f) => f.id === 'jakarta'));
  assert.deepEqual(
    RADIOS.map((r) => r.id),
    ['sharp', 'rounded', 'pill'],
  );
});

test('themeConfigSchema: buttonStyle/cardStyle ausentes → default solid/flat (tema guardado antes de esta fase)', () => {
  const sinEstilos: Record<string, unknown> = { ...DEFAULT_THEME };
  delete sinEstilos.buttonStyle;
  delete sinEstilos.cardStyle;
  const r = themeConfigSchema.safeParse(sinEstilos);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.buttonStyle, 'solid');
    assert.equal(r.data.cardStyle, 'flat');
  }
});

test('themeConfigSchema rechaza buttonStyle/cardStyle fuera del set curado', () => {
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, buttonStyle: 'glow' }).success, false);
  assert.equal(themeConfigSchema.safeParse({ ...DEFAULT_THEME, cardStyle: 'glass' }).success, false);
});

test('resolveTheme: buttonStyle/cardStyle inválidos caen a solid/flat', () => {
  const r = resolveTheme({ buttonStyle: 'glow', cardStyle: 'glass' });
  assert.equal(r.buttonStyle, 'solid');
  assert.equal(r.cardStyle, 'flat');
});
