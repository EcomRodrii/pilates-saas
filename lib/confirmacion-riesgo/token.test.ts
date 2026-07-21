import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmarTokenConfirmacion, verificarTokenConfirmacion } from './token.ts';

process.env.SUSTITUCION_TOKEN_SECRET ??= 'test-secret-confirmacion-riesgo';
const AHORA = 1_700_000_000_000;
const HORA = 60 * 60 * 1000;

test('roundtrip: firma y verifica devolviendo el claim', () => {
  const t = firmarTokenConfirmacion('studio-1', 'soc-9', 'res-7', AHORA);
  assert.deepEqual(verificarTokenConfirmacion(t, AHORA), {
    studioId: 'studio-1', socioId: 'soc-9', reservaId: 'res-7',
  });
});

test('sigue siendo válido bien entrado el margen hasta el corte (30h)', () => {
  const t = firmarTokenConfirmacion('studio-1', 'soc-9', 'res-7', AHORA);
  assert.notEqual(verificarTokenConfirmacion(t, AHORA + 30 * HORA), null);
});

test('caduca pasadas las 36h', () => {
  const t = firmarTokenConfirmacion('studio-1', 'soc-9', 'res-7', AHORA);
  assert.equal(verificarTokenConfirmacion(t, AHORA + 37 * HORA), null);
});

test('firma manipulada → null', () => {
  const t = firmarTokenConfirmacion('studio-1', 'soc-9', 'res-7', AHORA);
  const [payload] = t.split('.');
  assert.equal(verificarTokenConfirmacion(`${payload}.firmafalsa`, AHORA), null);
});

test('cambiar la reserva a mano no cuela (la firma no cuadra)', () => {
  const t = firmarTokenConfirmacion('studio-1', 'soc-9', 'res-7', AHORA);
  const sig = t.split('.')[1];
  const otro = Buffer.from(JSON.stringify({
    studioId: 'studio-1', socioId: 'soc-9', reservaId: 'res-OTRA', scope: 'confirmar_reserva', exp: AHORA + HORA,
  })).toString('base64url');
  assert.equal(verificarTokenConfirmacion(`${otro}.${sig}`, AHORA), null);
});

test('basura → null', () => {
  assert.equal(verificarTokenConfirmacion('', AHORA), null);
  assert.equal(verificarTokenConfirmacion('sinpunto', AHORA), null);
  assert.equal(verificarTokenConfirmacion(null, AHORA), null);
  assert.equal(verificarTokenConfirmacion(undefined, AHORA), null);
});
