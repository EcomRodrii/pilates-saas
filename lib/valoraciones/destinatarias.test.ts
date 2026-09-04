import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinatariasValoracion } from './destinatarias.ts';

const socios = [
  { id: 'a', nombre: 'Ana', apellidos: 'Pérez', email: 'ana@x.es', borrado_en: null },
  { id: 'b', nombre: 'Bea', apellidos: null, email: null, borrado_en: null },
  { id: 'c', nombre: 'Cloe', apellidos: 'Ruiz', email: 'cloe@x.es', borrado_en: '2026-01-01T00:00:00Z' },
  { id: 'd', nombre: 'Dora', apellidos: 'Gil', email: 'dora@x.es', borrado_en: null },
];

test('solo ASISTIDA: ni confirmadas sin pasar lista, ni no-asistió, ni canceladas', () => {
  const r = destinatariasValoracion([
    { socio_id: 'a', estado: 'ASISTIDA' },
    { socio_id: 'b', estado: 'CONFIRMADA' },
    { socio_id: 'd', estado: 'NO_ASISTIO' },
  ], socios);
  assert.deepEqual(r, [{ socio_id: 'a', nombre: 'Ana Pérez', email: 'ana@x.es' }]);
});

test('una socia borrada no recibe nada aunque asistiera', () => {
  assert.deepEqual(destinatariasValoracion([{ socio_id: 'c', estado: 'ASISTIDA' }], socios), []);
});

test('sin email se devuelve igualmente (quien envía decide saltarla), sin apellidos no deja espacio', () => {
  assert.deepEqual(destinatariasValoracion([{ socio_id: 'b', estado: 'ASISTIDA' }], socios), [{ socio_id: 'b', nombre: 'Bea', email: null }]);
});

test('una socia con dos reservas en la misma sesión cuenta una vez', () => {
  const r = destinatariasValoracion([{ socio_id: 'a', estado: 'ASISTIDA' }, { socio_id: 'a', estado: 'ASISTIDA' }], socios);
  assert.equal(r.length, 1);
});

test('nadie asistió → lista vacía (la clase NO se marca como pedida: se reintenta en el siguiente barrido)', () => {
  assert.deepEqual(destinatariasValoracion([{ socio_id: 'a', estado: 'CONFIRMADA' }], socios), []);
});
