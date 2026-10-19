import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROPORCION_PANTALLA_MAC, medidasMac } from './marco-mac-medidas.ts';

// La columna de la vista previa (330 en la hoja a 375, ~480 a 1440) y pantallas grandes.
const ANCHOS = [280, 330, 400, 480, 640, 900, 1300];

test('nada se sale del ancho que hay: ni la base ni la tapa', () => {
  for (const ancho of ANCHOS) {
    const m = medidasMac(ancho);
    assert.ok(m.base.ancho <= ancho, `base ${m.base.ancho} en ${ancho}`);
    assert.ok(m.tapa <= m.base.ancho);
    assert.equal(m.pantalla.ancho + 2 * m.bisel, m.tapa);
  }
});

test('el notch va dentro de la pantalla, y el contenido empieza por debajo de él', () => {
  for (const ancho of ANCHOS) {
    const m = medidasMac(ancho);
    assert.ok(m.notch.ancho < m.pantalla.ancho / 4);
    assert.ok(m.barraSuperior >= m.notch.alto, 'el notch taparía lo de arriba del contenido');
  }
});

test('la pantalla tiene la proporción de un MacBook, y la muesca cabe en la base', () => {
  const m = medidasMac(480);
  assert.ok(Math.abs(m.pantalla.ancho / m.pantalla.alto - PROPORCION_PANTALLA_MAC) < 0.02);
  assert.ok(m.muesca.alto < m.base.alto);
  assert.ok(m.muesca.ancho < m.base.ancho);
  assert.ok(m.biselInferior > m.bisel);
});

test('el Mac lleva sus propios testids y nunca los del iPhone', () => {
  const fuente = readFileSync(join(import.meta.dirname, '..', 'components', 'ui', 'marco-mac.tsx'), 'utf8');
  for (const id of ['mac-pantalla', 'mac-notch', 'mac-base', 'mac-muesca']) assert.match(fuente, new RegExp(`data-testid="${id}"`));
  assert.doesNotMatch(fuente, /iphone-/);
});
