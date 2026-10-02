import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Motor de derechos: anular una recuperación por el servidor (migración 20261002144936, fase A). Guardianes sobre el fuente;
// el comportamiento contra una base de datos real vive en `supabase/tests/rls-anular-recuperacion.test.ts`.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const MIGRACION = leer('supabase/migrations/20261002144936_anular_recuperacion.sql');

test('⚠️ anular_recuperacion: solo DISPONIBLE, comprueba estudio y rol, y anon no la ejecuta', () => {
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.anular_recuperacion'));
  assert.match(cuerpo, /rc\.estado = 'DISPONIBLE'/, 'una recuperación ya usada está ligada a su reserva: no se anula');
  assert.match(cuerpo, /p_studio_id is distinct from public\.current_studio_id\(\)/);
  assert.match(cuerpo, /not public\.puede_gestionar_clientas\(\)/, 'el mismo predicado que la política de RLS de hoy');
  assert.match(MIGRACION, /revoke all on function public\.anular_recuperacion\(text, text\) from public, anon;/);
  assert.match(MIGRACION, /grant execute on function public\.anular_recuperacion\(text, text\) to authenticated, service_role;/);
  assert.ok(!/auth\.uid\(\) is (not )?null/.test(MIGRACION));
});

test('el ledger distingue la anulación de la caducidad, y su CHECK la admite', () => {
  assert.match(MIGRACION, /when v_nuevo < v_viejo and new\.estado = 'ANULADA' then 'ANULACION_RECUPERACION'/);
  assert.match(MIGRACION, /check \(tipo in \([\s\S]*?'ANULACION_RECUPERACION'\s*\)\)/);
  // Y lo que el trigger escribe y el CHECK admite coinciden con la migración original del ledger.
  const original = leer('supabase/migrations/20261002133851_ledger_derechos.sql');
  for (const t of ['CONCESION_RECUPERACION', 'USO_RECUPERACION', 'RESTITUCION_RECUPERACION', 'CADUCIDAD_RECUPERACION']) {
    assert.ok(MIGRACION.includes(`'${t}'`), `la nueva versión del trigger perdió ${t}`);
    assert.ok(original.includes(`'${t}'`));
  }
  assert.match(MIGRACION, /revoke all on function public\.ledger_recuperacion\(\) from public, anon, authenticated;/);
});

test('⚠️ el panel anula por la RPC y NINGÚN código del navegador escribe ya en `recuperaciones` directamente', () => {
  const datos = leer('lib/supabase-data.ts');
  assert.match(datos, /supabase\.rpc\('anular_recuperacion', \{ p_id: id, p_studio_id: studioId \}\)/);
  // Mientras haya una escritura suelta del navegador, retirarle el permiso a `authenticated` (fase B) rompería esa pantalla.
  for (const f of ['lib/supabase-data.ts', 'lib/studio-context.tsx']) {
    const codigo = leer(f).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/from\('recuperaciones'\)\s*\.(insert|update|upsert|delete)\(/.test(codigo), `${f} escribe directamente en recuperaciones`);
  }
  // Las pantallas tampoco.
  for (const dir of ['components', 'app']) {
    const ficheros = (readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true }) as string[])
      .filter(f => /\.(tsx?|ts)$/.test(f));
    for (const f of ficheros) {
      const codigo = leer(`${dir}/${f}`);
      if (!codigo.includes("from('recuperaciones')")) continue;
      assert.ok(!/from\('recuperaciones'\)\s*\.(insert|update|upsert|delete)\(/.test(codigo), `${dir}/${f} escribe directamente en recuperaciones`);
    }
  }
});
