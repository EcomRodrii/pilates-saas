import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  piDeClientSecret,
  emailsCoinciden,
  resolverEstadoPago,
  RETARDOS_POLL_MS,
} from './estado-pago-publico.ts';

test('piDeClientSecret extrae el id del PaymentIntent', () => {
  assert.equal(
    piDeClientSecret('pi_3QeXaMPLe000000000000_secret_ExAmPle0000000000000000'),
    'pi_3QeXaMPLe000000000000',
  );
});

test('piDeClientSecret rechaza formas que no son un clientSecret', () => {
  assert.equal(piDeClientSecret(null), null);
  assert.equal(piDeClientSecret(''), null);
  assert.equal(piDeClientSecret('pi_sin_secreto'), null);
  assert.equal(piDeClientSecret('cs_test_abc_secret_x'), null);
  // El id entero sin la parte _secret_ tampoco vale: el cliente NUNCA debe
  // acabar mandando el clientSecret completo por la URL.
  assert.equal(piDeClientSecret('seti_1abc_secret_x'), null);
});

test('emailsCoinciden: insensible a mayúsculas y espacios', () => {
  assert.equal(emailsCoinciden('Marta.Ruiz@Example.com ', 'marta.ruiz@example.com'), true);
  assert.equal(emailsCoinciden('otra@example.com', 'marta.ruiz@example.com'), false);
});

test('emailsCoinciden: dos vacíos NUNCA coinciden', () => {
  assert.equal(emailsCoinciden('', ''), false);
  assert.equal(emailsCoinciden(null, undefined), false);
  assert.equal(emailsCoinciden('  ', ''), false);
});

test('resolverEstadoPago mapea los estados de reserva del webhook', () => {
  assert.equal(resolverEstadoPago('CONFIRMADA', false), 'confirmada');
  assert.equal(resolverEstadoPago('LISTA_ESPERA', false), 'lista_espera');
  assert.equal(resolverEstadoPago('PENDIENTE_APROBACION', false), 'pendiente_aprobacion');
});

test('resolverEstadoPago: sin reserva y con aviso al mostrador → fallida', () => {
  assert.equal(resolverEstadoPago(null, true), 'fallida');
  assert.equal(resolverEstadoPago(undefined, true), 'fallida');
});

// ⚠️ Desde que el webhook avisa al mostrador TAMBIÉN cuando la reserva cae en
// lista de espera, esa notificación deja de significar «no hay plaza» a secas.
// Si el orden de resolución cambiara y `avisoSinPlaza` ganase a la reserva, la
// pantalla de éxito le diría «no hemos podido asignarte la plaza» a quien SÍ
// tiene sitio en la cola — y el copy honesto de que su bono queda en su cuenta
// se perdería. La fila de `reservas` manda siempre que exista.
test('resolverEstadoPago: en lista de espera manda la reserva, no el aviso al mostrador', () => {
  assert.equal(resolverEstadoPago('LISTA_ESPERA', true), 'lista_espera');
  assert.equal(resolverEstadoPago('CONFIRMADA', true), 'confirmada');
  assert.equal(resolverEstadoPago('PENDIENTE_APROBACION', true), 'pendiente_aprobacion');
});

test('resolverEstadoPago: sin reserva y sin aviso → en_proceso (el webhook puede no haber llegado)', () => {
  assert.equal(resolverEstadoPago(null, false), 'en_proceso');
});

test('resolverEstadoPago: un estado no contemplado nunca inventa confirmación ni fallo', () => {
  // Una reserva EXISTE: el aviso de sin-plaza (de otra sesión, otro momento)
  // no puede convertirla en 'fallida'.
  assert.equal(resolverEstadoPago('CANCELADA', true), 'en_proceso');
  assert.equal(resolverEstadoPago('CANCELADA', false), 'en_proceso');
});

test('la cadencia del polling es creciente y suma ~35s', () => {
  const total = RETARDOS_POLL_MS.reduce((a, b) => a + b, 0);
  assert.ok(total >= 30_000 && total <= 45_000);
  for (let i = 1; i < RETARDOS_POLL_MS.length; i++) {
    assert.ok(RETARDOS_POLL_MS[i] >= RETARDOS_POLL_MS[i - 1]);
  }
});
