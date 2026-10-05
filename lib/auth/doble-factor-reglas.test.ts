import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { destinoTrasVerificar, exigeSegundoPaso, factoresVerificados, NOMBRE_FACTOR_INTERNO, pasoDobleFactor } from './doble-factor-reglas.ts';

test('solo cuentan los factores verificados', () => {
  assert.equal(factoresVerificados([{ status: 'verified' }, { status: 'unverified' }]), 1);
  assert.equal(factoresVerificados(null), 0);
});

test('el factor de la zona interna no enciende la verificación de la cuenta', () => {
  assert.equal(factoresVerificados([{ status: 'verified', friendly_name: 'Tentare Internal' }]), 0);
  assert.equal(factoresVerificados([{ status: 'verified', friendly_name: 'Tentare Internal' }, { status: 'verified', friendly_name: 'Tentare' }]), 1);
  // El de la app del estudio lleva el nombre del estudio: cuenta.
  assert.equal(factoresVerificados([{ status: 'verified', friendly_name: 'Estudio' }]), 1);
});

test('el nombre del factor interno es el que pone /interno/mfa', () => {
  const pantalla = readFileSync(new URL('../../app/interno/mfa/page.tsx', import.meta.url), 'utf8');
  assert.match(pantalla, /friendlyName: NOMBRE_FACTOR_INTERNO/);
  // Y la migración que lo excluye en SQL usa el mismo texto.
  const migr = readFileSync(new URL('../../supabase/migrations/20261005220308_factor_interno_solo_en_interno.sql', import.meta.url), 'utf8');
  assert.match(migr, new RegExp(`is distinct from '${NOMBRE_FACTOR_INTERNO}'`));
});

test('regla A: quien la tiene activada necesita el segundo paso, también una instructora', () => {
  assert.equal(exigeSegundoPaso({ factoresVerificados: 1, estudioLoExige: false, rol: 'RECEPCION' }), true);
  assert.equal(exigeSegundoPaso({ factoresVerificados: 1, estudioLoExige: false, rol: 'INSTRUCTOR' }), true);
});

test('regla B: el estudio la exige al equipo del panel, no a la instructora', () => {
  assert.equal(exigeSegundoPaso({ factoresVerificados: 0, estudioLoExige: true, rol: 'PROPIETARIO' }), true);
  assert.equal(exigeSegundoPaso({ factoresVerificados: 0, estudioLoExige: true, rol: 'MANAGER' }), true);
  assert.equal(exigeSegundoPaso({ factoresVerificados: 0, estudioLoExige: true, rol: 'INSTRUCTOR' }), false);
  assert.equal(exigeSegundoPaso({ factoresVerificados: 0, estudioLoExige: false, rol: 'PROPIETARIO' }), false);
});

test('el paso que toca: verificar si la tiene, activar si se la exigen y no la tiene', () => {
  const base = { nivel: 'aal1' as const, factoresVerificados: 0, estudioLoExige: false, rol: 'RECEPCION' };
  assert.equal(pasoDobleFactor(base), 'ok');
  assert.equal(pasoDobleFactor({ ...base, factoresVerificados: 1 }), 'verificar');
  assert.equal(pasoDobleFactor({ ...base, estudioLoExige: true }), 'activar');
  assert.equal(pasoDobleFactor({ ...base, estudioLoExige: true, factoresVerificados: 1, nivel: 'aal2' }), 'ok');
});

test('a dónde volver: solo rutas del panel', () => {
  assert.equal(destinoTrasVerificar('/clientas/1?pestana=pagos'), '/clientas/1?pestana=pagos');
  for (const malo of [null, 'https://otro.invalid', '//otro.invalid', '/\\otro', '/interno', '/verificar-acceso', '/login',
    '/\t/otro.invalid', '/\n/otro.invalid', '/%09/otro.invalid'.replace('%09', '\t')]) {
    assert.equal(destinoTrasVerificar(malo), '/dashboard', String(malo));
  }
});

test('fuera del panel: sin la verificación activada nunca falta nada; con ella, aal2 o sesión confiada', async () => {
  const { faltaSegundoPaso } = await import('./doble-factor-reglas.ts');
  assert.equal(faltaSegundoPaso({ factoresVerificados: 0, nivel: 'aal1', confiada: false }), false, 'quien no la activa no nota nada');
  assert.equal(faltaSegundoPaso({ factoresVerificados: 1, nivel: 'aal1', confiada: false }), true, 'contraseña sola: falta');
  assert.equal(faltaSegundoPaso({ factoresVerificados: 1, nivel: 'aal2', confiada: false }), false);
  assert.equal(faltaSegundoPaso({ factoresVerificados: 1, nivel: 'aal1', confiada: true }), false, 'dispositivo recordado o código del correo');
});
