import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Motor de derechos, FASE B (migración 20261002154833): `recuperaciones` solo la escribe el servidor. El efecto en la base de
// datos lo prueba `supabase/tests/rls-recuperaciones-solo-servidor.test.ts`; aquí, que el cierre no se deshaga sin querer.

const raiz = join(import.meta.dirname, '..', '..');
const MIGRACION = readFileSync(join(raiz, 'supabase/migrations/20261002154833_recuperaciones_solo_servidor.sql'), 'utf8').replace(/--.*$/gm, '');

test('⚠️ la migración retira las políticas y el privilegio de escritura, y verifica el resultado', () => {
  for (const politica of ['recuperaciones_escritura_insert', 'recuperaciones_escritura_update', 'recuperaciones_escritura_delete']) {
    assert.match(MIGRACION, new RegExp(`drop policy if exists ${politica} on public\\.recuperaciones`));
  }
  assert.match(MIGRACION, /revoke insert, update, delete on public\.recuperaciones from public, anon, authenticated/);
  assert.match(MIGRACION, /has_table_privilege\('authenticated', 'public\.recuperaciones', 'SELECT'\)/);
  assert.ok(!/grant\s+(insert|update|delete|all)/i.test(MIGRACION), 'la migración no devuelve ningún privilegio de escritura');
});

test('⚠️ ninguna migración POSTERIOR devuelve a authenticated la escritura de recuperaciones', () => {
  const dir = join(raiz, 'supabase', 'migrations');
  const posteriores = readdirSync(dir).filter(f => f.endsWith('.sql') && f > '20261002154833_');
  for (const f of posteriores) {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '');
    assert.ok(
      !/grant\s+[^;]*\b(insert|update|delete|all)\b[^;]*on\s+(table\s+)?(public\.)?recuperaciones\b[^;]*to\s+[^;]*\b(authenticated|anon|public)\b/i.test(sql),
      `${f} devuelve la escritura de recuperaciones al navegador`,
    );
    assert.ok(
      !/create\s+policy\s+\S+\s+on\s+(public\.)?recuperaciones\s+for\s+(insert|update|delete|all)\b/i.test(sql),
      `${f} crea una política de escritura sobre recuperaciones`,
    );
  }
});

test('⚠️ ningún código del navegador escribe en recuperaciones: solo RPC (crear/anular) o el servidor', () => {
  // `lib/supabase-data.ts` es el cliente del navegador. Una escritura directa fallaría en producción desde esta migración.
  const fuente = readFileSync(join(raiz, 'lib/supabase-data.ts'), 'utf8');
  assert.ok(
    !/from\(\s*['"]recuperaciones['"]\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(fuente),
    'lib/supabase-data.ts escribe directamente en recuperaciones: usa crear_recuperacion / anular_recuperacion',
  );
  assert.match(fuente, /rpc\('anular_recuperacion'/);
  assert.match(fuente, /rpc\('crear_recuperacion'/);
});
