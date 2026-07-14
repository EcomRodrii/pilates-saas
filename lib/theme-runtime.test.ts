import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foregroundParaFondo,
  themeToCssVars,
  themeToCssText,
  validarContrasteTheme,
} from './theme-runtime.ts';
import { DEFAULT_THEME } from './theme-schema.ts';

test('foregroundParaFondo: blanco sobre fondo oscuro, negro sobre fondo claro', () => {
  assert.equal(foregroundParaFondo('#131313'), '#FFFFFF');
  assert.equal(foregroundParaFondo('#FFFFFF'), '#131313');
  assert.equal(foregroundParaFondo('#0F766E'), '#FFFFFF'); // teal oscuro
});

test('themeToCssVars: mapea el tema a las CSS vars que consume la app', () => {
  const vars = themeToCssVars({
    primary: '#0F766E',
    secondary: '#FF7F50',
    accent: '#F5E6CA',
    background: '#FFFFFF',
    text: '#111111',
    fontId: 'inter',
    radius: 'pill',
    faviconUrl: null,
  }) as Record<string, string>;
  assert.equal(vars['--portal-brand'], '#0F766E');
  assert.equal(vars['--brand'], '#0F766E');
  assert.equal(vars['--portal-brand-secondary'], '#FF7F50');
  assert.equal(vars['--background'], '#FFFFFF');
  assert.equal(vars['--foreground'], '#111111');
  assert.equal(vars['--radius'], '2rem'); // pill
  assert.match(vars['--font-sans'], /font-inter/);
  // foreground de marca autoderivado por contraste (teal oscuro → blanco)
  assert.equal(vars['--portal-brand-foreground'], '#FFFFFF');
  assert.equal(vars['--brand-foreground'], '#FFFFFF');
});

test('themeToCssVars: valores crudos/parciales caen a default por token', () => {
  const vars = themeToCssVars({ primary: 'basura' }) as Record<string, string>;
  assert.equal(vars['--portal-brand'], DEFAULT_THEME.primary);
});

test('themeToCssText: envuelve las vars en el selector dado', () => {
  const css = themeToCssText(DEFAULT_THEME, ':root');
  assert.match(css, /^:root \{/);
  assert.match(css, /--portal-brand: #FFC8E2;/);
  assert.match(css, /--radius: 1rem;/); // rounded
  const scoped = themeToCssText(DEFAULT_THEME, '.portal-scope');
  assert.match(scoped, /^\.portal-scope \{/);
});

test('validarContrasteTheme: tema legible pasa el gate', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, text: '#111111', background: '#FFFFFF', primary: '#0F766E' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('validarContrasteTheme: texto sin contraste falla con mensaje', () => {
  const r = validarContrasteTheme({ ...DEFAULT_THEME, text: '#EEEEEE', background: '#FFFFFF' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('texto')));
});
