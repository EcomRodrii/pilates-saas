import { test } from 'node:test';
import assert from 'node:assert/strict';

import { esMensajeTecnico, mensajeSeguro, mensajeHttp, ERROR_GENERICO } from './errores.ts';

// Los casos de "técnico" salen de fugas REALES que había en producción: cada
// cadena de aquí llegó a mostrarse tal cual en la pantalla de una dueña de
// estudio antes de este arreglo.
const TECNICOS = [
  'duplicate key value violates unique constraint "sustituciones_sesion_id_key"',
  'new row violates row-level security policy for table "instructores"',
  'null value in column "sala_id" violates not-null constraint',
  'function ranking_sustitutas(uuid) does not exist',
  'relation "socios" does not exist',
  'column "email" of relation "socios" does not exist',
  'invalid input syntax for type uuid: "abc"',
  'JWT expired',
  'permission denied for table studios',
  'Failed to fetch',
  'NetworkError when attempting to fetch resource.',
  'TypeError: Cannot read properties of undefined (reading \'id\')',
  'PGRST116',
  '{"code":"23505","details":null}',
  'Error\n    at Object.<anonymous> (/app/route.ts:12:5)',
];

const PARA_PERSONAS = [
  'No se ha podido guardar el ajuste de avisos. Vuelve a intentarlo.',
  'Sube un archivo .csv. Si tienes Excel, expórtalo como CSV primero.',
  'No se puede: esta instructora ya tiene otra clase en ese horario. Elige otra candidata.',
  'La domiciliación por SEPA todavía no está disponible en este estudio.',
  'Se han importado 40 clientes y el proceso se ha detenido ahí.',
];

test('detecta como técnicos los errores que se filtraban a la pantalla', () => {
  for (const m of TECNICOS) {
    assert.equal(esMensajeTecnico(m), true, `debería ser técnico: ${m}`);
  }
});

test('deja pasar los mensajes escritos para una persona', () => {
  for (const m of PARA_PERSONAS) {
    assert.equal(esMensajeTecnico(m), false, `no debería ser técnico: ${m}`);
  }
});

test('vacío, nulo y no-cadena cuentan como técnicos', () => {
  for (const m of ['', '   ', null, undefined, 42, {}]) {
    assert.equal(esMensajeTecnico(m), true, `debería ser técnico: ${String(m)}`);
  }
});

test('mensajeSeguro sustituye lo técnico y respeta lo bueno', () => {
  assert.equal(
    mensajeSeguro('duplicate key value violates unique constraint "x"', 'No se ha podido guardar.'),
    'No se ha podido guardar.',
  );
  assert.equal(
    mensajeSeguro('Revisa que el email no esté repetido.', 'No se ha podido guardar.'),
    'Revisa que el email no esté repetido.',
  );
  assert.equal(mensajeSeguro(undefined, 'Respaldo'), 'Respaldo');
  // Recorta los espacios sobrantes del mensaje bueno.
  assert.equal(mensajeSeguro('  Vale.  ', 'Respaldo'), 'Vale.');
});

test('mensajeHttp no devuelve nunca un código suelto', () => {
  for (const s of [400, 401, 403, 404, 409, 413, 429, 500, 502, 503]) {
    const m = mensajeHttp(s);
    assert.equal(esMensajeTecnico(m), false, `mensajeHttp(${s}) no es apto: ${m}`);
    assert.ok(!m.includes(String(s)), `mensajeHttp(${s}) filtra el código: ${m}`);
  }
  assert.equal(mensajeHttp(500), ERROR_GENERICO);
});
