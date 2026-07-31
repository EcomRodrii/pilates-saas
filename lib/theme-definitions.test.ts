import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DEFINITIONS, getThemeDefinition } from './theme-definitions.ts';
import { themeDraftSchema } from './theme-schema.ts';

test('THEME_DEFINITIONS: ids únicos, y "classic" existe con defaults vacíos (el tema de siempre)', () => {
  const ids = THEME_DEFINITIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const clasico = getThemeDefinition('classic');
  assert.ok(clasico);
  assert.deepEqual(clasico!.defaults, {});
  assert.deepEqual(clasico!.capabilities, []);
});

test('THEME_DEFINITIONS: cada "defaults" es un ThemeDraft válido (nada que rompa al aplicarlo)', () => {
  for (const def of THEME_DEFINITIONS) {
    const r = themeDraftSchema.safeParse(def.defaults);
    assert.equal(r.success, true, `defaults de "${def.id}" no es un ThemeDraft válido`);
  }
});

test('getThemeDefinition: "geometric" fija portalHeadingFontId a outfit y declara la capability', () => {
  const geo = getThemeDefinition('geometric');
  assert.ok(geo);
  assert.equal(geo!.defaults.portalHeadingFontId, 'outfit');
  assert.ok(geo!.capabilities.includes('typography'));
});

test('getThemeDefinition: id desconocido → undefined', () => {
  assert.equal(getThemeDefinition('no-existe'), undefined);
});
