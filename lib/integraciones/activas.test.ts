import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integracionActiva } from './activas.ts';

test('recepción y gerencia (sin filas: la tabla solo la lee la propietaria): manda lo que dijo el servidor', () => {
  assert.equal(integracionActiva('CLASSPASS', [], ['CLASSPASS', 'KISI']), true);
  assert.equal(integracionActiva('KISI', [], ['CLASSPASS', 'KISI']), true);
  assert.equal(integracionActiva('WELLHUB', [], ['CLASSPASS', 'KISI']), false);
  assert.equal(integracionActiva('CLASSPASS', [], []), false);
});

test('la propietaria: manda su fila, que cambia al encender o apagar sin recargar', () => {
  // La apagó en Conexiones: el servidor la dio activa al arrancar, pero ya no lo está.
  assert.equal(integracionActiva('CLASSPASS', [{ tipo: 'CLASSPASS', activo: false }], ['CLASSPASS']), false);
  // La encendió por primera vez: el arranque no la traía.
  assert.equal(integracionActiva('CLASSPASS', [{ tipo: 'CLASSPASS', activo: true }], []), true);
  // Otra fila no decide por esta.
  assert.equal(integracionActiva('KISI', [{ tipo: 'CLASSPASS', activo: true }], ['KISI']), true);
});
