import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, plantillaDe } from './catalog.ts';
import { PUSH_POR_TIPO, esPushEditable, pushEfectivo, type RolConPushPorTipo } from './push-por-tipo.ts';

const ROLES: RolConPushPorTipo[] = ['SOCIA', 'INSTRUCTOR'];
const listados = (rol: RolConPushPorTipo) => PUSH_POR_TIPO[rol].flatMap(g => g.tipos.map(t => t.evento));

for (const rol of ROLES) {
  test(`${rol}: todo push que le puede llegar tiene su interruptor`, () => {
    // Un push nuevo para este rol sin fila aquí nacería imposible de apagar
    // por separado: la única salida sería apagar su categoría entera.
    const quePuedeRecibir = Object.entries(REGLAS)
      .filter(([evento, r]) => r.canales.includes('PUSH') && r.priority !== 'CRITICA' && plantillaDe(evento, rol))
      .map(([evento]) => evento);
    const faltan = quePuedeRecibir.filter(e => !listados(rol).includes(e));
    assert.deepEqual(faltan, [], `Añade a PUSH_POR_TIPO.${rol} (lib/notifications/push-por-tipo.ts): ${faltan.join(', ')}`);
  });

  test(`${rol}: cada interruptor gobierna un push que existe para ese rol`, () => {
    // Un interruptor sobre un evento sin PUSH, o que a este rol nunca le llega,
    // es una preferencia que el motor no lee: la pantalla mentiría.
    for (const evento of listados(rol)) {
      const regla = REGLAS[evento];
      assert.ok(regla, `${evento} no está en el catálogo`);
      assert.ok(regla.canales.includes('PUSH'), `${evento} no sale por push`);
      assert.ok(plantillaDe(evento, rol), `${evento} no tiene texto para ${rol}`);
      // Las CRÍTICAS ignoran la preferencia: ofrecer apagarlas sería mentir.
      assert.notEqual(regla.priority, 'CRITICA', `${evento} es CRÍTICA y no se puede apagar`);
    }
  });

  test(`${rol}: sin tipos repetidos`, () => {
    const l = listados(rol);
    assert.equal(new Set(l).size, l.length);
  });
}

test('los recordatorios de 24 h y 1 h se eligen por separado', () => {
  assert.ok(esPushEditable('reserva.recordatorio_24h'));
  assert.ok(esPushEditable('reserva.recordatorio_1h'));
  assert.ok(!esPushEditable('sistema.stripe_desconectado'));
});

test('pushEfectivo: la excepción del tipo manda sobre la categoría', () => {
  assert.equal(pushEfectivo(true, { 'reserva.recordatorio_1h': false }, 'reserva.recordatorio_1h'), false);
  assert.equal(pushEfectivo(false, { 'reserva.recordatorio_1h': true }, 'reserva.recordatorio_1h'), true);
});

test('pushEfectivo: sin excepción hereda la categoría', () => {
  assert.equal(pushEfectivo(false, { 'reserva.recordatorio_1h': true }, 'reserva.plaza_liberada'), false);
  assert.equal(pushEfectivo(true, {}, 'reserva.plaza_liberada'), true);
  assert.equal(pushEfectivo(true, null, 'reserva.plaza_liberada'), true);
  assert.equal(pushEfectivo(false, undefined, 'reserva.plaza_liberada'), false);
});

test('pushEfectivo: un valor que no es booleano no cuenta como excepción', () => {
  assert.equal(pushEfectivo(true, { 'reserva.plaza_liberada': 'no' }, 'reserva.plaza_liberada'), true);
  assert.equal(pushEfectivo(true, ['reserva.plaza_liberada'], 'reserva.plaza_liberada'), true);
});
