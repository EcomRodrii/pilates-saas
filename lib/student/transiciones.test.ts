import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apilarRuta, CLASES_ENTRADA, CLASES_SALIDA, reemplazarCima, rutaPadre, TIPO_ADELANTE, TIPO_ATRAS, TIPO_PESTANA } from './transiciones.ts';

test('rutaPadre: una ficha vuelve a su lista', () => {
  assert.equal(rutaPadre('/portal/alba/reservar/ses-1'), '/portal/alba/reservar');
  assert.equal(rutaPadre('/portal/alba/mis-reservas/res-9'), '/portal/alba/mis-reservas');
  assert.equal(rutaPadre('/portal/alba/bonos/b-1'), '/portal/alba/bonos');
  assert.equal(rutaPadre('/portal/alba/perfil/qr'), '/portal/alba/perfil');
});

test('rutaPadre: una pestaña vuelve a Inicio, e Inicio se queda en Inicio', () => {
  assert.equal(rutaPadre('/portal/alba/reservar'), '/portal/alba');
  assert.equal(rutaPadre('/portal/alba'), '/portal/alba');
  assert.equal(rutaPadre('/portal/alba/'), '/portal/alba');
});

test('rutaPadre: la confirmación vuelve al horario; nunca sale del estudio', () => {
  assert.equal(rutaPadre('/portal/alba/reservar/confirmacion'), '/portal/alba/reservar');
  assert.equal(rutaPadre('/otra/cosa'), '/');
  assert.equal(rutaPadre('/portal/alba/reservar/ses-1?x=1'), '/portal/alba/reservar');
});

test('apilarRuta: avanzar apila, volver a la penúltima desapila, repetir no cambia', () => {
  let p: string[] = [];
  p = apilarRuta(p, '/portal/a');
  p = apilarRuta(p, '/portal/a/reservar');
  p = apilarRuta(p, '/portal/a/reservar/c1');
  assert.deepEqual(p, ['/portal/a', '/portal/a/reservar', '/portal/a/reservar/c1']);
  p = apilarRuta(p, '/portal/a/reservar');
  assert.deepEqual(p, ['/portal/a', '/portal/a/reservar']);
  p = apilarRuta(p, '/portal/a/reservar');
  assert.deepEqual(p, ['/portal/a', '/portal/a/reservar']);
});

test('apilarRuta: llegar directo a una ficha (aviso push) deja una sola entrada — no hay historial', () => {
  assert.deepEqual(apilarRuta([], '/portal/a/mis-reservas/r1'), ['/portal/a/mis-reservas/r1']);
});

test('apilarRuta: no crece sin límite', () => {
  let p: string[] = [];
  for (let i = 0; i < 80; i++) p = apilarRuta(p, '/portal/a/x' + i);
  assert.equal(p.length, 50);
  assert.equal(p[49], '/portal/a/x79');
});

test('cada tipo tiene su clase de entrada y de salida, distintas', () => {
  for (const t of [TIPO_ADELANTE, TIPO_ATRAS, TIPO_PESTANA, 'default'] as const) {
    assert.ok(CLASES_ENTRADA[t]);
    assert.ok(CLASES_SALIDA[t]);
    assert.notEqual(CLASES_ENTRADA[t], CLASES_SALIDA[t]);
  }
});

test('reemplazarCima: volver a la pantalla padre sin historial no deja historial falso', () => {
  // Llegó directa a un recibo (aviso push): una sola entrada.
  let p = apilarRuta([], '/portal/a/pagos/p1');
  // «Volver» sin historial → replace a la lista de pagos: sustituye, no apila.
  p = reemplazarCima(p, '/portal/a/pagos');
  assert.deepEqual(p, ['/portal/a/pagos']);
  // Así el siguiente «Volver» sabe que tampoco hay nada detrás.
  assert.equal(p.length >= 2, false);
  assert.deepEqual(reemplazarCima([], '/portal/a'), ['/portal/a']);
});

test('apilarRuta: entrar con el código no deja el login como historial', () => {
  let p = apilarRuta([], '/portal/a/acceso/login');
  p = apilarRuta(p, '/portal/a/acceso/verificar');
  assert.deepEqual(p, []);
  p = apilarRuta(p, '/portal/a');
  assert.deepEqual(p, ['/portal/a']);
});
