import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidar, validarCuerpo } from './peticion.ts';

const UUID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

test('el cuerpo: pregunta de 1 a 500 caracteres, conversación opcional y en formato uuid, nada más cuenta', () => {
  assert.deepEqual(validarCuerpo({ pregunta: '  ¿Cuántas activas?  ' }), { ok: true, conversacionId: null, pregunta: '¿Cuántas activas?' });
  assert.deepEqual(validarCuerpo({ pregunta: 'x', conversacionId: UUID, studioId: 'otro' }), { ok: true, conversacionId: UUID, pregunta: 'x' });
  assert.equal(validarCuerpo({ pregunta: '' }).ok, false);
  assert.equal(validarCuerpo({ pregunta: 'x'.repeat(501) }).ok, false);
  assert.equal(validarCuerpo({ pregunta: 'hola\u0000' }).ok, false);
  assert.equal(validarCuerpo({ pregunta: 'hola', conversacionId: '1; drop' }).ok, false);
  assert.equal(validarCuerpo(null).ok, false);
  assert.equal(validarCuerpo([]).ok, false);
});

const USO = { input: 3000, output: 400, cacheRead: 5000, cacheCreation: 0 };
const NADA = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

test('liquidar: respondida se consume; sin respuesta de Anthropic se libera; a medias o cortada, fallida', () => {
  assert.deepEqual(liquidar('OK', USO), { estado: 'CONSUMIDA', costeUsd: 0.0055, codigoError: null });
  assert.equal(liquidar('DEMASIADO_AMPLIA', USO).estado, 'CONSUMIDA');
  assert.deepEqual(liquidar('IA_NO_DISPONIBLE', NADA), { estado: 'LIBERADA', costeUsd: 0, codigoError: 'IA_NO_DISPONIBLE' });
  assert.deepEqual(liquidar('INTERNO', USO), { estado: 'FALLIDA', costeUsd: 0.0055, codigoError: 'INTERNO' });
  assert.deepEqual(liquidar('ABORTADA', NADA), { estado: 'FALLIDA', costeUsd: 0.15, codigoError: 'ABORTADA' });
});
