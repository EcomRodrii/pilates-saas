import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { firmarWellhub, verificarFirmaWellhub } from './wellhub-firma.ts';
import {
  accionReservaWellhub, avisoValidacionWellhub, CESION_CONFIRMACION_MS, desenlaceWellhub, instanteWellhub, leerEventoWellhub, leerValidacionWellhub,
  rechazoWellhub, reservaDelCheckinWellhub, reservaPedidaCaducada, tipoEventoWellhub, trasConfirmarWellhub,
} from './wellhub-eventos.ts';

const SECRETO = 'secreto-de-prueba';

// Los ejemplos de su documentación (developers.wellhub.com), con los ids como
// números de verdad: los suyos llevan ceros a la izquierda y no son JSON válido.
const RESERVA = {
  event_type: 'booking-requested',
  event_data: {
    user: { unique_token: '1000000000002', name: 'Thomas Patrick', email: 'thomas@mail.com', phone_number: '+19415693005' },
    slot: { id: 9325, gym_id: 100001, class_id: 8268, booking_number: 'BK_HEQYZMK' },
    timestamp: 1664461204015,
    event_id: '45b4b8a4-f2f3-4b33-adf0-504c33f27642',
  },
};

// ── Firma ────────────────────────────────────────────────────────────────────

test('firma: HMAC-SHA1 del cuerpo crudo en hexadecimal, en mayúsculas como dice su doc', () => {
  const cuerpo = JSON.stringify(RESERVA);
  const esperada = createHmac('sha1', SECRETO).update(cuerpo).digest('hex').toUpperCase();
  assert.equal(firmarWellhub(SECRETO, cuerpo), esperada);
  assert.equal(verificarFirmaWellhub([SECRETO], esperada, cuerpo), 'crudo');
});

test('firma: acepta las formas que enseña su doc — con «0X» delante y en minúsculas (su ejemplo en Go)', () => {
  const cuerpo = JSON.stringify(RESERVA);
  const firma = firmarWellhub(SECRETO, cuerpo);
  assert.equal(verificarFirmaWellhub([SECRETO], `0X${firma}`, cuerpo), 'crudo');
  assert.equal(verificarFirmaWellhub([SECRETO], `0x${firma.toLowerCase()}`, cuerpo), 'crudo');
  assert.equal(verificarFirmaWellhub([SECRETO], firma.toLowerCase(), cuerpo), 'crudo');
});

test('firma: si firmaron el objeto compacto y llegó con espacios, también vale, y se sabe que fue así', () => {
  const compacto = JSON.stringify(RESERVA);
  const conEspacios = JSON.stringify(RESERVA, null, 2);
  assert.equal(verificarFirmaWellhub([SECRETO], firmarWellhub(SECRETO, compacto), conEspacios), 'reserializado');
});

test('firma: dos secretos (actual y anterior) para poder rotarlo sin cortar', () => {
  const cuerpo = JSON.stringify(RESERVA);
  assert.equal(verificarFirmaWellhub(['nuevo', SECRETO], firmarWellhub(SECRETO, cuerpo), cuerpo), 'crudo');
  assert.equal(verificarFirmaWellhub([undefined, SECRETO], firmarWellhub(SECRETO, cuerpo), cuerpo), 'crudo');
});

test('firma: rechaza un cuerpo cambiado, otro secreto, una cabecera mal formada y la falta de secreto', () => {
  const cuerpo = JSON.stringify(RESERVA);
  const firma = firmarWellhub(SECRETO, cuerpo);
  assert.equal(verificarFirmaWellhub([SECRETO], firma, cuerpo.replace('Thomas', 'Tomasa')), null);
  assert.equal(verificarFirmaWellhub(['otro'], firma, cuerpo), null);
  assert.equal(verificarFirmaWellhub([SECRETO], firma.slice(0, 39), cuerpo), null);
  assert.equal(verificarFirmaWellhub([SECRETO], `${firma}00`, cuerpo), null);
  assert.equal(verificarFirmaWellhub([SECRETO], 'no-es-hex-'.padEnd(40, 'z'), cuerpo), null);
  assert.equal(verificarFirmaWellhub([SECRETO], null, cuerpo), null);
  // Sin secreto no se acepta nada, ni siquiera una firma «vacía».
  assert.equal(verificarFirmaWellhub([''], firmarWellhub('', cuerpo), cuerpo), null);
  assert.equal(verificarFirmaWellhub([undefined], firma, cuerpo), null);
  assert.equal(verificarFirmaWellhub([], firma, cuerpo), null);
});

// ── Eventos ──────────────────────────────────────────────────────────────────

test('tipo de evento: una sola grafía para todas las que usa su documentación', () => {
  assert.equal(tipoEventoWellhub('booking-requested'), 'booking-requested');
  assert.equal(tipoEventoWellhub('booking.Requested'), 'booking-requested');
  for (const t of ['booking-canceled', 'booking-cancelled', 'booking.Cancelation', 'booking.cancelation']) {
    assert.equal(tipoEventoWellhub(t), 'booking-canceled', t);
  }
  for (const t of ['booking-late-canceled', 'booking-late-cancelled', 'booking.LateCancelation']) {
    assert.equal(tipoEventoWellhub(t), 'booking-late-canceled', t);
  }
  assert.equal(tipoEventoWellhub('Checkin-booking-occured'), 'checkin-booking-occurred');
  assert.equal(tipoEventoWellhub('checkin-booking-occurred'), 'checkin-booking-occurred');
  assert.equal(tipoEventoWellhub('checkin'), 'checkin');
  assert.equal(tipoEventoWellhub('SYSTEM_INTEGRATION_REQUESTED'), 'system-integration-requested');
  assert.equal(tipoEventoWellhub('system-integration-requested'), 'system-integration-requested');
  assert.equal(tipoEventoWellhub('booking-confirmed'), null);
  assert.equal(tipoEventoWellhub(3), null);
});

test('reserva pedida: lo necesario para reservar, y ni email ni teléfono (no se guardan)', () => {
  const r = leerEventoWellhub(RESERVA);
  assert.ok(r.ok);
  assert.deepEqual(r.evento, {
    tipo: 'reserva-pedida', eventId: '45b4b8a4-f2f3-4b33-adf0-504c33f27642', bookingNumber: 'BK_HEQYZMK',
    slotId: '9325', gymId: '100001', classId: '8268', wellhubId: '1000000000002', nombre: 'Thomas Patrick',
    momento: 1664461204015,
  });
  assert.ok(!JSON.stringify(r.evento).includes('thomas@mail.com'));
  assert.ok(!JSON.stringify(r.evento).includes('9415693005'));
});

test('reserva pedida: sin nombre, un genérico (la reserva lo exige); sin slot, gym o socia, no se entiende', () => {
  const sinNombre = structuredClone(RESERVA) as { event_data: { user: Record<string, unknown> } };
  delete sinNombre.event_data.user.name;
  const r = leerEventoWellhub(sinNombre);
  assert.ok(r.ok && r.evento.tipo === 'reserva-pedida' && r.evento.nombre === 'Socia de Wellhub');
  for (const quitar of ['id', 'gym_id', 'booking_number'] as const) {
    const c = structuredClone(RESERVA) as { event_data: { slot: Record<string, unknown> } };
    delete c.event_data.slot[quitar];
    assert.equal(leerEventoWellhub(c).ok, false, quitar);
  }
  const sinSocia = structuredClone(RESERVA) as { event_data: { user: Record<string, unknown> } };
  delete sinSocia.event_data.user.unique_token;
  assert.equal(leerEventoWellhub(sinSocia).ok, false);
  assert.equal(leerEventoWellhub({ event_type: 'booking-requested' }).ok, false);
  assert.equal(leerEventoWellhub(null).ok, false);
});

test('cancelación y cancelación tardía: basta el booking_number (con cualquier grafía del tipo)', () => {
  const base = { event_data: { user: { unique_token: '1000000000002' }, slot: { id: 9325, gym_id: 100001, class_id: 8268, booking_number: 'BK_HEQYZMK' }, timestamp: 1664461204015, event_id: 'e-1' } };
  const c = leerEventoWellhub({ ...base, event_type: 'booking.Cancelation' });
  assert.ok(c.ok && c.evento.tipo === 'reserva-cancelada' && c.evento.bookingNumber === 'BK_HEQYZMK');
  const t = leerEventoWellhub({ ...base, event_type: 'booking-late-cancelled' });
  assert.ok(t.ok && t.evento.tipo === 'reserva-cancelada-tarde');
});

test('check-in: los instantes llegan en SEGUNDOS y se pasan a ms; el de reserva trae su booking_number y su caducidad', () => {
  const conReserva = leerEventoWellhub({
    event_type: 'Checkin-booking-occured',
    event_data: {
      booking: { booking_number: 'BK_LRNLABC' }, user: { unique_token: '1234567890123' },
      location: { lat: 33.99, lon: -118.45 }, gym: { id: 123456, title: 'Gym', product: { description: 'Classes', pass_type_number: 1 } },
      timestamp: 1668090666, expires_at: 1668096066,
    },
  });
  assert.ok(conReserva.ok && conReserva.evento.tipo === 'checkin');
  assert.equal(conReserva.evento.bookingNumber, 'BK_LRNLABC');
  assert.equal(conReserva.evento.momento, 1668090666000);
  assert.equal(conReserva.evento.expira, 1668096066000);

  const suelto = leerEventoWellhub({
    event_type: 'checkin',
    event_data: {
      user: { unique_token: '0123456789012', first_name: 'Ana', last_name: 'Gil', email: 'a@example.com', phone_number: '447889123456' },
      gym: { id: 123456, title: 'Gym', product: { id: 1, description: 'x' } }, timestamp: 1666629613,
    },
  });
  assert.ok(suelto.ok && suelto.evento.tipo === 'checkin');
  assert.equal(suelto.evento.bookingNumber, null);
  assert.equal(suelto.evento.nombre, 'Ana Gil');
  assert.equal(suelto.evento.expira, null);
  assert.ok(!JSON.stringify(suelto.evento).includes('a@example.com'));
});

test('instantes: segundos y milisegundos al mismo epoch en ms', () => {
  assert.equal(instanteWellhub(1666629613), 1666629613000);
  assert.equal(instanteWellhub(1560983373378), 1560983373378);
  assert.equal(instanteWellhub(0), null);
  assert.equal(instanteWellhub('1666629613'), null);
});

test('integración pedida: el gym que ha elegido Tentare', () => {
  const r = leerEventoWellhub({
    event_type: 'system-integration-requested',
    event_data: { gym_id: 4567, gym_name: 'Studio', partner_id: 'p', custom_fields: [], event_id: 'ev-9', timestamp: 1706805878490 },
  });
  assert.ok(r.ok && r.evento.tipo === 'integracion-pedida' && r.evento.gymId === '4567' && r.evento.nombreGym === 'Studio');
});

// ── Respuestas ───────────────────────────────────────────────────────────────

test('rechazo: cada motivo de la reserva con la reason_category de Wellhub (y lo desconocido es fallo nuestro)', () => {
  assert.equal(rechazoWellhub('AFORO_LLENO').reason_category, 'CLASS_IS_FULL');
  assert.equal(rechazoWellhub('CUPO_PLATAFORMA_AGOTADO').reason_category, 'CLASS_IS_FULL');
  assert.equal(rechazoWellhub('YA_RESERVADA').reason_category, 'USER_IS_ALREADY_BOOKED');
  assert.equal(rechazoWellhub('SESION_CANCELADA').reason_category, 'CLASS_HAS_BEEN_CANCELED');
  assert.equal(rechazoWellhub('ESTUDIO_CERRADO').reason_category, 'CLASS_HAS_BEEN_CANCELED');
  assert.equal(rechazoWellhub('SESION_NO_ENCONTRADA').reason_category, 'CLASS_NOT_FOUND');
  assert.equal(rechazoWellhub('SESION_TERMINADA').reason_category, 'CHECK_IN_AND_CANCELATION_WINDOWS_CLOSED');
  assert.equal(rechazoWellhub('TIPO_REQUIERE_AUTORIZACION').reason_category, 'PREREQUISITES');
  const otro = rechazoWellhub('duplicate key value violates unique constraint');
  assert.equal(otro.reason_category, 'TECHNICAL_ERROR');
  // Lo enseña Wellhub a su socia: nada interno.
  assert.doesNotMatch(otro.reason, /constraint|duplicate/);
});

test('validar check-in: «ya validado» cuenta como hecho; cada error con su motivo para recepción', () => {
  assert.equal(leerValidacionWellhub(200, null), 'validado');
  assert.equal(leerValidacionWellhub(200, { metadata: { total: 1 } }), 'validado');
  const err = (key: string) => ({ metadata: { total: 0, errors: 1 }, errors: [{ message: 'x', key }] });
  assert.equal(leerValidacionWellhub(400, err('checkin.already.validated')), 'ya-validado');
  assert.equal(leerValidacionWellhub(404, err('checkin.validation.notfound')), 'sin-checkin');
  assert.equal(leerValidacionWellhub(400, err('checkin.validation.expired')), 'caducado');
  assert.equal(leerValidacionWellhub(400, err('checkin.validation.cancelled')), 'cancelado');
  assert.equal(leerValidacionWellhub(404, null), 'sin-checkin');
  assert.equal(leerValidacionWellhub(401, null), 'sin-permiso');
  assert.equal(leerValidacionWellhub(500, null), 'error');
  assert.equal(avisoValidacionWellhub('validado'), null);
  assert.equal(avisoValidacionWellhub('ya-validado'), null);
  for (const r of ['sin-checkin', 'caducado', 'cancelado', 'sin-permiso', 'error'] as const) {
    assert.ok(avisoValidacionWellhub(r), r);
  }
});

test('desenlace de una llamada que cambia algo: se decide con su respuesta, no con el reloj', () => {
  assert.equal(desenlaceWellhub(204), 'hecho');
  assert.equal(desenlaceWellhub(200), 'hecho');
  for (const st of [400, 404, 409, 410, 422]) assert.equal(desenlaceWellhub(st), 'definitivo', String(st));
  // 401/403 son nuestras credenciales, no la reserva: decidir con ellos cancelaría plazas buenas.
  for (const st of [0, 401, 403, 408, 429, 500, 502, 503]) assert.equal(desenlaceWellhub(st), 'sin-saber', String(st));
});

test('qué le falta saber a Wellhub de cada reserva, según cómo está aquí y lo que ya se le dijo allí', () => {
  const T = Date.parse('2026-10-07T10:00:00Z');
  const a = (estado: string, estadoExterno: string | null, haceMs = 0) =>
    accionReservaWellhub({ estado, estadoExterno, estadoExternoEn: new Date(T - haceMs).toISOString() }, T);
  assert.equal(a('CONFIRMADA', 'Requested'), 'confirmar');
  assert.equal(a('CANCELADA', 'Requested'), 'rechazar', 'allí nunca se confirmó: basta un REJECTED');
  // Alguien la está confirmando ahora mismo: nadie más le manda nada (dos RESERVED a la vez podían dar un 204 y un 4xx).
  assert.equal(a('CONFIRMADA', 'Confirming', 10_000), 'esperar');
  assert.equal(a('CANCELADA', 'Confirming', 10_000), 'esperar');
  // Pasada la cesión, se da por perdido: se reintenta, o se anula si aquí ya no está.
  assert.equal(a('CONFIRMADA', 'Confirming', CESION_CONFIRMACION_MS + 1), 'confirmar');
  assert.equal(a('CANCELADA', 'Confirming', CESION_CONFIRMACION_MS + 1), 'anular');
  assert.equal(accionReservaWellhub({ estado: 'CONFIRMADA', estadoExterno: 'Confirming', estadoExternoEn: null }, T), 'confirmar');
  // El estudio la canceló aquí con la reserva ya confirmada allí: se anula allí (si no, la socia la sigue viendo).
  assert.equal(a('CANCELADA', 'Booked'), 'anular');
  for (const estado of ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']) assert.equal(a(estado, 'Booked'), 'nada', estado);
  for (const ext of [null, 'Cancelled', 'LateCancellation', 'CheckedIn', 'NoShow']) assert.equal(a('CANCELADA', ext), 'nada', String(ext));
});

test('⚠️ la respuesta a un RESERVED: un 4xx solo cancela si nadie había mandado otro antes (su PATCH puede no ser repetible)', () => {
  assert.equal(trasConfirmarWellhub(204, true), 'reservada');
  assert.equal(trasConfirmarWellhub(204, false), 'reservada');
  assert.equal(trasConfirmarWellhub(409, true), 'rechazada');
  // Un RESERVED anterior pudo llegar: el 4xx puede ser «ya estaba reservada». Se conserva la plaza.
  for (const st of [400, 409, 410, 422]) assert.equal(trasConfirmarWellhub(st, false), 'dudosa', String(st));
  // 404: Wellhub no conoce la reserva; ese no deja dudas.
  assert.equal(trasConfirmarWellhub(404, false), 'rechazada');
  for (const st of [0, 401, 403, 429, 500, 503]) assert.equal(trasConfirmarWellhub(st, true), 'reintentar', String(st));
});

test('una petición de reserva de hace más de 15 min ya la ha rechazado Wellhub: no se le da plaza', () => {
  const t = Date.parse('2026-10-07T10:00:00Z');
  assert.equal(reservaPedidaCaducada(t, t + 14 * 60_000), false);
  assert.equal(reservaPedidaCaducada(t, t + 15 * 60_000), false);
  assert.equal(reservaPedidaCaducada(t, t + 15 * 60_000 + 1), true);
});

test('check-in sin booking_number: cuenta para la clase cuyo margen lo contiene (30 min antes y después)', () => {
  const r = (id: string, inicio: string, fin: string) => ({ id, inicio, fin });
  const manana = r('m', '2026-10-07T08:00:00Z', '2026-10-07T08:55:00Z');
  const tarde = r('t', '2026-10-07T17:00:00Z', '2026-10-07T17:55:00Z');
  assert.equal(reservaDelCheckinWellhub([manana, tarde], Date.parse('2026-10-07T07:40:00Z'))?.id, 'm');
  assert.equal(reservaDelCheckinWellhub([manana, tarde], Date.parse('2026-10-07T09:20:00Z'))?.id, 'm');
  assert.equal(reservaDelCheckinWellhub([manana, tarde], Date.parse('2026-10-07T16:45:00Z'))?.id, 't');
  // A media tarde no hay clase cerca: no es de ninguna.
  assert.equal(reservaDelCheckinWellhub([manana, tarde], Date.parse('2026-10-07T13:00:00Z')), null);
  assert.equal(reservaDelCheckinWellhub([], Date.parse('2026-10-07T08:00:00Z')), null);
});
