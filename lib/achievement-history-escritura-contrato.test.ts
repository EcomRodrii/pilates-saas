import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián de contrato — historial de logros (migr 20260914175000).
//
//  · Una fila por socia y logro: índice único + los dos escritores idempotentes.
//  · Desde el navegador solo se LEE y se INSERTA, acotado por rol y por logro
//    completado; nada de políticas FOR ALL/UPDATE/DELETE otra vez.
//
// Si uno falla, no se arregla quitándolo: se arregla la migración o el código.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '').replace(/\/\/.*$/gm, '');

const DESDE = '20260914175000';
const MIGRACIONES = readdirSync(join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();

test('el historial tiene índice único por socia y logro', () => {
  const sql = sinComentarios(leer(`supabase/migrations/${DESDE}_achievement_history_escritura_acotada.sql`));
  assert.match(sql, /create\s+unique\s+index[^;]*on\s+public\.achievement_history\s*\(\s*socio_id\s*,\s*achievement_id\s*\)/i);
});

test('ninguna migración desde el cierre vuelve a abrir la escritura amplia del historial', () => {
  for (const f of MIGRACIONES.filter(f => f >= DESDE)) {
    const sql = sinComentarios(leer(`supabase/migrations/${f}`));
    for (const m of sql.matchAll(/create\s+policy\s+\w+\s+on\s+(?:public\.)?achievement_history\b([^;]*);/gi)) {
      assert.doesNotMatch(m[1], /\bfor\s+(all|update|delete)\b/i, `${f}: política de escritura amplia en achievement_history`);
      if (/\bfor\s+insert\b/i.test(m[1])) {
        assert.match(m[1], /puede_gestionar_clientas\(\)/, `${f}: el alta de historial sin comprobar rol`);
        assert.match(m[1], /\.completado\b/, `${f}: el alta de historial sin exigir el logro completado`);
      }
    }
    assert.doesNotMatch(sql, /grant\s+[^;]*\b(update|delete|truncate|all)\b[^;]*on\s+(?:table\s+)?(?:public\.)?achievement_history\s+to\s+[^;]*\b(authenticated|anon)\b/i,
      `${f}: vuelve a conceder modificar o borrar historial al navegador`);
  }
});

test('los dos escritores del historial son idempotentes por socia y logro', () => {
  const panel = sinComentarios(leer('lib/supabase-data.ts'));
  const servidor = sinComentarios(leer('lib/db/supabase-data-admin.ts'));
  for (const [nombre, src] of [['panel', panel], ['servidor', servidor]] as const) {
    assert.doesNotMatch(src, /from\('achievement_history'\)\s*\.insert\(/, `${nombre}: insert sin ON CONFLICT`);
    assert.match(src, /from\('achievement_history'\)\s*\.upsert\([\s\S]*?onConflict:\s*'socio_id,achievement_id',\s*ignoreDuplicates:\s*true/,
      `${nombre}: el historial no se escribe con ON CONFLICT DO NOTHING`);
  }
});
