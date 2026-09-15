import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoPlazaFijaSinCuota } from './plazas-fijas-sin-cuota.ts';

test('liberar: dice que se liberan, también las de estos días, y sin penalización', () => {
  const t = textoPlazaFijaSinCuota('LIBERAR', 'ahora');
  assert.match(t, /se liberan todas las clases/);
  assert.match(t, /también las de estos días/);
  assert.match(t, /sin penalización/);
});

test('liberar con baja programada: solo las de después del fin del periodo', () => {
  const t = textoPlazaFijaSinCuota('LIBERAR', 'al-final', '15 oct 2026');
  assert.match(t, /después del 15 oct 2026/);
  assert.doesNotMatch(t, /estos días/);
});

test('liberar con las dos opciones aún abiertas: dice qué pasa con cada una', () => {
  const t = textoPlazaFijaSinCuota('LIBERAR', 'elegir', '15 oct 2026');
  assert.match(t, /si le das de baja/);
  assert.match(t, /todas desde hoy si la cancelas ahora/);
});

test('mantener sin penalizar y como hasta ahora: conserva, no se le reservan nuevas, y no prometen lo que no hacen', () => {
  const sinCargo = textoPlazaFijaSinCuota('MANTENER_SIN_PENALIZAR', 'ahora');
  assert.match(sinCargo, /conserva las clases ya reservadas/);
  assert.match(sinCargo, /no se le cobra penalización/);
  assert.match(sinCargo, /No se le reservan clases nuevas/);

  const comoSiempre = textoPlazaFijaSinCuota('MANTENER', 'ahora');
  assert.match(comoSiempre, /conserva las clases ya reservadas/);
  assert.match(comoSiempre, /reglas de siempre/);
  assert.doesNotMatch(comoSiempre, /liber|penalización/);
});
