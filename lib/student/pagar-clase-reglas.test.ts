import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esperaAntesDeConsultar, leerInicioPagoClase, leerOpcionesClase, leerReservaPagada, textoCompensacion,
} from './pagar-clase-reglas.ts';
import { RETARDOS_POLL_MS } from '../billing/estado-pago-publico.ts';

// P06 · Fase A: pagar y reservar una clase desde la app. Lo que la hoja hace con
// cada respuesta del servidor; nada de pago sin la respuesta buena.

const opcion = (o: Record<string, unknown> = {}) => ({
  tipo: 'suelta', planId: 'p-suelta', nombre: 'Clase suelta', importe: 18, sesiones: 1, precioPorClase: 18,
  validezDias: null, quedanTrasEsta: 0, ...o,
});

test('opciones: solo con 200, pagos online y opciones pagables (máximo 3, nunca por debajo de 0,50 €)', () => {
  const r = leerOpcionesClase(200, {
    pagosOnline: true, plaza: { ok: true },
    opciones: [opcion(), opcion({ planId: 'p-0', importe: 0.3 }), opcion({ planId: 'b5', tipo: 'bono', importe: 80 }),
      opcion({ planId: 'b10', importe: 150 }), opcion({ planId: 'b20', importe: 280 }), opcion({ planId: 'np', noPagable: true })],
  });
  assert.equal(r.tipo, 'opciones');
  if (r.tipo === 'opciones') assert.deepEqual(r.opciones.map((o) => o.planId), ['p-suelta', 'b5', 'b10']);
});

test('opciones: el rechazo del servidor manda, con su texto y su puesto', () => {
  const r = leerOpcionesClase(200, {
    pagosOnline: true, opciones: [],
    rechazo: { codigo: 'llena-con-espera', error: 'Esta clase se acaba de llenar. No te hemos cobrado nada.', posicionEspera: 2 },
  });
  assert.deepEqual(r, { tipo: 'rechazo', codigo: 'llena-con-espera', mensaje: 'Esta clase se acaba de llenar. No te hemos cobrado nada.', posicionEspera: 2 });
});

test('opciones: ya pagada y confirmándose → se sondea ese pago, sin ofrecer pagar otra vez', () => {
  assert.deepEqual(leerOpcionesClase(200, { pagosOnline: true, pagoEnCurso: { pi: 'pi_1' }, opciones: [] }), { tipo: 'pago-en-curso', pi: 'pi_1' });
});

test('opciones: preguntas del estudio, sin pagos online o precio especial: nada de pago', () => {
  assert.deepEqual(leerOpcionesClase(200, { pagosOnline: true, bloqueo: 'faltan-preguntas', opciones: [] }), { tipo: 'faltan-preguntas' });
  assert.deepEqual(leerOpcionesClase(200, { pagosOnline: false, plaza: { ok: true }, opciones: [opcion()] }), { tipo: 'sin-pago-online', precioEspecial: false });
  assert.deepEqual(leerOpcionesClase(200, { pagosOnline: true, plaza: { ok: true }, precioEspecial: true, opciones: [] }), { tipo: 'sin-pago-online', precioEspecial: true });
});

test('opciones: 401 (sesión o segundo paso), 500, 429 y cuerpo raro nunca ofrecen pagar', () => {
  assert.deepEqual(leerOpcionesClase(401, {}), { tipo: 'sesion' });
  assert.deepEqual(leerOpcionesClase(401, { codigo: 'doble_factor_requerido' }), { tipo: 'dos-pasos' });
  for (const [s, c] of [[500, { error: 'detalle interno' }], [429, {}], [200, null], [200, 'x']] as const) {
    const r = leerOpcionesClase(s, c);
    assert.ok(r.tipo === 'error' || r.tipo === 'sin-pago-online', `${s}: ${r.tipo}`);
    if (r.tipo === 'error') assert.doesNotMatch(r.mensaje, /detalle interno/);
  }
});

test('cobro: 200 con el importe del servidor; sin clientSecret es un error que no cobra', () => {
  assert.deepEqual(leerInicioPagoClase(200, { clientSecret: 'pi_1_secret_x', importe: 20, descuento: 0, matricula: 0 }),
    { tipo: 'ok', clientSecret: 'pi_1_secret_x', importe: 20, descuento: 0, matricula: 0 });
  assert.equal(leerInicioPagoClase(200, {}).tipo, 'error');
});

test('cobro: pago en curso, preparándose, rechazo con texto del servidor; un 500 no enseña su texto', () => {
  assert.deepEqual(leerInicioPagoClase(409, { codigo: 'pago-en-curso', pi: 'pi_9', error: 'Ya has pagado.' }), { tipo: 'pago-en-curso', pi: 'pi_9', mensaje: 'Ya has pagado.' });
  assert.equal(leerInicioPagoClase(409, { codigo: 'pago-en-curso' }).tipo, 'pago-en-curso');
  assert.deepEqual(leerInicioPagoClase(409, { codigo: 'pago-preparandose', error: 'x' }), { tipo: 'preparandose' });
  assert.deepEqual(leerInicioPagoClase(409, { codigo: 'llena-con-espera', error: 'Se ha llenado. No te hemos cobrado nada.' }),
    { tipo: 'rechazo', codigo: 'llena-con-espera', mensaje: 'Se ha llenado. No te hemos cobrado nada.' });
  const e = leerInicioPagoClase(500, { error: 'stack' });
  assert.equal(e.tipo, 'error');
  if (e.tipo === 'error') assert.match(e.mensaje, /No se te ha cobrado nada/);
  assert.deepEqual(leerInicioPagoClase(401, { codigo: 'doble_factor_requerido' }), { tipo: 'dos-pasos' });
});

test('después de pagar: «confirmada» solo si el servidor lo dice; todo lo demás no es un ✓', () => {
  assert.deepEqual(leerReservaPagada(200, null, { estado: 'confirmada', clase: { nombre: 'Reformer', inicio: '2026-10-07T07:00:00Z' } }),
    { tipo: 'confirmada', clase: { nombre: 'Reformer', inicio: '2026-10-07T07:00:00Z' } });
  assert.deepEqual(leerReservaPagada(200, null, { estado: 'en_proceso' }), { tipo: 'en_proceso' });
  assert.deepEqual(leerReservaPagada(500, null, { estado: 'confirmada' }), { tipo: 'en_proceso' }, 'un 500 no es una respuesta');
  assert.deepEqual(leerReservaPagada(429, '7', {}), { tipo: 'en_proceso', esperaMinMs: 7000 });
  assert.equal(leerReservaPagada(200, null, { estado: 'compensada', compensacion: { motivo: 'EN_ESPERA', enEspera: true, posicion: 1 } }).tipo, 'compensada');
  assert.deepEqual(leerReservaPagada(200, null, { estado: 'compensada' }), { tipo: 'compensada', compensacion: { motivo: 'ERROR', enEspera: false } });
  assert.deepEqual(leerReservaPagada(200, null, { estado: 'fallida' }), { tipo: 'fallida' });
  assert.deepEqual(leerReservaPagada(401, null, {}), { tipo: 'sesion' });
});

test('la espera entre consultas es la de /reservar y se acaba', () => {
  assert.equal(esperaAntesDeConsultar(0), RETARDOS_POLL_MS[0]);
  assert.equal(esperaAntesDeConsultar(RETARDOS_POLL_MS.length), null);
  assert.equal(esperaAntesDeConsultar(0, 60_000), 60_000, 'el Retry-After alarga, nunca acorta');
});

test('compensación: dice la posición real, lo que tiene a su favor y «el estudio ya lo sabe» solo si lo sabe', () => {
  const t = textoCompensacion({ motivo: 'EN_ESPERA', enEspera: true, posicion: 1, bono: { nombre: 'Clase suelta', sesionesRestantes: 1, fechaFin: '2026-11-06' }, estudioAvisado: true }, (f) => f);
  assert.equal(t.titulo, 'Estás la 1.ª en la lista de espera');
  assert.match(t.cuerpo, /Tienes 1 clase en Clase suelta hasta el 2026-11-06/);
  assert.match(t.cuerpo, /El estudio ya lo sabe/);
  const sinAviso = textoCompensacion({ motivo: 'SIN_PLAZA', enEspera: false });
  assert.doesNotMatch(sinAviso.cuerpo, /ya lo sabe/);
  assert.match(sinAviso.cuerpo, /queda a tu favor/);
  for (const motivo of ['PENDIENTE_APROBACION', 'YA_TENIA_RESERVA', 'PAGADO_SIN_USAR', 'CLASE_CERRADA', 'RECHAZADA', 'ERROR']) {
    const x = textoCompensacion({ motivo, enEspera: false });
    assert.ok(x.titulo && x.cuerpo, motivo);
    assert.doesNotMatch(x.titulo, /Reservada/, `${motivo}: nunca dice «Reservada»`);
  }
});
