import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { cadenaFirmadaUsc, firmarUsc, verificarFirmaUsc, verificarSecretoWebhookUsc, VENTANA_TIMESTAMP_MS } from './usc-firma.ts';
import { leerPeticionReservaUsc, motivoDeErrorRpcUsc, respuestaRechazoUsc } from './usc-reserva.ts';
import { accionDeEstadoUsc, aplicableSobre, esMasReciente, leerWebhookReservaUsc } from './usc-webhook.ts';

const SECRETO = 'secreto-de-prueba';
const RUTA = '/api/plataformas/usc/reservar';
const TS = '2026-10-01T12:00:00Z';
const AHORA = Date.parse(TS);
const CUERPO = JSON.stringify({
  id: 'b53cf494-7913-48c3-9b87-7dd6e9be69b0',
  event_id: '8b109a00-4578-4f00-85b6-04b6c3d1241f',
  customer_id: '1234568',
  first_name: 'Ana',
  last_name: 'García',
});

test('la firma sigue la receta de USC: MÉTODO\\nRUTA\\nTIMESTAMP\\nCUERPO, HMAC-SHA256 en base64', () => {
  const esperada = createHmac('sha256', SECRETO).update(`POST\n${RUTA}\n${TS}\n${CUERPO}`).digest('base64');
  assert.equal(firmarUsc(SECRETO, 'post', RUTA, TS, CUERPO), esperada);
  assert.equal(cadenaFirmadaUsc('post', RUTA, TS, CUERPO).split('\n')[0], 'POST');
});

test('acepta una petición bien firmada y dentro de la ventana', () => {
  const firma = firmarUsc(SECRETO, 'POST', RUTA, TS, CUERPO);
  assert.deepEqual(verificarFirmaUsc({ secreto: SECRETO, metodo: 'POST', ruta: RUTA, timestamp: TS, firma, cuerpoCrudo: CUERPO, ahora: AHORA }), { ok: true });
});

test('rechaza si se firmó solo el último tramo de la ruta (el error que avisa su doc)', () => {
  const firma = firmarUsc(SECRETO, 'POST', '/reservar', TS, CUERPO);
  const r = verificarFirmaUsc({ secreto: SECRETO, metodo: 'POST', ruta: RUTA, timestamp: TS, firma, cuerpoCrudo: CUERPO, ahora: AHORA });
  assert.deepEqual(r, { ok: false, motivo: 'firma-no-coincide' });
});

test('rechaza un cuerpo alterado, aunque la firma sea de otro cuerpo válido', () => {
  const firma = firmarUsc(SECRETO, 'POST', RUTA, TS, CUERPO);
  const otro = CUERPO.replace('Ana', 'Eva');
  assert.equal(verificarFirmaUsc({ secreto: SECRETO, metodo: 'POST', ruta: RUTA, timestamp: TS, firma, cuerpoCrudo: otro, ahora: AHORA }).ok, false);
});

test('sin secreto configurado no se acepta nada', () => {
  const firma = firmarUsc(SECRETO, 'POST', RUTA, TS, CUERPO);
  for (const secreto of [undefined, null, '']) {
    assert.deepEqual(verificarFirmaUsc({ secreto, metodo: 'POST', ruta: RUTA, timestamp: TS, firma, cuerpoCrudo: CUERPO, ahora: AHORA }), { ok: false, motivo: 'sin-secreto' });
  }
});

test('una petición vieja (repetida) se rechaza aunque la firma sea buena', () => {
  const firma = firmarUsc(SECRETO, 'POST', RUTA, TS, CUERPO);
  const tarde = AHORA + VENTANA_TIMESTAMP_MS + 1000;
  assert.deepEqual(verificarFirmaUsc({ secreto: SECRETO, metodo: 'POST', ruta: RUTA, timestamp: TS, firma, cuerpoCrudo: CUERPO, ahora: tarde }), { ok: false, motivo: 'timestamp-fuera-de-ventana' });
});

test('faltan cabeceras o el timestamp no es una fecha', () => {
  assert.deepEqual(verificarFirmaUsc({ secreto: SECRETO, metodo: 'POST', ruta: RUTA, timestamp: null, firma: 'x', cuerpoCrudo: CUERPO }), { ok: false, motivo: 'faltan-cabeceras' });
  assert.deepEqual(verificarFirmaUsc({ secreto: SECRETO, metodo: 'POST', ruta: RUTA, timestamp: 'ayer', firma: 'x', cuerpoCrudo: CUERPO }), { ok: false, motivo: 'timestamp-invalido' });
});

test('lee la petición de reserva de USC y normaliza los ids', () => {
  const r = leerPeticionReservaUsc({ ...JSON.parse(CUERPO), id: 'B53CF494-7913-48C3-9B87-7DD6E9BE69B0', customer_id: 1234568 });
  assert.ok(r.ok);
  assert.equal(r.peticion.reservaExternaId, 'b53cf494-7913-48c3-9b87-7dd6e9be69b0');
  assert.equal(r.peticion.clienteExternoId, '1234568');
  assert.equal(r.peticion.nombre, 'Ana');
});

test('rechaza peticiones mal formadas', () => {
  assert.equal(leerPeticionReservaUsc(null).ok, false);
  assert.equal(leerPeticionReservaUsc([]).ok, false);
  assert.equal(leerPeticionReservaUsc({ ...JSON.parse(CUERPO), id: 'no-uuid' }).ok, false);
  assert.equal(leerPeticionReservaUsc({ ...JSON.parse(CUERPO), event_id: undefined }).ok, false);
  assert.equal(leerPeticionReservaUsc({ ...JSON.parse(CUERPO), customer_id: '' }).ok, false);
  assert.equal(leerPeticionReservaUsc({ ...JSON.parse(CUERPO), first_name: '', last_name: '' }).ok, false);
});

test('cada motivo de rechazo sale con el código de USC que le toca y un 4xx/5xx', () => {
  const codigos = {
    completa: 'E001', 'clase-no-existe': 'E002', 'clase-cancelada': 'E002', 'fuera-de-plazo': 'E003',
    'ya-reservada': 'E004', 'demasiadas-peticiones': 'E005', 'peticion-invalida': 'E006', 'error-interno': 'E006',
  } as const;
  for (const [motivo, code] of Object.entries(codigos)) {
    const r = respuestaRechazoUsc(motivo as keyof typeof codigos);
    assert.equal(r.cuerpo.code, code, motivo);
    assert.ok(r.status >= 400 && r.status < 600, motivo);
    assert.ok(r.cuerpo.message.length > 0);
  }
});

// ─── Webhooks de estado y errores de la RPC ─────────────────────────────────

test('el webhook de USC se valida con el SHA-256 del secreto, en hex o en base64', () => {
  const h = createHash('sha256').update('compartido').digest();
  assert.ok(verificarSecretoWebhookUsc('compartido', h.toString('hex')));
  assert.ok(verificarSecretoWebhookUsc('compartido', h.toString('hex').toUpperCase()));
  assert.ok(verificarSecretoWebhookUsc('compartido', h.toString('base64')));
  assert.ok(!verificarSecretoWebhookUsc('compartido', createHash('sha256').update('otro').digest('hex')));
  assert.ok(!verificarSecretoWebhookUsc('', h.toString('hex')));
  assert.ok(!verificarSecretoWebhookUsc('compartido', null));
});

const WEBHOOK = {
  Id: 'B53CF494-7913-48C3-9B87-7DD6E9BE69B0', EventId: '8b109a00-4578-4f00-85b6-04b6c3d1241f',
  CustomerId: '1234568', BookingStatus: 'CheckedIn', BookingType: 'Class',
  ModifiedDate: '2026-10-01T09:30:19.329208+00:00',
};

test('lee el webhook de estado y normaliza el id', () => {
  const r = leerWebhookReservaUsc(WEBHOOK);
  assert.ok(r.ok);
  assert.equal(r.evento.reservaExternaId, 'b53cf494-7913-48c3-9b87-7dd6e9be69b0');
  assert.equal(r.evento.estado, 'CheckedIn');
  assert.equal(r.evento.tipo, 'Class');
  assert.equal(leerWebhookReservaUsc({ ...WEBHOOK, BookingType: 'FreeTraining' }).ok && 'ok', 'ok');
  assert.equal(leerWebhookReservaUsc({ ...WEBHOOK, BookingStatus: 'Paid' }).ok, false);
  assert.equal(leerWebhookReservaUsc({ ...WEBHOOK, ModifiedDate: 'ayer' }).ok, false);
});

test('cada estado de USC hace lo que toca en Tentare', () => {
  assert.equal(accionDeEstadoUsc('Cancelled'), 'cancelar');
  assert.equal(accionDeEstadoUsc('LateCancellation'), 'cancelar');
  assert.equal(accionDeEstadoUsc('CheckedIn'), 'asistio');
  assert.equal(accionDeEstadoUsc('NoShow'), 'no-vino');
  assert.equal(accionDeEstadoUsc('Booked'), 'nada');
});

test('el orden lo manda ModifiedDate: un webhook viejo no pisa uno nuevo', () => {
  assert.ok(esMasReciente('2026-10-01T10:00:00Z', null));
  assert.ok(esMasReciente('2026-10-01T10:00:01Z', '2026-10-01T10:00:00Z'));
  assert.ok(!esMasReciente('2026-10-01T09:59:59Z', '2026-10-01T10:00:00Z'));
  assert.ok(!esMasReciente('2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z'));
});

test('una cancelada no resucita, y lo que ya está en su estado no se toca', () => {
  assert.ok(!aplicableSobre('CANCELADA', 'asistio'));
  assert.ok(!aplicableSobre('CANCELADA', 'cancelar'));
  assert.ok(aplicableSobre('CONFIRMADA', 'cancelar'));
  assert.ok(!aplicableSobre('ASISTIDA', 'asistio'));
  assert.ok(aplicableSobre('NO_ASISTIO', 'asistio'));
  assert.ok(!aplicableSobre('NO_ASISTIO', 'no-vino'));
  assert.ok(!aplicableSobre('CONFIRMADA', 'nada'));
});

test('los errores de la RPC salen con el motivo que USC entiende', () => {
  assert.equal(motivoDeErrorRpcUsc('AFORO_LLENO'), 'completa');
  assert.equal(motivoDeErrorRpcUsc('CUPO_PLATAFORMA_AGOTADO'), 'completa');
  assert.equal(motivoDeErrorRpcUsc('SESION_NO_ENCONTRADA'), 'clase-no-existe');
  assert.equal(motivoDeErrorRpcUsc('SESION_CANCELADA'), 'clase-cancelada');
  assert.equal(motivoDeErrorRpcUsc('SESION_TERMINADA'), 'fuera-de-plazo');
  assert.equal(motivoDeErrorRpcUsc('YA_RESERVADA'), 'ya-reservada');
  assert.equal(motivoDeErrorRpcUsc('TIPO_REQUIERE_AUTORIZACION'), 'error-interno');
  assert.equal(motivoDeErrorRpcUsc('timeout'), 'error-interno');
});
