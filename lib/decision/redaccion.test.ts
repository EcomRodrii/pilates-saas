import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRespuestaIA, type RedaccionOutput } from './redaccion.ts';

function fallback(): RedaccionOutput {
  return {
    saludo: 'Buenos días, Marco. Hoy está todo bastante tranquilo.',
    items: new Map([
      ['a', { titulo: 'Noto a Laura viniendo menos de lo habitual', motivo: 'Lleva 18 días sin aparecer.' }],
      ['b', { titulo: 'Se quedaron 2 pagos sin completar', motivo: 'Son 180€ pendientes de cobrar.' }],
    ]),
  };
}

test('validarRespuestaIA: JSON válido con ids conocidos reemplaza el texto del motor', () => {
  const raw = JSON.stringify({
    saludo: 'Buenos días, Marco. Solo 2 cosas hoy.',
    items: [
      { id: 'a', titulo: 'Noto a Laura a punto de irse', motivo: 'Venía 3x/semana y lleva 18 días sin aparecer.' },
    ],
  });
  const r = validarRespuestaIA(raw, fallback());
  assert.equal(r.saludo, 'Buenos días, Marco. Solo 2 cosas hoy.');
  assert.equal(r.items.get('a')?.titulo, 'Noto a Laura a punto de irse');
  // 'b' no vino en la respuesta → conserva el texto del motor.
  assert.equal(r.items.get('b')?.titulo, 'Se quedaron 2 pagos sin completar');
});

test('validarRespuestaIA: JSON inválido → fallback completo (nunca bloquea el análisis)', () => {
  const r = validarRespuestaIA('esto no es JSON', fallback());
  assert.deepEqual(r, fallback());
});

test('validarRespuestaIA: id desconocido se ignora sin afectar a los demás', () => {
  const raw = JSON.stringify({ items: [{ id: 'fantasma', titulo: 'X', motivo: 'Y' }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.equal(r.items.has('fantasma'), false);
  assert.equal(r.items.size, 2);
});

test('validarRespuestaIA: título > 80 caracteres se rechaza, conserva el del motor', () => {
  const tituloLargo = 'X'.repeat(81);
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: tituloLargo, motivo: 'ok' }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.notEqual(r.items.get('a')?.titulo, tituloLargo);
});

test('validarRespuestaIA: motivo > 240 caracteres se rechaza, conserva el del motor', () => {
  const motivoLargo = 'X'.repeat(241);
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: 'ok', motivo: motivoLargo }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.notEqual(r.items.get('a')?.motivo, motivoLargo);
});

test('validarRespuestaIA: item con tipos incorrectos (no string) se ignora', () => {
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: 123, motivo: 'ok' }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.equal(r.items.get('a')?.titulo, 'Noto a Laura viniendo menos de lo habitual');
});

test('validarRespuestaIA: saludo vacío o ausente conserva el saludo base', () => {
  const r = validarRespuestaIA(JSON.stringify({ items: [] }), fallback());
  assert.equal(r.saludo, fallback().saludo);
});
