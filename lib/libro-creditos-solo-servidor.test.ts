import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// El libro de créditos y canjes solo lo escribe el SERVIDOR (migración
// 20261019122718_libro_creditos_solo_servidor.sql).
//
// Antes, cualquier cuenta de mostrador podía escribir a pelo con su sesión en
// `reward_redemptions`, `credit_transactions` y `reward_history`, y con eso
// saltarse que la ganancia de saldo solo la concede el servidor. Nada del
// producto lo hacía: todo va por RPC (`canjear_recompensa`, `cancelar_canje`,
// `entregar_canje`, `otorgar_credito_disparador`) o por service-role.
//
// Lo que prueba la base de datos de verdad se verificó con `execute_sql` +
// ROLLBACK (ver el PR). Aquí se fija que el CÓDIGO no vuelve a escribir en
// esas tablas desde el navegador y que la migración dice lo que tiene que decir.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// No amplíes la lista de excepciones: la escritura nueva va por una RPC
// SECURITY DEFINER con su comprobación de rol, o por una ruta de servidor con
// service-role. Un cliente `supabase` de navegador escribiendo aquí recibiría
// 42501 en producción.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');

const TABLAS_DEL_LIBRO = [
  'reward_redemptions', 'credit_transactions', 'reward_history', 'reward_actions', 'member_credits',
];
const FUNCIONES_SOLO_SERVIDOR = ['ajustar_creditos', 'ajustar_stock'];

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : ficheros(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Quien escribe con el cliente del NAVEGADOR (`supabase`, el de lib/supabase.ts, con la sesión de
// la persona) y no con `admin`/`db`/`sb` de servidor. Se acepta el encadenado en varias líneas.
const ESCRITURA_NAVEGADOR = (tabla: string) =>
  new RegExp(String.raw`\bsupabase\s*\.from\(\s*['"\`]${tabla}['"\`]\s*\)\s*\.(insert|update|upsert|delete)\b`);
const RPC_NAVEGADOR = (fn: string) =>
  new RegExp(String.raw`\bsupabase\s*\.rpc\(\s*['"\`]${fn}['"\`]`);

test('ningún código del navegador escribe en las tablas del libro de créditos', () => {
  const culpables: string[] = [];
  for (const f of ['app', 'components', 'lib'].flatMap(d => ficheros(join(RAIZ, d)))) {
    const src = sinComentarios(readFileSync(f, 'utf8'));
    for (const t of TABLAS_DEL_LIBRO) {
      if (ESCRITURA_NAVEGADOR(t).test(src)) culpables.push(`${relative(RAIZ, f)} → ${t}`);
    }
  }
  assert.deepEqual(culpables, [], `Escritura de navegador en el libro de créditos: ${culpables.join(', ')}`);
});

test('ningún código del navegador llama a las RPC solo-servidor de créditos y stock', () => {
  const culpables: string[] = [];
  for (const f of ['app', 'components', 'lib'].flatMap(d => ficheros(join(RAIZ, d)))) {
    const src = sinComentarios(readFileSync(f, 'utf8'));
    for (const fn of FUNCIONES_SOLO_SERVIDOR) {
      if (RPC_NAVEGADOR(fn).test(src)) culpables.push(`${relative(RAIZ, f)} → ${fn}`);
    }
  }
  assert.deepEqual(culpables, [], `El navegador llama a una RPC solo-servidor: ${culpables.join(', ')}`);
});

test('los llamadores muertos que escribían a pelo no han vuelto', () => {
  const muertos = [
    'dbInsertCreditTransaction', 'dbInsertRewardRedemption', 'dbUpdateRewardRedemption',
    'dbAjustarCreditos', 'dbAjustarStock',
  ];
  const vuelven: string[] = [];
  for (const f of ['app', 'components', 'lib'].flatMap(d => ficheros(join(RAIZ, d)))) {
    const src = sinComentarios(readFileSync(f, 'utf8'));
    for (const m of muertos) if (new RegExp(String.raw`\b${m}\b`).test(src)) vuelven.push(`${relative(RAIZ, f)} → ${m}`);
  }
  assert.deepEqual(vuelven, [], `Vuelven llamadores que la base de datos rechaza: ${vuelven.join(', ')}`);
});

// ── La migración ─────────────────────────────────────────────────────────────

function migracion(): string {
  const dir = join(RAIZ, 'supabase', 'migrations');
  const nombre = readdirSync(dir).find(n => n.endsWith('_libro_creditos_solo_servidor.sql'));
  assert.ok(nombre, 'no existe la migración libro_creditos_solo_servidor');
  return readFileSync(join(dir, nombre), 'utf8').replace(/^\s*--.*$/gm, '').toLowerCase();
}

test('la migración quita INSERT/UPDATE/DELETE de tabla a authenticated en todo el libro', () => {
  const sql = migracion();
  for (const t of TABLAS_DEL_LIBRO) {
    assert.match(sql, new RegExp(`revoke insert, update, delete on table public\\.${t} from authenticated`), `falta el REVOKE de ${t}`);
  }
  // Nada que devuelva la escritura a nadie que no sea el servidor.
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\b[^;]*\bto\s+(authenticated|anon|public)\b/);
});

test('la migración borra las políticas de escritura del libro', () => {
  const sql = migracion();
  const politicas = [
    'reward_redemptions_insert', 'reward_redemptions_update', 'reward_redemptions_delete',
    'credit_transactions_insert', 'credit_transactions_update', 'credit_transactions_delete',
    'reward_history_insert', 'reward_history_update', 'reward_history_delete',
  ];
  for (const p of politicas) assert.match(sql, new RegExp(`drop policy if exists ${p} on public\\.`), `falta borrar ${p}`);
});

test('la migración cierra reward_actions a INSTRUCTOR sin tocar a los demás roles', () => {
  const sql = migracion();
  assert.match(sql, /alter policy staff_lee_reward_actions on public\.reward_actions/);
  assert.match(sql, /current_rol\(\)\) is distinct from 'instructor'/);
  assert.match(sql, /studio_id = public\.current_studio_id\(\)/);
});

test('la migración deja ajustar_creditos y ajustar_stock solo para service_role, con los tres roles revocados', () => {
  const sql = migracion();
  const firmas: Record<string, string> = {
    ajustar_creditos: 'text, text, integer, integer, integer',
    ajustar_stock: 'text, text, integer',
  };
  for (const [fn, args] of Object.entries(firmas)) {
    for (const rol of ['public', 'anon', 'authenticated']) {
      assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}\\(${args}\\) from ${rol};`), `${fn}: falta REVOKE FROM ${rol}`);
    }
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(${args}\\) to service_role;`), `${fn}: falta GRANT a service_role`);
  }
});

test('la migración pone pg_temp en el search_path de las tres RPC de canje, sin redefinirlas', () => {
  const sql = migracion();
  assert.match(sql, /alter function public\.canjear_recompensa\(text, text, text, text\) set search_path = public, pg_temp;/);
  assert.match(sql, /alter function public\.entregar_canje\(text, text, text\) set search_path = public, pg_temp;/);
  assert.match(sql, /alter function public\.generar_codigo_canje\(text\) set search_path = public, pg_temp;/);
  // Redefinir con CREATE OR REPLACE cambiaría el cuerpo (y con otra firma reabriría el grant a PUBLIC).
  assert.doesNotMatch(sql, /create (or replace )?function/);
});

test('la migración termina con un bloque de verificación que aborta si no quedó cerrada', () => {
  const sql = migracion();
  assert.match(sql, /do \$verif\$/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sql, /has_table_privilege\('authenticated'/);
});
