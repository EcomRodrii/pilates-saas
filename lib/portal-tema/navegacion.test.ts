import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repartirDestino } from './navegacion.ts';

// ⚠️ Regresión de un fallo que llegó a producción. El portal manda destinos
// completos; el marco de Next solo sabe de rutas. Todo lo que no era pantalla
// se perdía, y el síntoma que vio el fundador fue "pulso el día 7 y no me
// aparecen mis clases" — sí existían en la base de datos.

test('pulsar un día conserva el día, no solo la pantalla', () => {
  const { screen, estado } = repartirDestino({ screen: 'clases', tab: 'clases', day: 7 });
  assert.equal(screen, 'clases');
  assert.deepEqual(estado, { tab: 'clases', day: 7 });
});

test('abrir una clase conserva el id de la clase', () => {
  const { screen, estado } = repartirDestino({ screen: 'detalle', classId: 'ses-abc' });
  assert.equal(screen, 'detalle');
  assert.deepEqual(estado, { classId: 'ses-abc' });
});

test('un cambio de pantalla a secas no arrastra estado', () => {
  // Sin esto, cada pulsación de la barra inferior escribiría en el estado y
  // provocaría un render de más para no cambiar nada.
  const { screen, estado } = repartirDestino({ screen: 'perfil' });
  assert.equal(screen, 'perfil');
  assert.equal(estado, null);
});

test('una clave presente pero undefined no pisa lo que ya había', () => {
  // `openClass` manda `classId: id || elDeAntes`; si algún camino mandara
  // `undefined`, borrar el día o la clase seleccionada sería peor que no hacer
  // nada.
  const { estado } = repartirDestino({ screen: 'clases', day: undefined, classId: undefined });
  assert.equal(estado, null);
});

test('conserva el día aunque valga 0 (no confundir vacío con falsy)', () => {
  const { estado } = repartirDestino({ screen: 'clases', day: 0 });
  assert.deepEqual(estado, { day: 0 });
});
