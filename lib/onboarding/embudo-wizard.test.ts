import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventoAlLlegar } from './embudo-wizard.ts';

test('cada pantalla emite UNA vez, con su número y el total', () => {
  const vistos = new Set<string>();
  assert.deepEqual(eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'centros', n: 1, total: 11 }), {
    nombre: 'bienvenida_paso', props: { paso: 'centros', n: 1, total: 11 },
  });
  // El motor repinta cada frame: la misma pantalla no vuelve a emitir.
  assert.equal(eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'centros', n: 1, total: 11 }), null);
  assert.deepEqual(eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'salas', n: 2, total: 11 })?.props, { paso: 'salas', n: 2, total: 11 });
});

test('volver atrás a una pantalla ya vista no cuenta otra vez', () => {
  const vistos = new Set<string>();
  eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'centros', n: 1, total: 11 });
  eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'salas', n: 2, total: 11 });
  assert.equal(eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'centros', n: 1, total: 11 }), null);
});

test('retomar un asistente a medias se marca, y solo en el primer paso que se ve', () => {
  const vistos = new Set<string>();
  assert.equal(eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'duracion', n: 4, total: 11 })?.props?.retomado, true);
  assert.equal(eventoAlLlegar(vistos, { fase: 'wizard', pasoId: 'clases', n: 5, total: 11 })?.props?.retomado, undefined);
});

test('empezar por el primero NO es retomar', () => {
  const p = eventoAlLlegar(new Set(), { fase: 'wizard', pasoId: 'centros', n: 1, total: 11 })?.props;
  assert.equal(p?.retomado, undefined);
});

test('el resumen emite una vez; la intro y un paso sin id, nunca', () => {
  const vistos = new Set<string>();
  assert.deepEqual(eventoAlLlegar(vistos, { fase: 'resumen' }), { nombre: 'bienvenida_resumen' });
  assert.equal(eventoAlLlegar(vistos, { fase: 'resumen' }), null);
  assert.equal(eventoAlLlegar(new Set(), { fase: 'intro' }), null);
  assert.equal(eventoAlLlegar(new Set(), { fase: 'wizard', pasoId: null, n: 1, total: 11 }), null);
});

test('el evento no lleva nada de lo que la persona contestó', () => {
  const e = eventoAlLlegar(new Set(), { fase: 'wizard', pasoId: 'software', n: 1, total: 11 });
  assert.deepEqual(Object.keys(e?.props ?? {}).sort(), ['n', 'paso', 'total']);
});
