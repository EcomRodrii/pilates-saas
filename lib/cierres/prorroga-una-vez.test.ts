import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { diasDeCierre, notaDiasYaProrrogados } from './dias-de-cierre.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: la prórroga de un cierre se suma UNA vez por día cerrado.
//
// Guardar un cierre alarga los bonos y recuperaciones de TODAS las alumnas. Se
// sumaba otra vez al reintentar el POST (camino 23505) y al quitar el cierre y
// volver a ponerlo, porque la suma no dejaba rastro. Ahora la hace
// `prorrogar_por_cierre` en una transacción que la apunta en `cierres_prorrogas`.
//
// La regla vive en SQL y aquí no hay base de datos: se lee la migración vigente
// y el código que la llama. Replicar la regla en TS sería tener dos fuentes de
// verdad, que es justo como nacen estos bugs.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');

const sinComentariosTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sinComentariosSql = (s: string) => s.replace(/--.*$/gm, '');

const APLICAR = sinComentariosTs(readFileSync(join(RAIZ, 'lib/cierres/aplicar-cierre.ts'), 'utf8'));
const RUTA = sinComentariosTs(readFileSync(join(RAIZ, 'app/api/cierres/route.ts'), 'utf8'));

/** La migración MÁS NUEVA que define la función manda, no un fichero fijo. */
function migracionVigente(): { fichero: string; sql: string; cuerpo: string } {
  const candidatas = readdirSync(MIGRACIONES)
    .filter(f => f.endsWith('.sql'))
    .filter(f => /function\s+public\.prorrogar_por_cierre\s*\(/i.test(readFileSync(join(MIGRACIONES, f), 'utf8')))
    .sort();
  assert.ok(candidatas.length > 0, 'ninguna migración define prorrogar_por_cierre: ¿cambió el nombre?');
  const fichero = candidatas[candidatas.length - 1];
  const sql = sinComentariosSql(readFileSync(join(MIGRACIONES, fichero), 'utf8'));
  const desde = sql.search(/function\s+public\.prorrogar_por_cierre\s*\(/i);
  const abre = sql.indexOf('$function$', desde);
  const cierra = sql.indexOf('$function$', abre + 10);
  assert.ok(abre > 0 && cierra > abre, `${fichero}: no se encontró el cuerpo entre $function$`);
  return { fichero, sql, cuerpo: sql.slice(abre + 10, cierra) };
}

const { fichero, sql: SQL, cuerpo: CUERPO } = migracionVigente();

// ─── (a) Reintento del mismo cierre ─────────────────────────────────────────

test('aplicar-cierre no llama nunca a ampliar_caducidades: ni en el camino del duplicado ni en ningún otro', () => {
  assert.doesNotMatch(APLICAR, /ampliar_caducidades/,
    'Llamarla directo no deja rastro: un reintento del POST (23505) volvería a alargar todos los bonos.');
  const rpcs = [...APLICAR.matchAll(/\.rpc\(\s*'(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(rpcs, ['prorrogar_por_cierre'], 'la única prórroga es la RPC que la apunta');
  assert.match(APLICAR, /p_cierre_id:\s*cierreId\b/, 'idempotente por el id del cierre');
  // Las socias las elige la RPC dentro de su transacción, no una lista traída antes.
  assert.doesNotMatch(APLICAR, /from\('socios'\)/);
});

test('reintentar el mismo cierre (23505) no prorroga otra vez', () => {
  // En TS el duplicado sigue adelante (termina de cancelar clases) y solo puede
  // llegar a la RPC idempotente.
  assert.match(APLICAR, /if \(errCierre && errCierre\.code !== '23505'\) \{\s*return \{ error:/);
  assert.ok(APLICAR.indexOf("from('cierres_estudio').insert(") < APLICAR.indexOf(".rpc('prorrogar_por_cierre'"),
    'la prórroga va después de guardar el cierre, que es de donde lee la RPC');

  // En SQL, si ese cierre ya está apuntado se devuelve cero ANTES de sumar.
  const yaApuntado = CUERPO.search(
    /if exists \(select 1 from public\.cierres_prorrogas p where p\.cierre_id = p_cierre_id\) then\s*return query select 0, v_total, 0, 0;\s*return;/,
  );
  assert.ok(yaApuntado > 0, `${fichero}: falta la salida temprana para un cierre ya prorrogado (y su \`return;\`: \`return query\` no termina)`);
  assert.ok(yaApuntado < CUERPO.indexOf('ampliar_caducidades('), `${fichero}: la salida temprana tiene que ir antes de sumar`);
});

// ─── (b) Quitar y volver a poner ────────────────────────────────────────────

test('quitar y volver a poner el mismo rango no prorroga otra vez: el apunte sobrevive al cierre', () => {
  const tabla = SQL.match(/create table if not exists public\.cierres_prorrogas \(([\s\S]*?)\n\);/);
  assert.ok(tabla, `${fichero}: falta la tabla cierres_prorrogas`);
  assert.doesNotMatch(tabla![1], /references\s+public\.cierres_estudio/,
    'Con FK (y on delete cascade) quitar el cierre borraría el apunte, y volver a ponerlo sumaría otra vez.');
  assert.match(tabla![1], /cierre_id text primary key/);
  // Quitar un cierre no toca el apunte.
  assert.doesNotMatch(RUTA, /cierres_prorrogas/);
  // Los días cubiertos se buscan por estudio y fecha, no por la fila del cierre:
  // un cierre vuelto a poner encuentra sus días ya sumados.
  assert.match(CUERPO,
    /not exists \(\s*select 1 from public\.cierres_prorrogas p\s+where p\.studio_id = p_studio_id\s+and v_desde \+ g\.n between p\.desde and p\.hasta\s*\)/,
    `${fichero}: el recuento tiene que mirar los días ya prorrogados del estudio`);
});

test('un rango distinto sí prorroga, y solo los días que no se habían sumado', () => {
  assert.match(CUERPO, /from generate_series\(0, v_hasta - v_desde\) as g\(n\)/, 'se cuenta día a día');
  assert.match(CUERPO, /if v_dias >= 1 then[\s\S]*?public\.ampliar_caducidades\(p_studio_id, v_socios, v_dias\)/,
    `${fichero}: se suman los días libres (v_dias), nunca el total del cierre`);
  assert.doesNotMatch(CUERPO, /ampliar_caducidades\([^)]*v_total/);
  assert.match(CUERPO, /values\s*\(p_cierre_id, p_studio_id, v_desde, v_hasta, v_dias,/, 'se apunta lo que se sumó');
});

// ─── Una sola transacción, solo servidor ────────────────────────────────────

test('sumar y apuntar van en la misma función, con el estudio bloqueado antes de contar', () => {
  const bloqueo = CUERPO.indexOf("pg_advisory_xact_lock(hashtext('prorroga_cierre:' || p_studio_id))");
  assert.ok(bloqueo > 0, 'sin bloqueo, dos cierres guardados a la vez contarían los mismos días como libres');
  assert.ok(bloqueo < CUERPO.indexOf('select count(*)::int into v_dias'));
  assert.ok(CUERPO.indexOf('ampliar_caducidades(') < CUERPO.indexOf('insert into public.cierres_prorrogas'),
    'el apunte va en la misma transacción que la suma');
});

test('prorrogar_por_cierre y su tabla son solo de servidor', () => {
  assert.match(CUERPO, /if not public\.es_llamada_servicio\(\) then\s*raise exception 'NO_AUTORIZADO';/);
  assert.doesNotMatch(CUERPO, /auth\.uid/);
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(SQL, new RegExp(String.raw`revoke execute on function public\.prorrogar_por_cierre\(text, text\) from ${rol};`), rol);
  }
  assert.match(SQL, /grant execute on function public\.prorrogar_por_cierre\(text, text\) to service_role;/);
  assert.doesNotMatch(SQL, /grant [^;]*prorrogar_por_cierre[^;]*to [^;]*\b(anon|authenticated)\b/);
  assert.match(SQL, /alter table public\.cierres_prorrogas enable row level security;/);
  assert.match(SQL, /revoke all on table public\.cierres_prorrogas from anon;/);
  assert.match(SQL, /revoke all on table public\.cierres_prorrogas from authenticated;/);
});

// ─── Lo que ve la propietaria ───────────────────────────────────────────────

test('los días que cuenta la ruta son los mismos días naturales que cuenta el SQL, también con cambio de hora', () => {
  assert.match(CUERPO, /v_total := \(v_hasta - v_desde\) \+ 1;/);
  assert.equal(diasDeCierre('2026-12-24', '2026-12-24'), 1);
  assert.equal(diasDeCierre('2027-03-22', '2027-03-28'), 7);
  assert.equal(diasDeCierre('2026-10-19', '2026-10-25'), 7);
});

test('el resumen dice cuándo los bonos ya tenían los días, y calla si no', () => {
  assert.equal(notaDiasYaProrrogados(7, 0), null);
  assert.equal(notaDiasYaProrrogados(7, 7), 'los bonos ya tenían esos días de más');
  assert.equal(notaDiasYaProrrogados(7, 1), '1 día ya se había sumado a los bonos');
  assert.equal(notaDiasYaProrrogados(8, 6), '6 días ya se habían sumado a los bonos');
  // Una respuesta sin el campo (servidor viejo) no inventa nada.
  assert.equal(notaDiasYaProrrogados(7, undefined as unknown as number), null);
});
