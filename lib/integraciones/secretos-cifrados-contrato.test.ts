import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAMPOS_SECRETOS } from './config-cifrada.ts';

// Contrato de encargo (2-oct-2026): «credenciales cifradas» es una garantía de
// la BD, no solo de la app. Si se añade un campo secreto nuevo a la config de
// una integración, su CHECK también tiene que conocerlo.
const RAIZ = join(import.meta.dirname, '..', '..');
const migracion = readFileSync(join(RAIZ, 'supabase/migrations/20261003102804_credenciales_integraciones_siempre_cifradas.sql'), 'utf8');
const admin = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');

test('el CHECK de integraciones.config cubre cada campo secreto', () => {
  const check = migracion.slice(migracion.indexOf('add constraint integraciones_secretos_cifrados'));
  for (const campo of CAMPOS_SECRETOS) {
    assert.match(check, new RegExp(`config->>'${campo}'`), `falta ${campo} en el CHECK`);
  }
});

test('ninguna escritura de credenciales sigue adelante sin clave', () => {
  assert.doesNotMatch(admin, /avisarSiSinClave/);
  assert.match(admin, /if \(sinClaveDeCifrado\(claves\)\) throw new Error\(SIN_CLAVE_INTEGRACIONES\);/);
  assert.match(admin, /if \(enClaro && sinClaveDeCifrado\(claves\)\) return \{ ok: false/);
});
