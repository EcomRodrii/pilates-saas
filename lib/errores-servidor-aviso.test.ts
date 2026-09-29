import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisaASentry, capturaParaSentry, detalle } from './errores-servidor-aviso.ts';

// Estos tests ejecutan EL MISMO código que corre en producción (por eso vive
// separado de errores-servidor.ts, que importa next/server). Lo que protegen:
// que un 500 devuelto por una ruta llegue a Sentry y que no se funda con los de
// otras rutas. Si se rompe no se ve nada raro en pantalla, solo se deja de saber
// de los fallos.

test('solo los fallos del servidor avisan a Sentry, no los de la petición', () => {
  assert.equal(avisaASentry(500), true);
  assert.equal(avisaASentry(502), true);
  assert.equal(avisaASentry(503), true);
  assert.equal(avisaASentry(400), false);
  assert.equal(avisaASentry(404), false);
  assert.equal(avisaASentry(409), false);
  assert.equal(avisaASentry(429), false);
});

test('un Error viaja tal cual: mismo objeto, sin fingerprint propio', () => {
  // Mismo objeto porque así Sentry descarta el aviso duplicado cuando la ruta ya
  // lo había capturado antes de llamar a errorInterno; sin fingerprint porque se
  // agrupa por su pila real.
  const causa = new Error('fallo de base de datos');
  const { error, opciones } = capturaParaSentry('equipo:POST', causa);
  assert.equal(error, causa);
  assert.deepEqual(opciones, { tags: { contexto: 'equipo:POST' } });
});

test('una causa que no es Error se envuelve y se agrupa por contexto', () => {
  const { error, opciones } = capturaParaSentry('cobros:PATCH', { message: 'boom', code: '23505' });
  assert.ok(error instanceof Error);
  assert.match(error.message, /^\[cobros:PATCH\] boom · code=23505$/);
  assert.deepEqual(opciones, {
    tags: { contexto: 'cobros:PATCH' },
    fingerprint: ['errorInterno', 'cobros:PATCH'],
  });
});

test('dos rutas distintas con la misma causa suelta no se funden en una incidencia', () => {
  // El Error envuelto nace en la misma función para todas, así que su pila es la
  // misma: lo único que las separa es el fingerprint.
  const a = capturaParaSentry('ruta-a:POST', 'algo raro');
  const b = capturaParaSentry('ruta-b:POST', 'algo raro');
  assert.notDeepEqual(a.opciones.fingerprint, b.opciones.fingerprint);
});

test('una causa vacía también avisa, con un texto que la identifica', () => {
  for (const causa of [null, undefined, '']) {
    const { error, opciones } = capturaParaSentry('x:GET', causa);
    assert.equal(error.message, '[x:GET] (sin detalle)');
    assert.deepEqual(opciones.fingerprint, ['errorInterno', 'x:GET']);
  }
});

test('detalle conserva code, details y hint de un error de Supabase', () => {
  assert.equal(
    detalle({ message: 'duplicate key', code: '23505', details: 'Key exists', hint: 'usa otro' }),
    'duplicate key · code=23505 · details=Key exists · hint=usa otro',
  );
  assert.equal(detalle('texto suelto'), 'texto suelto');
});
