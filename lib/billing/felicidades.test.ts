import test from 'node:test';
import assert from 'node:assert/strict';
import { FRASES_FELICIDADES, fraseDeFelicidades, tocaFelicitar } from './felicidades.ts';

test('felicita una sola vez, a la propietaria y solo con el margen en marcha', () => {
  const base = { fase: 'MARGEN', esPropietaria: true, cierraEl: '2026-12-03', yaVista: false };
  assert.equal(tocaFelicitar(base), true);
  assert.equal(tocaFelicitar({ ...base, yaVista: true }), false);
  assert.equal(tocaFelicitar({ ...base, esPropietaria: false }), false);
  for (const fase of ['DENTRO', 'CERCA', 'CERRADO', 'SIN_MEDIR']) assert.equal(tocaFelicitar({ ...base, fase }), false, fase);
  assert.equal(tocaFelicitar({ ...base, cierraEl: null }), false);
});

test('la frase es siempre la misma para la misma clave y sale de la lista', () => {
  assert.equal(fraseDeFelicidades('2026-12-03'), fraseDeFelicidades('2026-12-03'));
  for (const k of ['a', '2026-12-03', '2027-01-15', '']) assert.ok(FRASES_FELICIDADES.includes(fraseDeFelicidades(k)));
});

test('las frases no prometen lo que el producto no hace', () => {
  for (const f of FRASES_FELICIDADES) assert.doesNotMatch(f, /gratis para siempre|sin límite|descuento|oferta/i);
});
