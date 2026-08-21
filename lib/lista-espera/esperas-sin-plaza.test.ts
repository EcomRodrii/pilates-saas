import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidirCierreDeEspera, suscripcionDeReservaWeb, PREFIJO_RESERVA_WEB,
  type CompraDeLaEspera,
} from './esperas-sin-plaza.ts';
import { idsDe } from '../billing/entregar-plan-comprado.ts';

const compra = (p: Partial<CompraDeLaEspera> = {}): CompraDeLaEspera =>
  ({ tipoPlan: 'BONO', sesionesRestantes: 10, estadoSuscripcion: 'ACTIVA', ...p });

test('clase suelta: se avisa a la socia Y al estudio', () => {
  // El caso delicado: lo que le queda no es "un crédito", es el importe entero
  // de lo que pagó por una clase a la que no entró. Alguien tiene que decidir.
  const r = decidirCierreDeEspera(compra({ tipoPlan: 'PUNTUAL', sesionesRestantes: 1 }));
  assert.deepEqual(r, { avisarSocia: true, avisarEstudio: true, sesionesRestantes: 1 });
});

test('bono de varias sesiones: solo aviso informativo a la socia', () => {
  const r = decidirCierreDeEspera(compra({ sesionesRestantes: 9 }));
  assert.equal(r.avisarSocia, true);
  assert.equal(r.avisarEstudio, false, 'un bono con saldo no es trabajo para el mostrador');
  assert.equal(r.sesionesRestantes, 9);
});

test('mensualidad: silencio absoluto', () => {
  // Compró acceso al mes, no a esa clase. No ha perdido nada: avisarla sería
  // inventarle un problema.
  const r = decidirCierreDeEspera(compra({ tipoPlan: 'MENSUAL', sesionesRestantes: null }));
  assert.deepEqual(r, { avisarSocia: false, avisarEstudio: false, sesionesRestantes: 0 });
});

test('sin crédito real: ni socia ni estudio', () => {
  // Bolsa ya gastada (usó la sesión en otra clase antes del barrido).
  assert.equal(decidirCierreDeEspera(compra({ sesionesRestantes: 0 })).avisarSocia, false);
  // Suscripción caducada/cancelada: no queda crédito del que hablar.
  assert.equal(decidirCierreDeEspera(compra({ estadoSuscripcion: 'CANCELADA' })).avisarSocia, false);
  assert.equal(decidirCierreDeEspera(compra({ estadoSuscripcion: null })).avisarSocia, false);
});

test('la reserva lleva dentro el bono que se pagó por ella', () => {
  // La cadena real: un PaymentIntent produce los cuatro ids de la compra, y el
  // barrido solo tiene la reserva a mano. Si `idsDe` cambiara de forma sin que
  // esto cambie con ella, el barrido buscaría una suscripción inexistente y
  // dejaría de avisar a nadie EN SILENCIO — por eso se cruza contra `idsDe`
  // de verdad y no contra una cadena escrita a mano.
  const ids = idsDe('pi_3U6fSXJyFtzyfjtm1lM0BHcF');
  assert.equal(suscripcionDeReservaWeb(ids.reservaId), ids.suscripcionId);
  assert.ok(ids.reservaId.startsWith(PREFIJO_RESERVA_WEB));
});

test('una reserva que no viene de un pago del widget no recibe nada', () => {
  // Quien se apunta a la cola con un bono que ya tenía no pagó por ESA clase:
  // contarle que "su crédito sigue vivo" sería un correo sin sentido.
  assert.equal(suscripcionDeReservaWeb('res-14'), null);
  assert.equal(suscripcionDeReservaWeb('res-abc123'), null);
  assert.equal(suscripcionDeReservaWeb(PREFIJO_RESERVA_WEB), null, 'sin base no hay suscripción');
});
