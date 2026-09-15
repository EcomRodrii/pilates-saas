import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CAMPO_NOTA, MAX_TEXTO_NOTA, leerNotaDeSesion } from './nota-sesion.ts';

test('una nota con solo «qué tal ha ido» vale; el resto queda en null', () => {
  assert.deepEqual(leerNotaDeSesion({ textoLibre: '  Mejor movilidad de cadera  ' }), {
    ok: true,
    nota: { textoLibre: 'Mejor movilidad de cadera', progreso: null, alertas: null, planProximaSesion: null, sesionId: null },
  });
});

test('recoge los apartados opcionales y la clase', () => {
  const r = leerNotaDeSesion({
    textoLibre: 'Bien', progreso: 'Aguanta la plancha', alertas: '', planProximaSesion: 'Trabajar puente', sesionId: 'ses-1',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.nota.progreso, 'Aguanta la plancha');
    assert.equal(r.nota.alertas, null, 'vacío = sin valor');
    assert.equal(r.nota.planProximaSesion, 'Trabajar puente');
    assert.equal(r.nota.sesionId, 'ses-1');
  }
});

test('sin «qué tal ha ido» no se guarda', () => {
  assert.deepEqual(leerNotaDeSesion({ textoLibre: '   ', progreso: 'Algo' }), { ok: false, error: 'Cuenta qué tal ha ido la clase.' });
  assert.equal(leerNotaDeSesion(null).ok, false);
});

test('respeta los límites de longitud', () => {
  assert.equal(leerNotaDeSesion({ textoLibre: 'a'.repeat(MAX_TEXTO_NOTA) }).ok, true);
  assert.equal(leerNotaDeSesion({ textoLibre: 'a'.repeat(MAX_TEXTO_NOTA + 1) }).ok, false);
  assert.equal(leerNotaDeSesion({ textoLibre: 'ok', alertas: 'a'.repeat(MAX_CAMPO_NOTA + 1) }).ok, false);
});

test('tipos raros o campos del servidor no cuelan', () => {
  assert.equal(leerNotaDeSesion({ textoLibre: 42 }).ok, false);
  assert.equal(leerNotaDeSesion({ textoLibre: 'ok', sesionId: { $ne: null } }).ok, false);
  // `instructorId`, `socioId`, `creadaEn`… se ignoran: no forman parte de la nota.
  const r = leerNotaDeSesion({ textoLibre: 'ok', instructorId: 'otra', socioId: 'otra', creadaEn: '2020-01-01' });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(Object.keys(r.nota).sort(), ['alertas', 'planProximaSesion', 'progreso', 'sesionId', 'textoLibre']);
});

test('quita caracteres de control pero conserva los saltos de línea', () => {
  const r = leerNotaDeSesion({ textoLibre: 'Línea 1\nLínea 2' });
  assert.equal(r.ok && r.nota.textoLibre, 'Línea 1\nLínea 2');
});
