import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// `public.factores_mfa_de` lee `auth.mfa_factors` con SECURITY DEFINER: si
// `authenticated` pudiera llamarla, preguntaría por los factores de OTRA persona.
// Y `REVOKE ... FROM PUBLIC` no basta en este proyecto (pg_default_acl).
const DIR = join(import.meta.dirname, '../../supabase/migrations');
const nombre = readdirSync(DIR).find(n => n.endsWith('_factores_mfa_de.sql'));
const sql = nombre ? readFileSync(join(DIR, nombre), 'utf8').replace(/--.*$/gm, '') : '';

test('la migración existe y es SECURITY DEFINER con search_path fijo', () => {
  assert.ok(nombre, 'falta la migración *_factores_mfa_de.sql');
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path\s*=/i);
});

test('solo service_role ejecuta: los tres roles, explícitos', () => {
  assert.match(sql, /revoke all on function public\.factores_mfa_de\(uuid\) from public,\s*anon,\s*authenticated/i);
  assert.match(sql, /grant execute on function public\.factores_mfa_de\(uuid\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function [^;]*?\)\s+to\s+[^;]*\b(anon|authenticated|public)\b/i);
});

test('nunca devuelve secretos ni datos de otros métodos', () => {
  for (const columna of ['secret', 'phone', 'web_authn_credential', 'web_authn_aaguid', 'last_webauthn_challenge_data']) {
    assert.doesNotMatch(sql, new RegExp(`f\\.${columna}\\b`), `no debe leer ${columna}`);
  }
});
