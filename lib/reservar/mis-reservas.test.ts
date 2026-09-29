import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conQuienYDonde, estadoReservaSocia, momentoReserva } from './mis-reservas.ts';
import { cuandoCorto } from './ficha-clase.ts';

// ─────────────────────────────────────────────────────────────────────────────
// «Mis reservas» de /reservar (F5 del rediseño): lo que dice cada tarjeta. Las
// horas llevan su zona (+02:00): la cuenta se hace en la hora del estudio, no
// en la del runner.
// ─────────────────────────────────────────────────────────────────────────────

const INICIO = '2026-08-12T10:00:00+02:00';
const FIN = '2026-08-12T10:50:00+02:00';
const ms = (iso: string) => new Date(iso).getTime();

test('el momento: próxima hasta que empieza, en curso mientras dura, pasada en cuanto termina', () => {
  assert.equal(momentoReserva(INICIO, FIN, ms('2026-08-12T09:59:00+02:00')), 'proxima');
  assert.equal(momentoReserva(INICIO, FIN, ms(INICIO)), 'en-curso');
  assert.equal(momentoReserva(INICIO, FIN, ms('2026-08-12T10:30:00+02:00')), 'en-curso');
  // El mismo corte que la página usa para partir Próximas y Pasadas: `fin < ahora`.
  assert.equal(momentoReserva(INICIO, FIN, ms(FIN)), 'en-curso');
  assert.equal(momentoReserva(INICIO, FIN, ms(FIN) + 1), 'pasada');
});

test('una reserva confirmada es «Reservada», la palabra de la app y de la ficha de la clase', () => {
  assert.deepEqual(estadoReservaSocia('CONFIRMADA', 'proxima'), { texto: 'Reservada', tono: 'reservada' });
  assert.deepEqual(estadoReservaSocia('CONFIRMADA', 'en-curso'), { texto: 'En curso', tono: 'curso' });
});

test('⚠️ una confirmada de una clase que ya pasó NO es «Cancelada»', () => {
  // A «Pasadas» no llega ninguna cancelada: llegan las que nadie marcó como
  // asistidas. Decirle «Cancelada» a quien reservó y fue era falso.
  const pasada = estadoReservaSocia('CONFIRMADA', 'pasada');
  assert.notEqual(pasada.texto, 'Cancelada');
  assert.deepEqual(pasada, { texto: 'Reservada', tono: 'neutro' });
});

test('la lista de espera dice la posición mientras sirve, y la calla cuando la clase ya pasó', () => {
  assert.deepEqual(estadoReservaSocia('LISTA_ESPERA', 'proxima', 2), { texto: 'Lista de espera · 2ª', tono: 'espera' });
  assert.deepEqual(estadoReservaSocia('LISTA_ESPERA', 'proxima', null), { texto: 'Lista de espera', tono: 'espera' });
  assert.deepEqual(estadoReservaSocia('LISTA_ESPERA', 'pasada', 2), { texto: 'Lista de espera', tono: 'neutro' });
});

test('⚠️ una reserva pendiente de aprobar no se anuncia como confirmada', () => {
  const pendiente = estadoReservaSocia('PENDIENTE_APROBACION', 'proxima');
  assert.equal(pendiente.tono, 'pendiente');
  assert.doesNotMatch(pendiente.texto, /Reservada|Confirmada/);
  assert.equal(estadoReservaSocia('PENDIENTE_APROBACION', 'pasada').tono, 'neutro');
});

test('lo que ya decidió el estudio manda sobre el reloj', () => {
  for (const momento of ['proxima', 'en-curso', 'pasada'] as const) {
    assert.deepEqual(estadoReservaSocia('ASISTIDA', momento), { texto: 'Asistida', tono: 'asistida' });
    assert.deepEqual(estadoReservaSocia('NO_ASISTIO', momento), { texto: 'No asistió', tono: 'neutro' });
    assert.deepEqual(estadoReservaSocia('CANCELADA', momento), { texto: 'Cancelada', tono: 'neutro' });
  }
});

test('«con Marta Vidal · Sala Reformer», sin separadores huérfanos', () => {
  assert.equal(conQuienYDonde('Marta Vidal', 'Sala Reformer'), 'con Marta Vidal · Sala Reformer');
  assert.equal(conQuienYDonde('Marta Vidal', null), 'con Marta Vidal');
  assert.equal(conQuienYDonde(null, 'Sala Reformer'), 'Sala Reformer');
  assert.equal(conQuienYDonde('  ', ''), null);
  assert.equal(conQuienYDonde(undefined, undefined), null);
});

test('la fecha de la tarjeta es la de la app: solo la primera letra en mayúscula', () => {
  // Antes: «Miércoles, 12 De Agosto» (`textTransform: capitalize` subía también el «De»).
  assert.equal(cuandoCorto(INICIO, '2026-08-12'), 'Hoy · 10:00');
  assert.equal(cuandoCorto(INICIO, '2026-08-11'), 'Mañana · 10:00');
  const lejos = cuandoCorto(INICIO, '2026-08-01');
  assert.match(lejos, /^Mié\.?, 12 ago\.? · 10:00$/);
  assert.doesNotMatch(lejos, / De /);
});
