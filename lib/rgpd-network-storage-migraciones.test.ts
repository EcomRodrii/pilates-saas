import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Contrato de las migraciones de la fase 2 RGPD (Network + Storage).
//
// No prueba que Postgres haga lo que dice el SQL — eso lo mide
// scripts/verify-rgpd-network-storage.sql en una rama/staging. Prueba lo que se
// puede romper sin red: que una migración POSTERIOR no deshaga la cerradura, y
// que cada función nueva lleve los tres pasos de grants que este proyecto
// necesita (pg_default_acl da EXECUTE directo a anon/authenticated).
// ─────────────────────────────────────────────────────────────────────────────

const DIR = 'supabase/migrations';
const ficheros = () => readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const leer = (f: string) => readFileSync(`${DIR}/${f}`, 'utf8').replace(/--.*$/gm, '');
const fichero = (sufijo: string) => {
  const f = ficheros().find(n => n.endsWith(sufijo));
  assert.ok(f, `falta la migración *${sufijo}`);
  return leer(f!);
};

/** Último fichero que contiene el patrón (el que manda). */
function ultimoQue(re: RegExp): string {
  const queLoTienen = ficheros().filter(f => re.test(leer(f)));
  assert.ok(queLoTienen.length > 0, `ninguna migración casa con ${re}`);
  return queLoTienen[queLoTienen.length - 1];
}

function grantsCorrectos(sql: string, firma: string) {
  const f = firma.replace(/[()]/g, m => `\\${m}`);
  assert.match(sql, new RegExp(`revoke execute on function public\\.${f} from public;`), `${firma}: falta REVOKE PUBLIC`);
  assert.match(sql, new RegExp(`revoke execute on function public\\.${f} from anon;`), `${firma}: falta REVOKE anon (pg_default_acl)`);
}

test('H3: avatars deja de admitir SVG y ninguna migración posterior lo vuelve a añadir', () => {
  const sql = fichero('_avatars_sin_svg.sql');
  assert.match(sql, /array_remove\(allowed_mime_types, 'image\/svg\+xml'\)/);
  assert.match(sql, /where id = 'avatars'/);
  const ultimaQueTocaMimes = ultimoQue(/allowed_mime_types[\s\S]*'avatars'|'avatars'[\s\S]*allowed_mime_types/);
  assert.ok(ultimaQueTocaMimes.endsWith('_avatars_sin_svg.sql'), `la última que toca los MIME de avatars es ${ultimaQueTocaMimes}`);
});

test('A25: INSERT/UPDATE/DELETE de avatars usan la función de escritura; SELECT sigue con la de lectura', () => {
  for (const verbo of ['insert', 'update', 'delete']) {
    const f = ultimoQue(new RegExp(`create policy avatars_${verbo}_autorizado`));
    const sql = leer(f);
    const politica = sql.slice(sql.indexOf(`create policy avatars_${verbo}_autorizado`));
    const hasta = politica.indexOf(';');
    assert.match(politica.slice(0, hasta), /avatars_path_escribible\(name\)/, `${verbo} (${f})`);
    assert.doesNotMatch(politica.slice(0, hasta), /avatars_path_autorizado/, `${verbo} no debe seguir con la función de lectura`);
  }
  const fSelect = ultimoQue(/create policy avatars_select_autorizado/);
  const sqlSelect = leer(fSelect);
  const pol = sqlSelect.slice(sqlSelect.indexOf('create policy avatars_select_autorizado'));
  assert.match(pol.slice(0, pol.indexOf(';')), /avatars_path_autorizado\(name\)/);
});

test('A25: avatars_path_escribible es DEFINER con search_path vacío y grants en tres pasos', () => {
  const sql = leer(ultimoQue(/function public\.avatars_path_escribible\(/));
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  grantsCorrectos(sql, 'avatars_path_escribible(text)');
  assert.match(sql, /grant execute on function public\.avatars_path_escribible\(text\) to authenticated;/);
});

test('H8: subir a red-documentos-identidad exige perfil propio, mediante helper DEFINER con grants correctos', () => {
  const f = ultimoQue(/create policy red_documentos_identidad_insert_propio/);
  const sql = leer(f);
  const pol = sql.slice(sql.indexOf('create policy red_documentos_identidad_insert_propio'));
  const cuerpo = pol.slice(0, pol.indexOf(';'));
  assert.match(cuerpo, /public\.red_tiene_perfil_propio\(\)/);
  assert.match(cuerpo, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  // Un exists directo sobre red_perfiles fallaría: authenticated no tiene grant de tabla.
  assert.doesNotMatch(cuerpo, /from public\.red_perfiles/);
  const helper = leer(ultimoQue(/function public\.red_tiene_perfil_propio\(/));
  assert.match(helper, /security definer/);
  grantsCorrectos(helper, 'red_tiene_perfil_propio()');
});

test('A11: el documento deja de ser obligatorio solo una vez resuelto', () => {
  const sql = fichero('_red_documentos_minimizacion.sql');
  for (const tabla of ['red_verificaciones_identidad', 'red_certificaciones']) {
    assert.match(sql, new RegExp(`alter table public\\.${tabla}\\s+alter column documento_path drop not null`));
    assert.match(sql, new RegExp(`alter table public\\.${tabla}\\s+add column if not exists documento_borrado_en timestamptz`));
    assert.match(sql, new RegExp(`${tabla}_documento_si_viva\\s+check \\(estado not in \\('pendiente', 'en_revision'\\) or documento_path is not null\\)`));
  }
});

test('A11: aprobar la verificación de experiencia propia se rechaza en la RPC, y sigue siendo solo service_role', () => {
  const f = ultimoQue(/function public\.red_resolver_verificacion_experiencia\(/);
  assert.ok(f.endsWith('_red_verificacion_experiencia_sin_autoverificacion.sql'), `la definición vigente es ${f}`);
  const sql = leer(f);
  assert.match(sql, /if p_aprobar then[\s\S]*raise exception 'AUTOVERIFICACION'[\s\S]*end if;/);
  assert.match(sql, /v_perfil_auth = v_owner or v_perfil_auth = p_resuelto_por/);
  const firma = 'red_resolver_verificacion_experiencia(text, text, boolean, uuid)';
  grantsCorrectos(sql, firma);
  assert.match(sql, /revoke execute on function public\.red_resolver_verificacion_experiencia\(text, text, boolean, uuid\) from authenticated;/);
  assert.match(sql, /grant execute on function public\.red_resolver_verificacion_experiencia\(text, text, boolean, uuid\) to service_role;/);
});
