import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CODIGOS_RPC, ERROR_GENERICO, NOMBRE_PERSONA_ELIMINADA, avisoNombreSinReconocer, interpretarErrorEliminarPersona,
  nombreSePuedeReconocerEnTextos,
} from './eliminar-persona-reglas.ts';

// ───────────────────────────────────────────────────────────
// Contrato de `anonimizar_instructor` (supresión de una persona del equipo, art. 17).
//
// La función anonimiza `instructores` con UPDATE, así que el `on delete cascade` de sus
// tablas hijas no actúa nunca: lo que no borre o vacíe ella misma, sobrevive. Este test es lo
// que obliga a decidir el destino de cada tabla nueva que cuelgue de una persona — el mismo
// criterio que `lib/retencion/purga-estudio-motivos-contrato.test.ts` aplica a un estudio
// entero, con las diferencias de un estudio VIVO (ver DESTINO_PERSONA).
// ───────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const todas = readdirSync(MIGRACIONES).filter(n => n.endsWith('.sql')).sort();

// Se busca por lo que definen y no por el nombre del fichero: al aplicarlas se renombran a la versión que quedó en la base de datos,
// y la función se REEMPLAZA en una migración posterior (la vigente es la última que la define).
const leer = (n: string) => sinComentarios(readFileSync(join(MIGRACIONES, n), 'utf8'));
const definenLaFuncion = todas.filter(n => leer(n).includes('create or replace function public.anonimizar_instructor('));
assert.ok(definenLaFuncion.length >= 1, 'no se encuentra ninguna migración que defina anonimizar_instructor');
const nombreMigracion = definenLaFuncion.at(-1)!;
const sql = leer(nombreMigracion);
const inicioFuncion = sql.indexOf('create or replace function public.anonimizar_instructor(');
const aperturaCuerpo = sql.indexOf('$function$', inicioFuncion);
const cierreCuerpo = sql.indexOf('$function$', aperturaCuerpo + 10);
// Solo el cuerpo de la función (no el trigger ni nada que venga después en el fichero).
const funcion = sql.slice(inicioFuncion, cierreCuerpo + '$function$'.length);
const migracionTabla = todas.find(n => leer(n).includes('create table if not exists public.supresiones_equipo'));
assert.ok(migracionTabla, 'no se encuentra la migración que crea supresiones_equipo');
const sqlTabla = leer(migracionTabla);

const matrizDe = (nombre: string) =>
  funcion.match(new RegExp(`${nombre} constant text\\[\\]\\[?\\]? := array\\[([\\s\\S]*?)\\n  \\];`))?.[1] ?? '';
const cBorrar = [...matrizDe('c_borrar').matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
const cNombres = [...matrizDe('c_nombres_por_cuenta').matchAll(/\[\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)'\s*\]/g)]
  .map(m => ({ tabla: m[1], cuenta: m[2], nombre: m[3] }));
const cCentinela = [...matrizDe('c_cuenta_a_centinela').matchAll(/\[\s*'([a-z_]+)',\s*'([a-z_]+)',/g)].map(m => ({ tabla: m[1], columna: m[2] }));
const cPorCuenta = [...matrizDe('c_borrar_por_cuenta').matchAll(/\[\s*'([a-z_]+)',\s*'([a-z_]+)'\s*\]/g)].map(m => ({ tabla: m[1], columna: m[2] }));
// Lo de su lado de CLIENTA (si la misma cuenta es también socia del estudio) no se toca: solo se borra si no lo es.
const cPorCuentaNoSocia = [...matrizDe('c_borrar_por_cuenta_si_no_es_socia').matchAll(/\[\s*'([a-z_]+)',\s*'([a-z_]+)'\s*\]/g)].map(m => ({ tabla: m[1], columna: m[2] }));

const dbTypes = readFileSync(join(RAIZ, 'lib/db-types.ts'), 'utf8');
const aSnake = (pascal: string) => pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const columnasDe = new Map<string, Set<string>>();
for (const m of dbTypes.matchAll(/^export interface Row(\w+) \{\n([\s\S]*?)\n\}/gm)) {
  columnasDe.set(aSnake(m[1]), new Set([...m[2].matchAll(/^ {2}(\w+)\??:/gm)].map(c => c[1])));
}

type Destino = 'borrar' | 'vaciar' | 'anular' | 'revocar' | 'fiscal' | 'conservar' | 'fuera';
// Qué hace la función con cada tabla que cuelga de `instructores`. Una tabla nueva con FK a
// `instructores` no pasa CI hasta que alguien decide aquí su destino.
const DESTINO_PERSONA: Record<string, { destino: Destino; motivo: string }> = {
  bajas_instructora: { destino: 'borrar', motivo: 'motivo y categoría de la baja, a veces de salud' },
  instructora_ausencias: { destino: 'borrar', motivo: 'motivo y tipo BAJA_MEDICA' },
  instructora_disponibilidad: { destino: 'borrar', motivo: 'horario de una persona concreta' },
  instructora_disponibilidad_excepciones: { destino: 'borrar', motivo: 'bloqueos de agenda de una persona' },
  citas_disponibilidad: { destino: 'borrar', motivo: 'horario de citas de una persona' },
  instructor_dependency_snapshots: { destino: 'borrar', motivo: 'analítica sobre la persona' },
  sustitucion_contactos: { destino: 'borrar', motivo: 'a quién se avisó y por qué canal' },
  valoraciones: { destino: 'borrar', motivo: 'opiniones sobre la persona' },
  mensajes_equipo: { destino: 'borrar', motivo: 'sus mensajes: se borran por autor (a diferencia de un estudio entero, no son de otra persona)' },
  sesiones: { destino: 'vaciar', motivo: 'la clase se conserva; notas e incidencia son texto libre' },
  citas: { destino: 'vaciar', motivo: 'la cita se conserva; la nota es texto libre' },
  sustituciones: { destino: 'vaciar', motivo: 'se conserva quién cubrió; motivo, ranking (copia nombres) y network, no' },
  preferencias_socio: { destino: 'anular', motivo: 'la preferencia de la SOCIA se queda; solo deja de señalar a esta persona' },
  instructor_enlaces_vigentes: { destino: 'revocar', motivo: 'sin fila el enlace firmado se da por vigente: centinela, nunca delete' },
  liquidaciones_instructoras: { destino: 'fiscal', motivo: 'pagos a la persona' },
  instructor_tarifas: { destino: 'fiscal', motivo: 'base de las liquidaciones' },
  instructor_work_sessions: { destino: 'fiscal', motivo: 'registro de jornada: hay que conservarlo; sin la ficha (anonimizada) no identifica a nadie' },
  clases_impartidas: { destino: 'fiscal', motivo: 'qué clase se dio y cuándo (base de lo pagado)' },
  notas_progreso: { destino: 'conservar', motivo: 'es la ficha clínica de la SOCIA, no de quien la escribió: a diferencia de un estudio entero, aquí se queda' },
  contenido_portal_banners: { destino: 'fuera', motivo: 'contenido del estudio; created_by solo es autoría' },
  novedades_estudio: { destino: 'fuera', motivo: 'contenido del estudio; created_by solo es autoría' },
  videos_on_demand: { destino: 'fuera', motivo: 'el asset vive en Stream y nadie lo borra: la fila no se borra antes que él' },
  red_formalizaciones: { destino: 'fuera', motivo: 'Network, de terceros; ON DELETE SET NULL' },
  plataforma_instructoras: { destino: 'conservar', motivo: 'solo ids; el cron de USC la necesita para reescribir allí su nombre anonimizado (renombrarTrainers)' },
};

// Tablas con FK a instructores según las migraciones (create table y alter table).
const tablasQueCuelgan = new Map<string, string>();
for (const nombre of todas) {
  const texto = sinComentarios(readFileSync(join(MIGRACIONES, nombre), 'utf8')).toLowerCase();
  for (const sentencia of texto.split(/;\s*\n/)) {
    const tabla = sentencia.match(/^\s*(?:create table(?: if not exists)?|alter table(?: if exists)?(?: only)?)\s+(?:public\.)?"?([a-z_]+)"?/m)?.[1];
    if (tabla && /references\s+(?:public\.)?"?instructores"?\s*\(/.test(sentencia) && !tablasQueCuelgan.has(tabla)) {
      tablasQueCuelgan.set(tabla, nombre);
    }
  }
}

test('el parser ve la función y sus listas (no verde por vacío)', () => {
  assert.ok(funcion.length > 2000, 'no se encuentra el cuerpo de anonimizar_instructor');
  assert.ok(cBorrar.length >= 8, `solo ${cBorrar.length} tablas en c_borrar`);
  assert.ok(cNombres.length >= 6 && cCentinela.length >= 5 && cPorCuenta.length >= 4 && cPorCuentaNoSocia.length >= 2);
  assert.ok(columnasDe.size > 100, 'el parser de db-types no ve las tablas');
});

test('toda tabla que cuelga de instructores tiene un destino decidido para una persona', () => {
  assert.ok(tablasQueCuelgan.size > 0, 'no se encuentra ninguna FK a instructores en las migraciones');
  const sinDecidir = [...tablasQueCuelgan].filter(([t]) => !DESTINO_PERSONA[t]).map(([t, n]) => `${t} (${n})`);
  assert.deepEqual(sinDecidir, [], 'tablas con FK a instructores sin destino en DESTINO_PERSONA: decide borrar, vaciar, anular o conservar');
  const obsoletas = Object.keys(DESTINO_PERSONA).filter(t => !tablasQueCuelgan.has(t));
  assert.deepEqual(obsoletas, [], 'DESTINO_PERSONA nombra tablas que ya no cuelgan de instructores');
});

test('cada destino se cumple en el cuerpo de la función', () => {
  for (const [tabla, { destino }] of Object.entries(DESTINO_PERSONA)) {
    const borra = new RegExp(`delete from public\\.${tabla}\\b`).test(funcion) || cBorrar.includes(tabla);
    const actualiza = new RegExp(`update public\\.${tabla}\\b`).test(funcion);
    if (destino === 'borrar') assert.ok(borra, `${tabla}: destino borrar y la función no la borra`);
    if (destino === 'vaciar' || destino === 'anular') assert.ok(actualiza, `${tabla}: destino ${destino} y la función no la actualiza`);
    if (destino === 'fiscal' || destino === 'conservar') {
      assert.ok(!borra, `${tabla}: se CONSERVA y la función la borra`);
    }
  }
  // Y las que se conservan de verdad se conservan: la ficha se anonimiza, nunca se borra.
  assert.doesNotMatch(funcion, /delete from public\.instructores\b/);
  assert.match(funcion, /update public\.instructores\s+set nombre = c_nombre, email = null, telefono = null, auth_user_id = null,\s+foto_url = null, avatar = null, bio = null, activo = false/);
});

test('el motivo libre de las filas que se conservan se vacía, y la autoría pasa a centinela donde la columna es NOT NULL', () => {
  for (const vaciado of [
    'update public.sustituciones set motivo = null', 'update public.sesiones set notas = null, incidencia_texto = null',
    'update public.citas set notas = null', 'update public.work_session_audits set reason = null',
    'update public.clases_impartidas_auditoria set motivo = null',
  ]) {
    assert.ok(funcion.includes(vaciado), `falta: ${vaciado}`);
  }
  const centinelas = new Set(cCentinela.map(c => `${c.tabla}.${c.columna}`));
  for (const c of [
    'instructor_work_sessions.created_by', 'instructor_work_sessions.edited_by', 'work_session_audits.created_by',
    'clases_impartidas.created_by', 'clases_impartidas.edited_by', 'clases_impartidas.revisada_por', 'clases_impartidas_auditoria.created_by',
  ]) assert.ok(centinelas.has(c), `falta ${c} en c_cuenta_a_centinela`);
  // El mismo centinela que la purga de un estudio.
  assert.match(funcion, /'00000000-0000-0000-0000-000000000000'/);
});

test('su nombre en los registros que se conservan se sustituye (caja, stock, ventas, comunicaciones, lecturas de fichas de salud)', () => {
  const con = new Set(cNombres.map(c => `${c.tabla}.${c.nombre}`));
  for (const c of [
    'cajas.abierta_por_nombre', 'cajas.cerrada_por_nombre', 'movimientos_caja.creado_por_nombre', 'movimientos_stock.creado_por_nombre',
    'ventas_pos.vendido_por_nombre', 'comunicaciones_socio.creado_por_nombre', 'lecturas_ficha_salud.leido_por_nombre',
  ]) assert.ok(con.has(c), `falta ${c}`);
  // El feed se trata aparte (nombre en la columna Y en el texto: ver el test de abajo).
  for (const t of ['posts_comunidad', 'comentarios_comunidad']) {
    assert.match(funcion, new RegExp(`update public\\.${t} set autor_nombre = c_nombre`), `falta ${t}`);
  }
});

test('todas las tablas y columnas que toca la función existen en db-types (una errata reventaría en producción)', () => {
  const faltan: string[] = [];
  const existe = (t: string, c?: string) => {
    const cols = columnasDe.get(t);
    if (!cols) { faltan.push(`tabla ${t}`); return; }
    if (c && !cols.has(c)) faltan.push(`${t}.${c}`);
  };
  for (const t of cBorrar) { existe(t, 'studio_id'); existe(t, 'instructor_id'); }
  for (const c of cNombres) { existe(c.tabla, 'studio_id'); existe(c.tabla, c.cuenta); existe(c.tabla, c.nombre); }
  for (const c of cCentinela) { existe(c.tabla, 'studio_id'); existe(c.tabla, c.columna); }
  for (const c of [...cPorCuenta, ...cPorCuentaNoSocia]) { existe(c.tabla, 'studio_id'); existe(c.tabla, c.columna); }
  // Y las que se tocan a pelo, sin lista.
  for (const [t, cols] of Object.entries({
    recomendaciones: ['studio_id', 'titulo', 'motivo', 'datos_usados'], decision_mensajes_dia: ['studio_id', 'recomendacion_id', 'motivo_motor'],
    decision_snapshots: ['studio_id'], post_likes: ['studio_id', 'user_id'], notification: ['studio_id', 'recipient_user_id', 'recipient_role', 'recipient_instructor_id', 'resource_id', 'data', 'title', 'body'],
    conversacion_participantes: ['auth_user_id', 'rol_en_conversacion', 'conversacion_id'], conversaciones: ['id', 'studio_id'],
    actividad_reciente: ['studio_id', 'texto', 'actor_nombre'], posts_comunidad: ['autor_id', 'autor_nombre', 'autor_inicial'],
    comentarios_comunidad: ['autor_id', 'autor_nombre', 'autor_inicial'], sustituciones: ['ranking', 'motivo', 'candidatos_network', 'instructor_original_id', 'sustituta_final_id'],
    instructor_work_sessions: ['status', 'instructor_id'], socios: ['auth_user_id', 'borrado_en'], liquidaciones_instructoras: ['estado', 'instructor_id'],
  })) for (const c of cols) existe(t, c);
  assert.deepEqual(faltan, []);
});

test('las listas por cuenta borran lo personal de ESA cuenta en ESTE estudio (nunca sin studio_id)', () => {
  // Todas las sentencias dinámicas acotan por estudio.
  for (const m of funcion.matchAll(/execute format\('([^']*)'/g)) {
    assert.match(m[1], /studio_id = \$1/, `sentencia dinámica sin acotar por estudio: ${m[1]}`);
  }
  for (const t of ['oauth_tokens', 'sesion_activa']) assert.ok(cPorCuenta.some(c => c.tabla === t), `falta ${t} en c_borrar_por_cuenta`);
  for (const t of ['notification_preference', 'push_subscription']) {
    assert.ok(cPorCuentaNoSocia.some(c => c.tabla === t), `falta ${t} en c_borrar_por_cuenta_si_no_es_socia`);
    assert.ok(!cPorCuenta.some(c => c.tabla === t), `${t} se borra también cuando es socia: perdería datos de su lado de clienta`);
  }
  // Si la misma cuenta es socia del estudio, lo suyo de socia se queda: el bucle solo corre si no lo es, los avisos de
  // rol SOCIA no se tocan, y de las conversaciones solo se va su lado de equipo.
  assert.match(funcion, /if not v_es_socia then\s+foreach v_col slice 1 in array c_borrar_por_cuenta_si_no_es_socia loop/);
  assert.match(funcion, /recipient_user_id = v_uid\s+and \(not v_es_socia or recipient_role <> 'SOCIA'\)/);
  assert.match(funcion, /delete from public\.conversacion_participantes cp\s+where cp\.auth_user_id = v_uid and cp\.rol_en_conversacion = 'STAFF'/);
  assert.match(funcion, /delete from public\.post_likes where studio_id = p_studio_id and user_id = v_uid;/);
});

test('las excepciones de disponibilidad se borran ANTES que las ausencias (caen por cascade)', () => {
  assert.ok(cBorrar.indexOf('instructora_disponibilidad_excepciones') < cBorrar.indexOf('instructora_ausencias'));
});

test('los enlaces firmados se revocan en todos sus scopes, nunca con delete', () => {
  const checks = todas.flatMap(n =>
    [...sinComentarios(readFileSync(join(MIGRACIONES, n), 'utf8')).matchAll(/instructor_enlaces_vigentes_scope_check\s+check\s*\(\s*scope\s+in\s*\(([^)]*)\)/g)].map(m => m[1]));
  const permitidos = [...(checks.at(-1) ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(permitidos.length > 0, 'no se encuentra el CHECK de scopes');
  const revocados = new Set([...(funcion.match(/c_scopes_enlace constant text\[\] := array\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
  for (const scope of permitidos) assert.ok(revocados.has(scope), `no se revocan los enlaces con scope '${scope}'`);
  assert.match(funcion, /on conflict \(instructor_id, scope\) do update\s+set token = excluded\.token/);
  assert.doesNotMatch(funcion, /delete from public\.instructor_enlaces_vigentes/);
});

test('las guardas, sus códigos y el nombre con el que queda la ficha coinciden con el código TypeScript', () => {
  const lanzados = [...funcion.matchAll(/raise exception '([A-Z_]+)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(lanzados)].sort(), Object.keys(CODIGOS_RPC).sort(), 'los códigos de la función y los que la ruta traduce difieren');
  for (const codigo of lanzados) assert.notEqual(interpretarErrorEliminarPersona(codigo).error, ERROR_GENERICO, codigo);
  assert.match(funcion, new RegExp(`c_nombre constant text := '${NOMBRE_PERSONA_ELIMINADA}'`));
  // Solo el servidor, DENTRO de la función (la ruta usa service-role) y en los grants.
  assert.match(funcion, /if not public\.es_llamada_servicio\(\) then/);
  assert.match(sql, /revoke all on function public\.anonimizar_instructor\(text, text, uuid\) from public;/);
  assert.match(sql, /revoke all on function public\.anonimizar_instructor\(text, text, uuid\) from anon;/);
  assert.match(sql, /revoke all on function public\.anonimizar_instructor\(text, text, uuid\) from authenticated;/);
  assert.match(sql, /grant execute on function public\.anonimizar_instructor\(text, text, uuid\) to service_role;/);
  assert.match(funcion, /security definer\s+set search_path = public, pg_temp/);
});

test('la tabla de constancia solo la toca el servidor', () => {
  assert.match(sqlTabla, /alter table public\.supresiones_equipo enable row level security;/);
  assert.match(sqlTabla, /revoke all on table public\.supresiones_equipo from public, anon, authenticated;/);
  assert.match(sqlTabla, /grant all on table public\.supresiones_equipo to service_role;/);
  for (const n of todas) assert.doesNotMatch(leer(n), /create policy[^;]*supresiones_equipo/, `${n}: una política abriría la tabla de constancia`);
});

test('el nombre de la persona copiado como texto: el feed (también dentro del texto), los avisos ajenos y las recomendaciones', () => {
  // El nombre está en `actor_nombre` Y dentro de `texto` («X eliminó a Y del equipo»): sustituir solo la columna dejaba el nombre a la vista.
  assert.match(funcion, /set texto = regexp_replace\(texto, v_patron, c_nombre, 'gi'\),\s+actor_nombre = case when actor_nombre = v_nombre then c_nombre else actor_nombre end/);
  assert.match(funcion, /regexp_replace\(texto, v_patron_email, '\[email eliminado\]', 'gi'\)/);
  // Por nombre SOLO si es seguro: dos palabras o más, nadie más del estudio (equipo O socias) que lo lleve o lo contenga,
  // y con límites de palabra de lookaround (`\M` no casaría con un nombre que acaba en signo, «Ana M.»).
  assert.match(funcion, /length\(btrim\(v_nombre\)\) >= 3 and coalesce\(array_length\(regexp_split_to_array\(btrim\(v_nombre\), '\\s\+'\), 1\), 0\) >= 2/);
  assert.match(funcion, /v_patron := '\(\?<!\[\[:alnum:\]_\]\)' \|\| regexp_replace\(btrim\(v_nombre\)[^;]*\|\| '\(\?!\[\[:alnum:\]_\]\)';/);
  assert.match(funcion, /from public\.instructores i\s+where i\.studio_id = p_studio_id and i\.id <> p_instructor_id and i\.nombre ~\* v_patron/);
  assert.match(funcion, /from public\.socios so\s+where so\.studio_id = p_studio_id and so\.borrado_en is null\s+and \(so\.nombre \|\| ' ' \|\| coalesce\(so\.apellidos, ''\)\) ~\* v_patron/);
  assert.match(funcion, /v_por_nombre := not v_ambiguo;/);
  assert.doesNotMatch(funcion, /'\\m'|'\\M'/, '`\\m`/`\\M` dejaría sin casar un nombre que acaba en signo');
  // El email, con límites: `ana@…` no casa dentro de `mariana@…`.
  assert.match(funcion, /v_patron_email := '\(\?<!\[\[:alnum:\]\._%\+-\]\)' \|\| regexp_replace\(v_email[^;]*\|\| '\(\?!\[\[:alnum:\]_%\+-\]\)';/);
  // Avisos de otras personas y recomendaciones; la caché del motor se vacía; el motivo del mensaje del día, antes de borrar la recomendación.
  assert.match(funcion, /position\('"' \|\| p_instructor_id \|\| '"' in data::text\) > 0/);
  assert.ok(funcion.indexOf('update public.decision_mensajes_dia dm set motivo_motor = null') < funcion.indexOf('delete from public.recomendaciones r'));
  assert.match(funcion, /delete from public\.decision_snapshots where studio_id = p_studio_id;/);
  // La comunidad guarda el uid de la cuenta O el id de la ficha como autor; y el ranking no pierde elementos (candidata_actual es un índice).
  assert.match(funcion, /autor_id = p_instructor_id or \(v_uid is not null and not v_es_socia and autor_id = v_uid::text\)/);
  assert.match(funcion, /then t\.e \|\| jsonb_build_object\('nombre', c_nombre\) else t\.e end/);
  assert.doesNotMatch(funcion, /not like '%"'/, 'quitar elementos del ranking mueve la oferta a otra candidata');
  assert.doesNotMatch(funcion, /\blike '%"'/, 'like con el id: sus comodines sobre-casan; se usa position()');
});

test('las guardas de no dejar nada a medias: liquidaciones sin pagar (borrador o confirmada) y jornadas abiertas', () => {
  assert.match(funcion, /l\.estado in \('BORRADOR', 'CONFIRMADA'\)/);
  assert.match(funcion, /w\.status in \('OPEN', 'PENDING_REVIEW'\)/);
});

// Toda columna `*_nombre` de texto es un sitio donde el nombre de alguien pudo copiarse: se decide aquí qué pasa con cada una.
const COLUMNAS_NOMBRE_DECIDIDAS: Record<string, string> = {
  'actividad_reciente.actor_nombre': 'tratada: se sustituye (y el texto)',
  'cajas.abierta_por_nombre': 'tratada por la cuenta', 'cajas.cerrada_por_nombre': 'tratada por la cuenta',
  'comentarios_comunidad.autor_nombre': 'tratada por id o cuenta', 'posts_comunidad.autor_nombre': 'tratada por id o cuenta',
  'comunicaciones_socio.creado_por_nombre': 'tratada por la cuenta', 'lecturas_ficha_salud.leido_por_nombre': 'tratada por la cuenta',
  'movimientos_caja.creado_por_nombre': 'tratada por la cuenta', 'movimientos_stock.creado_por_nombre': 'tratada por la cuenta',
  'ventas_pos.vendido_por_nombre': 'tratada por la cuenta',
  'instructor_bajas_seguimiento.instructor_nombre': 'la fila se borra (c_borrar)', 'mensajes_equipo.autor_nombre': 'la fila se borra (sus mensajes)',
  'automation_logs.socio_nombre': 'fuera: el nombre de una SOCIA, no de una persona del equipo',
  'facturas.receptor_nombre': 'fuera: el receptor de una factura (cliente), fiscal',
  'plataforma_auditoria.actor_nombre': 'fuera: equipo de Tentare, no del estudio',
  'sales_leads.estudio_nombre': 'fuera: prospección de Tentare',
  'altas_estudio.estudio_nombre': 'fuera: el nombre del ESTUDIO que se escribió en el alta, no de una persona; la fila cae con su cuenta (on delete cascade)', 'studios.creditos_nombre': 'fuera: ajuste del estudio',
  'verifactu_declaraciones_responsables.productor_nombre': 'fuera: el productor del SIF (Tentare), no del estudio; declaración de solo añadir',
  'verifactu_representaciones.apoderado_nombre': 'fuera: el apoderado de Tentare ante la AEAT, no del estudio',
  'verifactu_representaciones.otorgante_nombre': 'fuera: quien otorgó el poder IZ860 en la AEAT; evidencia de representación que se conserva por obligación legal',
};

test('toda columna *_nombre de texto tiene decidido qué pasa con ella (una nueva no pasa CI hasta decidirlo)', () => {
  const encontradas: string[] = [];
  for (const [tabla, cols] of columnasDe) {
    for (const c of cols) if (/_nombre$/.test(c) && c !== 'nombre') encontradas.push(`${tabla}.${c}`);
  }
  assert.ok(encontradas.length >= 10, 'el parser no ve las columnas *_nombre');
  const sinDecidir = encontradas.filter(c => !(c in COLUMNAS_NOMBRE_DECIDIDAS));
  assert.deepEqual(sinDecidir, [], 'columnas *_nombre sin decidir en COLUMNAS_NOMBRE_DECIDIDAS: ¿copian el nombre de alguien del equipo? Trátalas en anonimizar_instructor o justifica que van fuera');
  // Y las «tratadas» lo están de verdad en la función.
  const tratadas = Object.entries(COLUMNAS_NOMBRE_DECIDIDAS).filter(([, d]) => d.startsWith('tratada')).map(([c]) => c);
  const enLista = new Set(cNombres.map(c => `${c.tabla}.${c.nombre}`));
  for (const c of tratadas) {
    const [tabla, columna] = c.split('.');
    const enLaFuncion = enLista.has(c) || new RegExp(`update public\\.${tabla}\\b[^;]*\\b${columna} = `).test(funcion);
    assert.ok(enLaFuncion, `${c}: decidida como «tratada» y la función no la toca`);
  }
});

test('los motivos por los que no se busca el nombre coinciden con los que la ruta sabe contar, y la regla de la pantalla con la de la función', () => {
  const motivos = [...funcion.matchAll(/v_motivo_nombre := '([A-Z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(motivos, ['AMBIGUO', 'UNA_PALABRA']);
  for (const m of motivos) assert.notEqual(avisoNombreSinReconocer(m), null, `${m}: la propietaria no recibe ninguna frase`);
  assert.match(funcion, /'nombre_sin_reconocer', v_motivo_nombre is not null,\s+'motivo_nombre_sin_reconocer', v_motivo_nombre,/);
  const ruta = readFileSync(join(RAIZ, 'app/api/equipo/eliminar/route.ts'), 'utf8');
  assert.match(ruta, /motivo_nombre_sin_reconocer/, 'la ruta no lee el motivo que devuelve la función');
  // «Tres letras y dos palabras»: la pantalla lo avisa antes con la misma regla.
  assert.equal(nombreSePuedeReconocerEnTextos('Laura'), false);
  assert.equal(nombreSePuedeReconocerEnTextos('Laura Gómez'), true);
});

test('repetir la llamada sobre una ficha vieja no toca lo de una cuenta que hoy es de OTRA ficha del estudio', () => {
  const guarda = funcion.indexOf('i.auth_user_id = v_uid and i.id <> p_instructor_id');
  assert.ok(guarda > 0, 'falta la guarda de la cuenta que ya es de otra ficha');
  assert.match(funcion.slice(guarda, guarda + 200), /v_uid := null;/);
  // Antes de todo lo que se hace POR la cuenta (y del cálculo de si es socia).
  assert.ok(guarda < funcion.indexOf('v_es_socia := '), 'la guarda va después de usar la cuenta');
  assert.ok(guarda < funcion.indexOf('if v_uid is not null then\n    foreach'), 'la guarda va después de tocar lo de la cuenta');
});

test('una persona eliminada no se reactiva ni se enlaza a una cuenta: trigger SECURITY DEFINER (el usuario no lee supresiones_equipo) y cerrado a los clientes', () => {
  const nombre = todas.find(n => leer(n).includes('create or replace function public.instructores_no_reactivar_eliminada('));
  assert.ok(nombre, 'no se encuentra la migración del trigger');
  const t = leer(nombre);
  assert.match(t, /security definer\s+set search_path = public, pg_temp/);
  assert.match(t, /new\.activo is true and old\.activo is not true/);
  assert.match(t, /new\.auth_user_id is not null and old\.auth_user_id is null/);
  assert.match(t, /from public\.supresiones_equipo se\s+where se\.studio_id = new\.studio_id and se\.instructor_id = new\.id/);
  assert.match(t, /before update of activo, auth_user_id on public\.instructores/);
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(t, new RegExp(`revoke all on function public\\.instructores_no_reactivar_eliminada\\(\\) from ${rol};`));
  }
  assert.match(t, /grant execute on function public\.instructores_no_reactivar_eliminada\(\) to service_role;/);
  // La propia función escribe `activo = false` y `auth_user_id = null`: el trigger solo mira lo contrario, así que no la frena.
  assert.match(funcion, /activo = false\s+where id = p_instructor_id and studio_id = p_studio_id/);
});
