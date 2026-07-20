import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmarTokenInstructora, verificarTokenInstructora } from './token.ts';

process.env.SUSTITUCION_TOKEN_SECRET ??= 'test-secret-sustituciones';
const AHORA = 1_700_000_000_000;
const DIA = 24 * 60 * 60 * 1000;

test('roundtrip: firma y verifica devolviendo el claim', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'disponibilidad', null, AHORA);
  assert.deepEqual(verificarTokenInstructora(t, 'disponibilidad', AHORA), {
    instructorId: 'ins-1', studioId: 'studio-1', ref: null,
  });
});

test('roundtrip con ref (la sustitución concreta)', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'aceptar_sustitucion', 'sust-42', AHORA);
  assert.deepEqual(verificarTokenInstructora(t, 'aceptar_sustitucion', AHORA), {
    instructorId: 'ins-1', studioId: 'studio-1', ref: 'sust-42',
  });
});

// ── Aislamiento entre scopes ────────────────────────────────────────────────
// La propiedad de seguridad del módulo: cada enlace sirve para UNA cosa. Un
// enlace de disponibilidad no puede desconvocar clases, y el de baja no puede
// aceptar sustituciones en nombre de nadie — aunque los reciba la misma persona.

test('un token de disponibilidad NO sirve para reportar una baja', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'disponibilidad', null, AHORA);
  assert.equal(verificarTokenInstructora(t, 'reportar_baja', AHORA), null);
});

test('un token de baja NO sirve para aceptar una sustitución ni para disponibilidad', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'reportar_baja', null, AHORA);
  assert.equal(verificarTokenInstructora(t, 'aceptar_sustitucion', AHORA), null);
  assert.equal(verificarTokenInstructora(t, 'disponibilidad', AHORA), null);
});

test('el token de baja sí vale para su propio scope', () => {
  const t = firmarTokenInstructora('ins-7', 'studio-2', 'reportar_baja', null, AHORA);
  const claim = verificarTokenInstructora(t, 'reportar_baja', AHORA);
  assert.equal(claim?.instructorId, 'ins-7');
  assert.equal(claim?.studioId, 'studio-2');
});

// ── Caducidad ───────────────────────────────────────────────────────────────

test('reportar_baja vive 30 días, como disponibilidad', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'reportar_baja', null, AHORA);
  assert.notEqual(verificarTokenInstructora(t, 'reportar_baja', AHORA + 29 * DIA), null);
  assert.equal(verificarTokenInstructora(t, 'reportar_baja', AHORA + 31 * DIA), null);
});

test('aceptar_sustitucion caduca en 3 h', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'aceptar_sustitucion', 'sust-1', AHORA);
  assert.notEqual(verificarTokenInstructora(t, 'aceptar_sustitucion', AHORA + 2 * 60 * 60 * 1000), null);
  assert.equal(verificarTokenInstructora(t, 'aceptar_sustitucion', AHORA + 4 * 60 * 60 * 1000), null);
});

// ── Manipulación ────────────────────────────────────────────────────────────

test('firma manipulada → null', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'reportar_baja', null, AHORA);
  const [payload] = t.split('.');
  assert.equal(verificarTokenInstructora(`${payload}.firmafalsa`, 'reportar_baja', AHORA), null);
});

test('cambiar el scope del payload a mano no cuela (la firma no cuadra)', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'disponibilidad', null, AHORA);
  const sig = t.split('.')[1];
  const otro = Buffer.from(JSON.stringify({
    instructorId: 'ins-1', studioId: 'studio-1', scope: 'reportar_baja', ref: null, exp: AHORA + DIA,
  })).toString('base64url');
  assert.equal(verificarTokenInstructora(`${otro}.${sig}`, 'reportar_baja', AHORA), null);
});

test('suplantar a otra instructora reusando la firma → null', () => {
  const t = firmarTokenInstructora('ins-1', 'studio-1', 'reportar_baja', null, AHORA);
  const sig = t.split('.')[1];
  const otro = Buffer.from(JSON.stringify({
    instructorId: 'ins-OTRA', studioId: 'studio-1', scope: 'reportar_baja', ref: null, exp: AHORA + DIA,
  })).toString('base64url');
  assert.equal(verificarTokenInstructora(`${otro}.${sig}`, 'reportar_baja', AHORA), null);
});

test('basura → null', () => {
  assert.equal(verificarTokenInstructora('', 'reportar_baja', AHORA), null);
  assert.equal(verificarTokenInstructora('sinpunto', 'reportar_baja', AHORA), null);
  assert.equal(verificarTokenInstructora(null, 'reportar_baja', AHORA), null);
  assert.equal(verificarTokenInstructora(undefined, 'reportar_baja', AHORA), null);
  assert.equal(verificarTokenInstructora('.solopunto', 'reportar_baja', AHORA), null);
});
