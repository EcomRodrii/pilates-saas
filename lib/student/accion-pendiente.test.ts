import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alLlegarAccionPendiente, dejarAccionPendiente, tomarAccionPendiente } from './accion-pendiente.ts';

const accion = { tipo: 'aceptar-oferta' as const, sesionId: 'ses-1', slug: 'alma' };

test('la orden se recoge UNA vez y solo en su estudio', () => {
  dejarAccionPendiente(accion, 1000);
  assert.equal(tomarAccionPendiente('otro', 1001), null, 'otro estudio no se la lleva');
  assert.deepEqual(tomarAccionPendiente('alma', 1002), accion);
  assert.equal(tomarAccionPendiente('alma', 1003), null, 'no se ejecuta dos veces');
});

test('una orden que nadie recoge a tiempo caduca: no se ejecuta más tarde por sorpresa', () => {
  dejarAccionPendiente(accion, 0);
  assert.equal(tomarAccionPendiente('alma', 2 * 60_000 + 1), null);
});

test('avisa a la pantalla que ya estaba abierta, y deja de avisar al desmontar', () => {
  let veces = 0;
  const dejar = alLlegarAccionPendiente(() => { veces++; });
  dejarAccionPendiente(accion);
  dejar();
  dejarAccionPendiente(accion);
  assert.equal(veces, 1);
  tomarAccionPendiente('alma');
});

test('ni la URL ni el almacenamiento: el módulo no lee ni escribe ninguno', async () => {
  const { readFileSync } = await import('node:fs');
  const codigo = readFileSync(new URL('./accion-pendiente.ts', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codigo, /localStorage|sessionStorage|location|searchParams/);
});
