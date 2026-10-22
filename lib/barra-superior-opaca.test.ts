import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('la barra de arriba del panel es opaca: ni fondo al 80 % ni desenfoque', () => {
  const barra = readFileSync(new URL('../components/layout/topbar.tsx', import.meta.url), 'utf8');
  const linea = barra.split('\n').find((l) => l.includes('data-panel-topbar'));
  assert.ok(linea, 'no se encuentra la barra');
  assert.match(linea, /\bbg-background\b(?!\/)/);
  assert.doesNotMatch(linea, /bg-background\/|backdrop-blur|bg-card\/|bg-transparent/);
});
