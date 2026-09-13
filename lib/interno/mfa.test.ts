import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoTrasMfa, exigeMfa, nivelAutenticacion, pasoMfa, puedeEnrolarFactor } from './mfa.ts';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (payload: Record<string, unknown>) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.firma`;

test('nivelAutenticacion lee el claim aal del JWT', () => {
  assert.equal(nivelAutenticacion(token({ sub: 'u', aal: 'aal2' })), 'aal2');
  assert.equal(nivelAutenticacion(token({ sub: 'u', aal: 'aal1' })), 'aal1');
});

test('nivelAutenticacion: sin claim, basura o sin token → aal1 (nunca sube nivel por error)', () => {
  assert.equal(nivelAutenticacion(token({ sub: 'u' })), 'aal1');
  assert.equal(nivelAutenticacion(token({ aal: 'AAL2' })), 'aal1');
  assert.equal(nivelAutenticacion(token({ aal: ['aal2'] })), 'aal1');
  assert.equal(nivelAutenticacion('no-es-un-jwt'), 'aal1');
  assert.equal(nivelAutenticacion('a.%%%.c'), 'aal1');
  assert.equal(nivelAutenticacion(''), 'aal1');
  assert.equal(nivelAutenticacion(null), 'aal1');
  assert.equal(nivelAutenticacion(undefined), 'aal1');
});

test('nivelAutenticacion soporta payloads con caracteres no ASCII', () => {
  assert.equal(nivelAutenticacion(token({ email: 'núria@estudio.es', aal: 'aal2' })), 'aal2');
});

test('exigeMfa: sin la variable, comportamiento de siempre', () => {
  assert.equal(exigeMfa({}, 'aal1'), false);
  assert.equal(exigeMfa({ INTERNO_EXIGIR_MFA: '' }, 'aal1'), false);
  assert.equal(exigeMfa({ INTERNO_EXIGIR_MFA: '0' }, 'aal1'), false);
});

test('exigeMfa: con INTERNO_EXIGIR_MFA=1, aal1 se rechaza y aal2 pasa', () => {
  assert.equal(exigeMfa({ INTERNO_EXIGIR_MFA: '1' }, 'aal1'), true);
  assert.equal(exigeMfa({ INTERNO_EXIGIR_MFA: '1' }, 'aal2'), false);
});

test('exigeMfa: solo el valor exacto "1" activa la exigencia', () => {
  assert.equal(exigeMfa({ INTERNO_EXIGIR_MFA: 'true' }, 'aal1'), false);
  assert.equal(exigeMfa({ INTERNO_EXIGIR_MFA: ' 1' }, 'aal1'), false);
});

test('puedeEnrolarFactor: el primer factor sin aal2; el segundo exige aal2', () => {
  assert.equal(puedeEnrolarFactor(0, 'aal1'), true);
  assert.equal(puedeEnrolarFactor(1, 'aal1'), false);
  assert.equal(puedeEnrolarFactor(1, 'aal2'), true);
  assert.equal(puedeEnrolarFactor(3, 'aal1'), false);
});

test('pasoMfa: enrolar si no hay factor, verificar si lo hay, listo con aal2', () => {
  assert.equal(pasoMfa(0, 'aal1'), 'enrolar');
  assert.equal(pasoMfa(1, 'aal1'), 'verificar');
  assert.equal(pasoMfa(1, 'aal2'), 'listo');
});

test('destinoTrasMfa: solo rutas de /interno, nunca una redirección abierta', () => {
  assert.equal(destinoTrasMfa('/interno/estudios?q=x'), '/interno/estudios?q=x');
  assert.equal(destinoTrasMfa('/interno'), '/interno');
  assert.equal(destinoTrasMfa(null), '/interno');
  assert.equal(destinoTrasMfa('https://evil.example/interno'), '/interno');
  assert.equal(destinoTrasMfa('//evil.example'), '/interno');
  assert.equal(destinoTrasMfa('/dashboard'), '/interno');
  assert.equal(destinoTrasMfa('/interno\\@evil'), '/interno');
  assert.equal(destinoTrasMfa('/interno/mfa'), '/interno');
  assert.equal(destinoTrasMfa('/interno/mfa?volver=/interno'), '/interno');
});
