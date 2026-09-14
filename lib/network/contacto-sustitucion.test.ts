import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeCoberturaSustitucion, estadoContactoDesde } from './contacto-sustitucion.ts';

test('el mensaje dice tipo de clase, día y hora en la zona del estudio', () => {
  // 08:00 UTC en agosto = 10:00 en Madrid.
  const m = mensajeCoberturaSustitucion({ tipoClase: 'Reformer', inicioISO: '2099-08-03T08:00:00Z' });
  assert.match(m, /una clase de Reformer/);
  assert.match(m, /3 de agosto/);
  assert.match(m, /a las 10:00/);
});

test('sin tipo de clase ni fecha no se inventa nada', () => {
  assert.equal(
    mensajeCoberturaSustitucion({ tipoClase: null, inicioISO: null }),
    'Hola, buscamos a alguien que pueda cubrir una clase. ¿Te encajaría?',
  );
  assert.doesNotMatch(mensajeCoberturaSustitucion({ tipoClase: '  ', inicioISO: 'no-es-fecha' }), /Invalid|NaN|undefined/);
});

test('el mensaje nunca lleva el motivo de la baja ni nombres de alumnas o de la instructora', () => {
  // Aunque quien llama pase la sustitución entera por descuido, solo se leen
  // el tipo de clase y el inicio.
  const sustitucionEntera = {
    tipoClase: 'Mat', inicioISO: '2099-08-03T16:30:00Z',
    motivo: 'Baja médica por lesión', instructoraOriginal: 'Laura Ejemplo', alumnas: ['Ana Ejemplo', 'Bea Ejemplo'],
  };
  const m = mensajeCoberturaSustitucion(sustitucionEntera);
  for (const prohibido of [/motivo/i, /baja/i, /médica/i, /lesión/i, /Laura/, /Ana/, /Bea/, /Ejemplo/]) {
    assert.doesNotMatch(m, prohibido);
  }
});

test('solo una respuesta ok es «enviada»', () => {
  assert.deepEqual(estadoContactoDesde({ ok: true, solicitudId: 'redcontacto-1' }), { tipo: 'enviada' });
});

test('409 = ya le habías pedido contacto, no un éxito ni un error genérico', () => {
  assert.deepEqual(
    estadoContactoDesde({ ok: false, status: 409, error: 'Ya tienes una solicitud pendiente con esta profesional.' }),
    { tipo: 'ya-pedida' },
  );
});

test('500, 429 y red caída se enseñan como error con su mensaje', () => {
  assert.deepEqual(estadoContactoDesde({ ok: false, status: 500, error: 'No se ha podido enviar la solicitud.' }),
    { tipo: 'error', mensaje: 'No se ha podido enviar la solicitud.' });
  assert.equal(estadoContactoDesde({ ok: false, status: 429, error: 'Demasiadas peticiones.' }).tipo, 'error');
  assert.deepEqual(estadoContactoDesde({ ok: false, status: 0, error: '' }),
    { tipo: 'error', mensaje: 'No se ha podido enviar la solicitud.' });
});
