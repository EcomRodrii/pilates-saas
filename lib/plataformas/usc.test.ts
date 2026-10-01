import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { cadenaFirmadaUsc, firmarUsc, verificarFirmaUsc, VENTANA_TIMESTAMP_MS } from './usc-firma.ts';
import { leerPeticionReservaUsc, respuestaRechazoUsc } from './usc-reserva.ts';

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
