import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diasHastaPlazo, esTipoSolicitud, etiquetaTipoSolicitud, mapSolicitudDerechos, textoPlazo, validarCierreSolicitud, NOTA_MAX,
} from './solicitudes-derechos.ts';

const pendiente = (tipo: 'supresion' | 'oposicion' | 'limitacion') => ({ tipo, estado: 'pendiente' as const });

test('solo se aceptan los tres tipos del CHECK de la tabla', () => {
  assert.ok(esTipoSolicitud('supresion'));
  assert.ok(esTipoSolicitud('oposicion'));
  assert.ok(esTipoSolicitud('limitacion'));
  assert.equal(esTipoSolicitud('portabilidad'), false, 'la portabilidad no se solicita: se descarga al momento');
  assert.equal(esTipoSolicitud(undefined), false);
});

test('una supresión NO se da por resuelta si la socia no está suprimida', () => {
  const r = validarCierreSolicitud({ accion: 'resolver' }, pendiente('supresion'), false);
  assert.deepEqual(r, { ok: false, status: 409, error: 'Primero hay que ejecutar la supresión de sus datos.' });
  const hecha = validarCierreSolicitud({ accion: 'resolver' }, pendiente('supresion'), true);
  assert.deepEqual(hecha, { ok: true, estado: 'resuelta', nota: null });
});

test('oposición y limitación se resuelven sin supresión', () => {
  assert.deepEqual(validarCierreSolicitud({ accion: 'resolver', nota: '  hecho  ' }, pendiente('oposicion'), false),
    { ok: true, estado: 'resuelta', nota: 'hecho' });
});

test('rechazar exige nota, y la nota tiene tope', () => {
  const sinNota = validarCierreSolicitud({ accion: 'rechazar', nota: '   ' }, pendiente('supresion'), false);
  assert.equal(sinNota.ok, false);
  assert.equal(!sinNota.ok && sinNota.status, 400);
  const conNota = validarCierreSolicitud({ accion: 'rechazar', nota: 'Obligación fiscal' }, pendiente('supresion'), false);
  assert.deepEqual(conNota, { ok: true, estado: 'rechazada', nota: 'Obligación fiscal' });
  const larga = validarCierreSolicitud({ accion: 'rechazar', nota: 'x'.repeat(NOTA_MAX + 1) }, pendiente('supresion'), false);
  assert.equal(larga.ok, false);
});

test('una solicitud cerrada no se vuelve a cerrar', () => {
  const r = validarCierreSolicitud({ accion: 'rechazar', nota: 'x' }, { tipo: 'oposicion', estado: 'resuelta' }, false);
  assert.equal(!r.ok && r.status, 409);
});

test('acción desconocida → 400', () => {
  const r = validarCierreSolicitud({ accion: 'borrar' }, pendiente('oposicion'), true);
  assert.equal(!r.ok && r.status, 400);
});

test('días hasta el plazo: redondea hacia arriba y sale negativo si venció', () => {
  const ahora = new Date('2026-09-13T10:00:00Z');
  assert.equal(diasHastaPlazo('2026-10-13T10:00:00Z', ahora), 30);
  assert.equal(diasHastaPlazo('2026-09-13T13:00:00Z', ahora), 1);
  assert.equal(diasHastaPlazo('2026-09-11T10:00:00Z', ahora), -2);
});

test('texto del plazo: singular, plural y vencido', () => {
  const ahora = new Date('2026-09-13T10:00:00Z');
  assert.match(textoPlazo('2026-10-13T10:00:00Z', ahora), /^Quedan 30 días \(hasta el 13 de octubre\)$/);
  assert.match(textoPlazo('2026-09-13T13:00:00Z', ahora), /^Quedan 1 día /);
  assert.equal(textoPlazo('2026-09-12T10:00:00Z', ahora), 'Plazo vencido hace 1 día');
});

test('mapea la fila y etiqueta el tipo', () => {
  const v = mapSolicitudDerechos({
    id: 'a', socio_id: 's', tipo: 'limitacion', estado: 'pendiente',
    solicitada_en: '2026-09-13T10:00:00Z', plazo_hasta: '2026-10-13T10:00:00Z', resuelta_en: null, nota: null,
  });
  assert.equal(v.socioId, 's');
  assert.equal(etiquetaTipoSolicitud(v.tipo), 'Limitación del uso de sus datos');
});
