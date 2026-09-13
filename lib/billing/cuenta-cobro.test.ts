import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  esStripeAccountIdValido,
  ibanEnmascarado,
  puedeCambiarCuentaDeCobro,
  validarAcreedorSepa,
  validarDatosSepa,
} from './cuenta-cobro.ts';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentariosSql = (sql: string) => sql.replace(/--.*$/gm, '');
function migracion(sufijo: string): string {
  const dir = join(RAIZ, 'supabase/migrations');
  const fichero = readdirSync(dir).find(f => f.endsWith(sufijo));
  assert.ok(fichero, `falta la migración *${sufijo}`);
  return readFileSync(join(dir, fichero), 'utf8');
}

// ── Quién puede cambiar la cuenta ────────────────────────────────────────────

test('solo la dueña con rol PROPIETARIO puede cambiar la cuenta de cobro', () => {
  assert.equal(puedeCambiarCuentaDeCobro({ rol: 'PROPIETARIO', esDuena: true }), true);
  // Ficha de equipo con rol PROPIETARIO que no firmó el alta.
  assert.equal(puedeCambiarCuentaDeCobro({ rol: 'PROPIETARIO', esDuena: false }), false);
  for (const rol of ['RECEPCION', 'MANAGER', 'INSTRUCTOR'] as const) {
    assert.equal(puedeCambiarCuentaDeCobro({ rol, esDuena: false }), false, rol);
    assert.equal(puedeCambiarCuentaDeCobro({ rol, esDuena: true }), false, `${rol} dueña`);
  }
});

// ── Formatos ─────────────────────────────────────────────────────────────────

test('stripe_account_id: solo acct_ con cuerpo alfanumérico', () => {
  assert.equal(esStripeAccountIdValido('acct_1AbCdEfGhIjKlMnO'), true);
  for (const malo of ['', 'acct_', 'acct_corto', 'cus_1AbCdEfGhIjKlMnO', 'acct_1AbCd EfGh', ' acct_1AbCdEfGhIjKlMnO', null, 42]) {
    assert.equal(esStripeAccountIdValido(malo), false, String(malo));
  }
});

test('identificador de acreedor SEPA: dígitos de control ISO 7064 sin el código de negocio', () => {
  // Vectores publicados (Bundesbank y Banca d'Italia) y uno español calculado.
  assert.equal(validarAcreedorSepa('DE98ZZZ09999999999'), true);
  assert.equal(validarAcreedorSepa('IT66ZZZA1B2C3D4E5F6G7H8'), true);
  assert.equal(validarAcreedorSepa('ES97ZZZB12345678'), true);
  // El código de negocio es libre: cambiarlo no invalida el identificador.
  assert.equal(validarAcreedorSepa('ES97001B12345678'), true);
  assert.equal(validarAcreedorSepa('es97 zzz b12345678'), true);
  // Un dígito de control o del NIF cambiado sí.
  assert.equal(validarAcreedorSepa('ES98ZZZB12345678'), false);
  assert.equal(validarAcreedorSepa('ES97ZZZB12345679'), false);
  assert.equal(validarAcreedorSepa('ES97ZZZ'), false);
});

test('validarDatosSepa normaliza, deja borrar y rechaza lo mal copiado', () => {
  const bien = validarDatosSepa({
    sepaAcreedorId: ' es97zzzb12345678 ', sepaIban: 'es79 2100 0813 6101 2345 6789', sepaTitular: '  Pilates Centro SL ',
  });
  assert.deepEqual(bien, {
    ok: true,
    datos: { sepaAcreedorId: 'ES97ZZZB12345678', sepaIban: 'ES7921000813610123456789', sepaTitular: 'Pilates Centro SL' },
  });

  assert.deepEqual(validarDatosSepa({ sepaAcreedorId: '', sepaIban: null, sepaTitular: '   ' }), {
    ok: true, datos: { sepaAcreedorId: null, sepaIban: null, sepaTitular: null },
  });

  assert.equal(validarDatosSepa({ sepaIban: 'ES7921000813610123456780' }).ok, false);
  assert.equal(validarDatosSepa({ sepaAcreedorId: 'ES98ZZZB12345678' }).ok, false);
  assert.equal(validarDatosSepa({ sepaTitular: 'x'.repeat(71) }).ok, false);
  assert.equal(validarDatosSepa({ sepaIban: 12345 }).ok, false);
  assert.equal(validarDatosSepa(null).ok, false);
});

test('el registro de actividad nunca lleva el IBAN entero', () => {
  assert.equal(ibanEnmascarado('ES79 2100 0813 6101 2345 6789'), '•••• 6789');
  assert.equal(ibanEnmascarado(null), 'sin IBAN');
});

// ── Contrato con la base de datos ────────────────────────────────────────────

test('migración: authenticated pierde la escritura de las columnas de cuenta de cobro', () => {
  const sql = sinComentariosSql(migracion('_studios_cuenta_cobro_solo_servidor.sql'));
  assert.match(sql, /revoke\s+update\s*\([^)]*stripe_account_id[^)]*\)\s*on\s+public\.studios\s+from\s+authenticated/i);
  for (const col of ['stripe_account_id_anterior', 'stripe_account_desconectado_en', 'sepa_iban', 'sepa_acreedor_id', 'sepa_titular']) {
    assert.match(sql, new RegExp(`revoke\\s+update\\s*\\([^)]*\\b${col}\\b[^)]*\\)\\s*on\\s+public\\.studios`, 'i'), col);
  }
  // El INSERT de cliente es de tabla: no se puede restar por columna, lo para un trigger.
  assert.match(sql, /before\s+insert\s+or\s+update\s+on\s+public\.studios/i);
  assert.match(sql, /auth\.uid\(\)\s+is\s+null/i);
  assert.match(sql, /new\.stripe_account_id\s*:=\s*null/i);
  assert.match(sql, /new\.sepa_iban\s*:=\s*null/i);
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
});

test('migración: instructores y socios no aceptan auth_user_id ajeno desde una petición de usuario', () => {
  const sql = sinComentariosSql(migracion('_auth_user_id_solo_propio_o_servidor.sql'));
  assert.match(sql, /before\s+insert\s+or\s+update\s+of\s+auth_user_id\s+on\s+public\.instructores/i);
  assert.match(sql, /before\s+insert\s+or\s+update\s+of\s+auth_user_id\s+on\s+public\.socios/i);
  assert.match(sql, /auth\.uid\(\)/);
  // Reenviar la ficha sin cambiar la cuenta no debe fallar.
  assert.match(sql, /new\.auth_user_id\s+is\s+not\s+distinct\s+from\s+old\.auth_user_id/i);
  // Instructores: NULL o la propia cuenta.
  assert.match(sql, /new\.auth_user_id\s*=\s*v_uid/i);
  assert.match(sql, /errcode\s*=\s*'42501'/i);
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
  // Las funciones de trigger no se exponen como RPC.
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.instructores_auth_user_id_solo_propio\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.socios_auth_user_id_solo_servidor\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
});

// ── Contrato con el código de cliente ────────────────────────────────────────

test('el navegador ya no escribe la cuenta de cobro ni la mapea en dbUpdateStudio', () => {
  const datos = leer('lib/supabase-data.ts');
  for (const col of ['stripe_account_id', 'sepa_iban', 'sepa_acreedor_id', 'sepa_titular']) {
    assert.doesNotMatch(datos, new RegExp(`db\\.${col}\\s*=`), col);
  }
  assert.doesNotMatch(leer('components/configuracion/tab-integraciones.tsx'), /updateStudio\(\{\s*stripeAccountId/);
  assert.doesNotMatch(leer('components/configuracion/tab-estudio-cobros.tsx'), /updateStudio\(\{\s*sepa/);
});

test('las rutas de servidor comprueban la dueña antes de tocar la cuenta de cobro', () => {
  for (const ruta of ['app/api/integrations/stripe/desconectar/route.ts', 'app/api/estudio/sepa/route.ts']) {
    const src = leer(ruta);
    assert.match(src, /verificarSesionStaff\(req\)/, ruta);
    assert.match(src, /owner_auth_user_id/, ruta);
    assert.match(src, /puedeCambiarCuentaDeCobro\(/, ruta);
    // El estudio sale de la sesión, nunca del body.
    assert.match(src, /sesion\.studioId/, ruta);
    assert.match(src, /actividad_reciente/, ruta);
  }
  // Y el inicio del OAuth de Stripe, que es la otra forma de cambiar la cuenta.
  const estado = leer('app/api/integrations/oauth-state/route.ts');
  assert.match(estado, /puedeCambiarCuentaDeCobro\(/);
});
