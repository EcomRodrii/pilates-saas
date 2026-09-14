import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huellaIp, truncarUserAgent, resultadoAceptacion, rpcNoDesplegada, USER_AGENT_MAX } from './aceptacion-contrato.ts';

test('huellaIp: 64 hex, determinista, depende del secreto y no contiene la IP', () => {
  const a = huellaIp('203.0.113.7', 'secreto-a');
  assert.match(a!, /^[0-9a-f]{64}$/);
  assert.equal(huellaIp(' 203.0.113.7 ', 'secreto-a'), a);
  assert.notEqual(huellaIp('203.0.113.7', 'secreto-b'), a);
  assert.notEqual(huellaIp('203.0.113.8', 'secreto-a'), a);
  assert.ok(!a!.includes('203'));
});

test('huellaIp: sin secreto o sin IP real no se guarda nada (nunca la IP en claro)', () => {
  assert.equal(huellaIp('203.0.113.7', ''), null);
  assert.equal(huellaIp('unknown', 'x'), null);
  assert.equal(huellaIp('', 'x'), null);
  assert.equal(huellaIp(null, 'x'), null);
});

test('truncarUserAgent: recorta a 256, quita control y vacío es null', () => {
  assert.equal(truncarUserAgent('x'.repeat(1000))!.length, USER_AGENT_MAX);
  assert.equal(truncarUserAgent('Mozilla/5.0\n\tiPhone'), 'Mozilla/5.0  iPhone');
  assert.equal(truncarUserAgent('   '), null);
  assert.equal(truncarUserAgent(null), null);
});

test('resultadoAceptacion: OK cambia, repetir es idempotente, lo demás no se anuncia como éxito', () => {
  assert.deepEqual(resultadoAceptacion('OK'), { ok: true, cambiado: true });
  assert.deepEqual(resultadoAceptacion('YA_CONSTABA'), { ok: true, cambiado: false });
  assert.equal(resultadoAceptacion('SOCIA_NO_ENCONTRADA').ok, false);
  assert.equal((resultadoAceptacion(null) as { status: number }).status, 500);
});

test('rpcNoDesplegada: solo «la función no existe», no cualquier error', () => {
  assert.equal(rpcNoDesplegada({ code: 'PGRST202' }), true);
  assert.equal(rpcNoDesplegada({ code: '42883' }), true);
  assert.equal(rpcNoDesplegada({ code: '23505' }), false);
  assert.equal(rpcNoDesplegada(null), false);
});
