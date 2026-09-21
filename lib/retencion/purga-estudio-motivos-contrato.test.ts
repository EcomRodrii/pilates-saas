import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: la purga de un estudio vencido no deja vivo nada de sus
// instructoras fuera de lo que se conserva a propósito.
//
// `purgar_estudio_vencido` anonimiza `instructores` con UPDATE, así que el
// `on delete cascade` de sus tablas hijas no actúa nunca: lo que no borre o
// vacíe la propia función sobrevive. Si uno de estos falla, no se quita: se
// vuelve a meter la tabla o la columna en la purga.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const migraciones = readdirSync(MIGRACIONES)
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .map((n) => ({ nombre: n, sql: sinComentarios(readFileSync(join(MIGRACIONES, n), 'utf8')).toLowerCase() }));

// La definición vigente es la de la ÚLTIMA migración que la crea.
const ultima = migraciones.filter((m) => /create or replace function public\.purgar_estudio_vencido\s*\(/.test(m.sql)).at(-1);
assert.ok(ultima, 'no hay ninguna migración que defina purgar_estudio_vencido');
const cuerpo = ultima.sql.slice(ultima.sql.indexOf('function public.purgar_estudio_vencido'));
const funcion = cuerpo.slice(0, cuerpo.indexOf('\n$$;'));
const cBorrar = funcion.match(/c_borrar constant text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? '';
const tablasBorradas = [...cBorrar.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const cConservar = funcion.match(/c_conservar constant text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? '';
const tablasConservadas = new Set([...cConservar.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
const cVaciar = funcion.match(/c_vaciar constant text\[\]\[\] := array\[([\s\S]*?)\n\s*\];/)?.[1] ?? '';
const columnasVaciadas = new Set([...cVaciar.matchAll(/\[\s*'([a-z_]+)',\s*'([a-z_]+)',/g)].map((m) => `${m[1]}.${m[2]}`));
const tablasVaciadas = new Set([...columnasVaciadas].map((c) => c.split('.')[0]));

// Qué hace la purga con cada tabla que cuelga de `instructores`. Una tabla nueva
// con FK a instructores no pasa CI hasta que alguien decide aquí su destino.
type Destino = 'borrar' | 'vaciar' | 'revocar' | 'fiscal' | 'fuera';
const DESTINO: Record<string, { destino: Destino; motivo: string }> = {
  bajas_instructora: { destino: 'borrar', motivo: 'motivo y categoría de la baja, a veces de salud' },
  instructora_ausencias: { destino: 'borrar', motivo: 'motivo y tipo BAJA_MEDICA' },
  instructora_disponibilidad: { destino: 'borrar', motivo: 'horario de una persona concreta' },
  instructora_disponibilidad_excepciones: { destino: 'borrar', motivo: 'bloqueos de agenda de una persona' },
  citas_disponibilidad: { destino: 'borrar', motivo: 'horario de citas de una persona' },
  instructor_dependency_snapshots: { destino: 'borrar', motivo: 'analítica sobre la instructora' },
  sustitucion_contactos: { destino: 'borrar', motivo: 'a quién se avisó y por qué canal' },
  mensajes_equipo: { destino: 'borrar', motivo: 'mensajería' },
  notas_progreso: { destino: 'borrar', motivo: 'notas de salud de la socia' },
  preferencias_socio: { destino: 'borrar', motivo: 'preferencias personales' },
  valoraciones: { destino: 'borrar', motivo: 'opiniones sobre la instructora' },
  sesiones: { destino: 'vaciar', motivo: 'la clase se conserva; notas e incidencia son texto libre' },
  citas: { destino: 'vaciar', motivo: 'la cita se conserva; la nota es texto libre' },
  sustituciones: { destino: 'vaciar', motivo: 'se conserva quién cubrió; motivo, ranking (copia nombres) y network, no' },
  instructor_enlaces_vigentes: { destino: 'revocar', motivo: 'sin fila el enlace firmado se da por vigente: centinela, nunca delete' },
  liquidaciones_instructoras: { destino: 'fiscal', motivo: 'pagos a la instructora' },
  instructor_tarifas: { destino: 'fiscal', motivo: 'base de las liquidaciones' },
  instructor_work_sessions: { destino: 'fiscal', motivo: 'registro de jornada del personal: hay que conservarlo; sin la ficha (anonimizada) no identifica a nadie' },
  clases_impartidas: { destino: 'fiscal', motivo: 'qué clase se dio y cuándo (base de lo pagado): se conserva, sin quién la tocó' },
  contenido_portal_banners: { destino: 'fuera', motivo: 'contenido del estudio; created_by solo es autoría' },
  novedades_estudio: { destino: 'fuera', motivo: 'contenido del estudio; created_by solo es autoría' },
  videos_on_demand: { destino: 'fuera', motivo: 'el asset vive en Stream y nadie lo borra: la fila no se borra antes que él' },
  red_formalizaciones: { destino: 'fuera', motivo: 'Network, de terceros; ON DELETE SET NULL' },
};

// Tablas con FK a instructores según las migraciones (create table y alter table).
const tablasQueCuelgan = new Map<string, string>();
const columnasDeTexto = new Map<string, Set<string>>();
for (const { nombre, sql } of migraciones) {
  for (const sentencia of sql.split(/;\s*\n/)) {
    const tabla = sentencia.match(/^\s*(?:create table(?: if not exists)?|alter table(?: if exists)?(?: only)?)\s+(?:public\.)?"?([a-z_]+)"?/m)?.[1];
    if (!tabla) continue;
    if (/references\s+(?:public\.)?"?instructores"?\s*\(/.test(sentencia) && !tablasQueCuelgan.has(tabla)) {
      tablasQueCuelgan.set(tabla, nombre);
    }
    for (const [, columna] of sentencia.matchAll(/(?:^|,|add column(?: if not exists)?)\s*"?(motivo|nota_estudio|notas?|incidencia_texto|comentario)"?\s+text\b/gm)) {
      columnasDeTexto.set(tabla, (columnasDeTexto.get(tabla) ?? new Set()).add(columna));
    }
  }
}

test('la purga borra bajas, ausencias y horarios del equipo', () => {
  assert.ok(tablasBorradas.length > 0, `no se encuentra c_borrar en ${ultima.nombre}`);
  for (const [tabla, { destino }] of Object.entries(DESTINO)) {
    if (destino === 'borrar') assert.ok(tablasBorradas.includes(tabla), `${ultima.nombre}: falta ${tabla} en c_borrar`);
  }
  // Las ligadas a una ausencia caen por cascade: si van después, el informe
  // cuenta más filas de las que el modo real dice haber borrado.
  assert.ok(
    tablasBorradas.indexOf('instructora_disponibilidad_excepciones') < tablasBorradas.indexOf('instructora_ausencias'),
    'instructora_disponibilidad_excepciones tiene que ir antes que instructora_ausencias en c_borrar',
  );
});

test('la purga vacía el texto libre de las filas que conserva', () => {
  for (const columna of [
    'sustituciones.motivo', 'sustituciones.ranking', 'sustituciones.candidatos_network',
    'sesiones.notas', 'sesiones.incidencia_texto', 'citas.notas',
    'instructor_work_sessions.created_by', 'instructor_work_sessions.edited_by',
    'work_session_audits.created_by', 'work_session_audits.reason',
    'clases_impartidas.created_by', 'clases_impartidas_auditoria.motivo',
  ]) {
    assert.ok(columnasVaciadas.has(columna), `${ultima.nombre}: falta ${columna} en c_vaciar`);
  }
  const bucle = funcion.slice(funcion.indexOf('foreach v_col slice 1 in array c_vaciar loop'));
  assert.match(bucle, /^foreach v_col slice 1 in array c_vaciar loop\s+if p_ejecutar then\s+execute format\('update public\.%i set %i = %s where studio_id = \$1/,
    `${ultima.nombre}: c_vaciar ya no se aplica en el modo real`);
});

test('los enlaces de la instructora se revocan en todos sus scopes, nunca con delete', () => {
  const checks = migraciones.flatMap(({ sql }) =>
    [...sql.matchAll(/instructor_enlaces_vigentes_scope_check\s+check\s*\(\s*scope\s+in\s*\(([^)]*)\)/g)].map((m) => m[1]));
  const scopesPermitidos = [...(checks.at(-1) ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(scopesPermitidos.length > 0, 'no se encuentra el CHECK de scopes de instructor_enlaces_vigentes');

  const scopesRevocados = new Set([...(funcion.match(/c_scopes_enlace constant text\[\] := array\[([^\]]*)\]/)?.[1] ?? '')
    .matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  for (const scope of scopesPermitidos) {
    assert.ok(scopesRevocados.has(scope), `${ultima.nombre}: la purga no revoca los enlaces con scope '${scope}'`);
  }
  assert.match(funcion, /on conflict \(instructor_id, scope\) do update\s+set token = excluded\.token/);
  assert.ok(!tablasBorradas.includes('instructor_enlaces_vigentes'), 'borrar la fila deja el enlace firmado por vigente');
  assert.doesNotMatch(funcion, /delete from public\.instructor_enlaces_vigentes/);
});

test('toda tabla que cuelga de instructores tiene un destino decidido en la purga', () => {
  assert.ok(tablasQueCuelgan.size > 0, 'no se encuentra ninguna FK a instructores en las migraciones');
  const sinDecidir = [...tablasQueCuelgan].filter(([t]) => !DESTINO[t]).map(([t, n]) => `${t} (${n})`);
  assert.deepEqual(sinDecidir, [], 'tablas con FK a instructores sin destino en DESTINO: decide borrar, vaciar o conservar');
  const obsoletas = Object.keys(DESTINO).filter((t) => !tablasQueCuelgan.has(t));
  assert.deepEqual(obsoletas, [], 'DESTINO nombra tablas que ya no cuelgan de instructores');

  for (const [tabla, { destino }] of Object.entries(DESTINO)) {
    if (destino === 'vaciar') assert.ok(tablasVaciadas.has(tabla), `${tabla}: destino vaciar y no está en c_vaciar`);
    if (destino === 'fiscal') assert.ok(tablasConservadas.has(tabla), `${tabla}: destino fiscal y no está en c_conservar`);
  }
});

test('ninguna tabla que se conserva guarda un motivo o nota libre sin vaciar', () => {
  const quedan: string[] = [];
  for (const [tabla, { destino }] of Object.entries(DESTINO)) {
    if (destino === 'borrar') continue;
    for (const columna of columnasDeTexto.get(tabla) ?? []) {
      if (!columnasVaciadas.has(`${tabla}.${columna}`)) quedan.push(`${tabla}.${columna}`);
    }
  }
  assert.deepEqual(quedan, [], 'texto libre sobre la instructora o la clase que sobrevive a la purga');
});
