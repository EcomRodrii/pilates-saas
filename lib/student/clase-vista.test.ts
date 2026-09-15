import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ocupacion, textoAperturaLista, textoPlazasLibres } from './clase-vista.ts';

test('ocupación: plazas libres y porcentaje para la barra', () => {
  assert.deepEqual(ocupacion({ confirmadas: 5, aforo: 8 }), { confirmadas: 5, aforo: 8, libres: 3, porcentaje: 63 });
  assert.deepEqual(ocupacion({ confirmadas: 8, aforo: 8 }), { confirmadas: 8, aforo: 8, libres: 0, porcentaje: 100 });
  // Sobreventa (plaza fija + reserva): la barra no pasa del 100 % ni hay libres negativas.
  assert.deepEqual(ocupacion({ confirmadas: 9, aforo: 8 }), { confirmadas: 9, aforo: 8, libres: 0, porcentaje: 100 });
  assert.equal(ocupacion({ confirmadas: 0, aforo: 0 }).porcentaje, 0);
});

test('texto de plazas libres', () => {
  assert.equal(textoPlazasLibres(ocupacion({ confirmadas: 5, aforo: 8 })), 'Quedan 3 plazas');
  assert.equal(textoPlazasLibres(ocupacion({ confirmadas: 7, aforo: 8 })), 'Queda 1 plaza');
  assert.equal(textoPlazasLibres(ocupacion({ confirmadas: 8, aforo: 8 })), 'Completa');
});

const CLASE = { inicio: '2026-09-18T16:00:00.000Z', fin: '2026-09-18T16:55:00.000Z', hora: '18:00', cancelada: false };

test('antes de que se abra la lista, dice desde qué hora', () => {
  const ahora = Date.parse('2026-09-18T10:00:00Z');
  assert.equal(textoAperturaLista(CLASE, ahora), 'Podrás pasar lista desde las 17:00');
});

test('con la lista abierta, cancelada o ya cerrada, no dice nada', () => {
  assert.equal(textoAperturaLista(CLASE, Date.parse('2026-09-18T15:30:00Z')), null, 'abierta (30 min antes)');
  assert.equal(textoAperturaLista({ ...CLASE, cancelada: true }, Date.parse('2026-09-18T10:00:00Z')), null);
  assert.equal(textoAperturaLista(CLASE, Date.parse('2026-09-20T10:00:00Z')), null, 'ya pasó la ventana');
});

test('una clase a las 00:30 abre la lista a las 23:30', () => {
  const temprana = { inicio: '2026-09-18T22:30:00.000Z', fin: '2026-09-18T23:25:00.000Z', hora: '00:30', cancelada: false };
  assert.equal(textoAperturaLista(temprana, Date.parse('2026-09-18T10:00:00Z')), 'Podrás pasar lista desde las 23:30');
});
