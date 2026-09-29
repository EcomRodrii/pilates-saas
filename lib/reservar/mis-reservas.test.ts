import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conQuienYDonde, estadoReservaSocia, limiteOferta, momentoReserva, ofertaVigente, pierdeBonoAlCancelar, textoConfirmarCancelar,
} from './mis-reservas.ts';
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

// ── Oferta de plaza de la lista de espera ───────────────────────────────────

const AHORA = new Date('2026-08-12T08:00:00+02:00').getTime();

test('ofertaVigente: solo en LISTA_ESPERA, con hora y todavía no pasada', () => {
  assert.equal(ofertaVigente('LISTA_ESPERA', '2026-08-12T08:30:00+02:00', AHORA), true);
  assert.equal(ofertaVigente('LISTA_ESPERA', '2026-08-12T07:59:00+02:00', AHORA), false, 'caducada: el cron aún no la ha retirado');
  assert.equal(ofertaVigente('LISTA_ESPERA', null, AHORA), false);
  assert.equal(ofertaVigente('CONFIRMADA', '2026-08-12T08:30:00+02:00', AHORA), false);
});

test('con una plaza ofrecida, la insignia dice «Plaza para ti» (y no su posición en la cola)', () => {
  assert.deepEqual(estadoReservaSocia('LISTA_ESPERA', 'proxima', 2, true), { texto: 'Plaza para ti', tono: 'pendiente' });
  assert.deepEqual(estadoReservaSocia('LISTA_ESPERA', 'proxima', 2, false), { texto: 'Lista de espera · 2ª', tono: 'espera' });
  assert.equal(estadoReservaSocia('LISTA_ESPERA', 'pasada', 2, true).texto, 'Lista de espera');
});

test('limiteOferta: en la hora del estudio, con el día solo si no es hoy', () => {
  assert.equal(limiteOferta('2026-08-12T09:40:00Z', '2026-08-12'), 'hasta las 11:40');
  assert.equal(limiteOferta('2026-08-13T07:00:00Z', '2026-08-12'), 'hasta mañana a las 09:00');
  assert.match(limiteOferta('2026-08-15T07:00:00Z', '2026-08-12'), /^hasta el s[aá]b, 15 ago a las 09:00$/);
});

// ── Confirmar la cancelación ────────────────────────────────────────────────

test('pierdeBonoAlCancelar: la regla del servidor (tardía y sin devolución), y nunca en lista de espera', () => {
  const ahora = new Date('2026-08-12T08:00:00+02:00');
  assert.equal(pierdeBonoAlCancelar('CONFIRMADA', '2026-08-12T10:00:00+02:00', ahora, 12, false), true);
  assert.equal(pierdeBonoAlCancelar('CONFIRMADA', '2026-08-12T10:00:00+02:00', ahora, 12, true), false, 'el estudio devuelve en tardías');
  assert.equal(pierdeBonoAlCancelar('CONFIRMADA', '2026-08-14T10:00:00+02:00', ahora, 12, false), false, 'fuera de la ventana');
  assert.equal(pierdeBonoAlCancelar('CONFIRMADA', '2026-08-12T10:00:00+02:00', ahora, 0, false), false, 'sin ventana');
  assert.equal(pierdeBonoAlCancelar('LISTA_ESPERA', '2026-08-12T10:00:00+02:00', ahora, 12, false), false);
});

test('textoConfirmarCancelar: sin ventana no promete «gratis hasta 0h antes»', () => {
  assert.equal(textoConfirmarCancelar({ espera: true, pierdeBono: false, ventana: 12 }), '¿Quieres salir de la lista de espera de esta clase?');
  assert.equal(textoConfirmarCancelar({ espera: false, pierdeBono: true, ventana: 12 }), '¿Quieres cancelar esta reserva? Con menos de 12h de antelación no se te devolverá la sesión del bono.');
  assert.equal(textoConfirmarCancelar({ espera: false, pierdeBono: false, ventana: 12 }), '¿Quieres cancelar esta reserva? Es gratis hasta 12h antes.');
  assert.equal(textoConfirmarCancelar({ espera: false, pierdeBono: false, ventana: 0 }), '¿Quieres cancelar esta reserva?');
});
