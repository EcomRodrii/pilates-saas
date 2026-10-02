import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENSAJE_COBRO_CON_METODO_GUARDADO, resultadoDeConfirmacion } from './marcar-cobrado.ts';
import { MENSAJE_SE_ABRIO_UN_PAGO } from '../billing/pago-online-al-cobrar-a-mano.ts';

// «Marcar cobrado» sobre un recibo que se está cobrando AHORA con su tarjeta o
// domiciliación guardada (la marca de `cobrarReciboOffSession`): no se cobra, y la
// pantalla dice por qué y qué esperar, no «este recibo ya no se puede cobrar».

test('cobro en marcha con la tarjeta guardada: no cobrable, con el mensaje que dice qué pasa y cuánto esperar', () => {
  for (const estado of ['PENDIENTE', 'FALLIDO']) {
    const r = resultadoDeConfirmacion('rec-1', { ok: false, codigo: 'NO_COBRABLE', error: 'x', estado, enMarcha: true });
    assert.deepEqual(r, { reciboId: 'rec-1', resultado: 'no_cobrable', selladoOk: true, error: MENSAJE_COBRO_CON_METODO_GUARDADO }, estado);
  }
  assert.match(MENSAJE_COBRO_CON_METODO_GUARDADO, /no se ha cobrado aquí/);
});

test('sin la marca, el NO_COBRABLE de siempre', () => {
  const r = resultadoDeConfirmacion('rec-1', { ok: false, codigo: 'NO_COBRABLE', error: 'x', estado: 'ANULADO' });
  assert.notEqual(r.error, MENSAJE_COBRO_CON_METODO_GUARDADO);
});

test('el aviso del cobro uno a uno («mientras tanto…») cubre también la tarjeta guardada, que no se cierra a mano', () => {
  assert.match(MENSAJE_SE_ABRIO_UN_PAGO, /tarjeta o domiciliación guardada/);
  assert.doesNotMatch(MENSAJE_SE_ABRIO_UN_PAGO, /Vuelve a intentarlo\./, 'reintentar enseguida no sirve si se está cobrando con la tarjeta');
});
