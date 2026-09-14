import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardianes de contrato — fase 3 de la auditoría RGPD/seguridad (2026-09-13):
// A26/C11 (guardias de servidor y EXECUTE por defecto) y M9/C25 (anon y
// políticas TO public).
//
//  · «No hay usuario» NO significa «llama el servidor». Las guardias que se
//    saltan una comprobación para el servidor preguntan
//    `public.es_llamada_servicio()`, nunca si `auth.uid()` es nulo. La
//    conversión de las 27 que había se hizo sobre la definición viva de prod
//    (20260913233644), así que el texto de migraciones ANTERIORES sigue
//    mostrando la forma vieja: este fichero impide que vuelva a entrar por una
//    migración nueva que copie ese texto.
//  · Una función SECURITY DEFINER nueva declara por escrito qué pasa con anon
//    (REVOKE o GRANT explícito en la misma migración).
//  · Ninguna migración nueva devuelve a anon el EXECUTE por defecto, ni GRANT
//    de tabla sobre las tablas de negocio, ni crea políticas sin `TO` (= PUBLIC).
//
// Si uno falla, no se arregla quitándolo: se arregla la migración.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const DIR = join(RAIZ, 'supabase/migrations');

/** Primera migración de la fase: desde aquí rigen las reglas nuevas. */
const CORTE = '20260913233644';

const sinComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

type Migracion = { nombre: string; sql: string };

function migraciones(): Migracion[] {
  return readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    .map(nombre => ({ nombre, sql: sinComentarios(readFileSync(join(DIR, nombre), 'utf8')) }));
}

const desdeElCorte = (): Migracion[] =>
  migraciones().filter(m => /^\d{14}_/.test(m.nombre) && m.nombre.slice(0, 14) >= CORTE);

function migracion(sufijo: string): string {
  const m = migraciones().find(x => x.nombre.endsWith(sufijo));
  assert.ok(m, `falta la migración *${sufijo}`);
  return m!.sql;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Funcion = { nombre: string; definer: boolean; cuerpo: string };

/** Funciones creadas en un SQL con cuerpo entre dólares (`$$`, `$function$`…). */
function funcionesDe(sql: string): Funcion[] {
  const halladas: Funcion[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+((?:"?\w+"?\s*\.\s*)?"?\w+"?)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const resto = sql.slice(m.index);
    const apertura = /\$\w*\$/.exec(resto);
    // Cuerpo entre comillas simples: la sentencia termina antes del primer `$`.
    if (!apertura || resto.slice(0, apertura.index).includes(';')) continue;
    const etiqueta = apertura[0];
    const desde = apertura.index + etiqueta.length;
    const hasta = resto.indexOf(etiqueta, desde);
    if (hasta === -1) continue;
    const fin = resto.indexOf(';', hasta + etiqueta.length);
    const cabecera = resto.slice(0, apertura.index);
    const pie = resto.slice(hasta + etiqueta.length, fin === -1 ? undefined : fin);
    halladas.push({
      nombre: m[1].replace(/["\s]/g, '').replace(/^public\./i, '').toLowerCase(),
      definer: /security\s+definer/i.test(cabecera + pie),
      cuerpo: resto.slice(desde, hasta),
    });
    re.lastIndex = m.index + hasta + etiqueta.length;
  }
  return halladas;
}

/**
 * Guardias que leen «uid nulo» como servidor. La única forma aceptada es la que
 * CIERRA: `if auth.uid() is null then raise …` (exigir sesión).
 */
function guardiasUidNulo(cuerpo: string): string[] {
  const halladas: string[] = [];
  for (const m of cuerpo.matchAll(/auth\.uid\s*\(\s*\)\s+is\s+(not\s+)?null/gi)) {
    const antes = cuerpo.slice(0, m.index);
    const despues = cuerpo.slice(m.index! + m[0].length);
    const exigeSesion = !m[1] && /\bif\s+$/i.test(antes) && /^\s*then\s+raise\b/i.test(despues);
    if (!exigeSesion) halladas.push(m[0]);
  }
  return halladas;
}

/** ¿La migración deja escrito qué pasa con anon para esta función? */
function decideAnon(sql: string, nombre: string): boolean {
  const n = escapar(nombre);
  const fn = String.raw`\bon\s+function\s+[^;]*?(?:\bpublic\.)?"?\b${n}"?\s*\(`;
  return new RegExp(String.raw`\brevoke\s[^;]*?${fn}[^;]*\bfrom\b[^;]*\banon\b`, 'i').test(sql)
    || new RegExp(String.raw`\bgrant\s[^;]*?${fn}[^;]*\bto\b[^;]*\banon\b`, 'i').test(sql);
}

const TABLAS_SIN_ANON = [
  // Con datos personales directos.
  'achievement_history', 'achievement_progress', 'actividad_reciente', 'automation_logs',
  'challenge_history', 'challenge_progress', 'citas', 'citas_disponibilidad',
  'credit_transactions', 'facturas', 'ingresos_manuales', 'instructora_disponibilidad',
  'instructora_disponibilidad_excepciones', 'instructores', 'member_credits', 'memoria_socio',
  'mensajes_equipo', 'notas_internas', 'notas_progreso', 'preferencias_socio', 'recibos',
  'recomendaciones', 'reservas', 'reward_actions', 'reward_history', 'reward_redemptions',
  'sesiones', 'suscripciones', 'sustitucion_contactos', 'usuarios', 'videos_on_demand',
  // Personales por referencia o dentro de JSON, y configuración del negocio.
  'achievement_definitions', 'automation_rules', 'automatizaciones', 'backups', 'campanas',
  'challenge_definitions', 'citas_servicios', 'codigos_descuento', 'dashboard_charts',
  'decision_autonomia_config', 'decision_feature_flags', 'decision_sessions',
  'level_definitions', 'notificaciones', 'planes_tarifa', 'productos_pos',
  'recomendacion_outcomes', 'resumen_diario', 'reward_catalog', 'reward_rules', 'salas',
  'soporte_solicitudes', 'sustituciones',
];

const TABLAS_POLITICAS_ERAN_PUBLIC = [
  'achievement_definitions', 'challenge_definitions', 'ingresos_manuales', 'member_credits',
  'mensajes_equipo', 'movimientos_stock', 'productos_pos', 'review_boost_feedback',
  'reward_actions', 'reward_catalog', 'reward_redemptions', 'reward_rules',
];

const GUARDIAS = migracion('_guardias_de_servidor_explicitas.sql');
const DEFAULT_ACL = migracion('_funciones_nuevas_sin_execute_anon.sql');
const TABLAS = migracion('_tablas_de_negocio_sin_grant_anon.sql');

// ─── Los detectores no son huecos ────────────────────────────────────────────

test('detectores: cazan la guardia abierta, aceptan la que exige sesión y la de servidor', () => {
  assert.deepEqual(guardiasUidNulo('if auth.uid() is not null and x then raise exception \'A\'; end if;').length, 1);
  assert.deepEqual(guardiasUidNulo('where (auth.uid() is null or studio_id = public.current_studio_id())').length, 1);
  assert.deepEqual(guardiasUidNulo('if auth.uid() is null then return new; end if;').length, 1);
  assert.deepEqual(guardiasUidNulo('if auth.uid() is null then\n  raise exception \'NO_AUTENTICADO\';'), []);
  assert.deepEqual(guardiasUidNulo('if not public.es_llamada_servicio() and x then raise exception \'A\';'), []);

  const sql = `
    create or replace function public.abre(p text) returns void language plpgsql security definer
    set search_path = '' as $function$ begin perform 1; end; $function$;
    create function public.cierra() returns int language sql as $$ select 1 $$ security definer;
    revoke all on function public.cierra() from public, anon;
    create function public.helper() returns int language sql as 'select 1';
  `;
  const fns = funcionesDe(sql);
  assert.deepEqual(fns.map(f => [f.nombre, f.definer]), [['abre', true], ['cierra', true]]);
  assert.equal(decideAnon(sql, 'abre'), false);
  assert.equal(decideAnon(sql, 'cierra'), true);
  assert.equal(decideAnon('grant execute on function public.a(text), public.b(text) to anon;', 'b'), true);
  assert.equal(decideAnon('revoke all on function public.abrev(text) from anon;', 'abre'), false);
});

// ─── A26: es_llamada_servicio y la conversión de las guardias ───────────────

test('es_llamada_servicio: INVOKER, STABLE, search_path vacío; solo service_role o sesión directa de administración', () => {
  const def = funcionesDe(GUARDIAS).find(f => f.nombre === 'es_llamada_servicio');
  assert.ok(def, 'falta public.es_llamada_servicio()');
  assert.equal(def!.definer, false, 'solo lee GUCs: no necesita ni debe ser SECURITY DEFINER');
  assert.match(GUARDIAS, /create or replace function public\.es_llamada_servicio\(\)\s+returns boolean\s+language sql\s+stable\s+set search_path = ''/i);
  assert.match(def!.cuerpo, /current_setting\('role', true\)/);
  assert.match(def!.cuerpo, /current_setting\('request\.jwt\.claims', true\)/);
  assert.match(def!.cuerpo, /= 'service_role'/);
  assert.match(def!.cuerpo, /session_user in \('postgres', 'supabase_admin'\)/);
  assert.match(def!.cuerpo, /'none'/, 'una sesión de postgres que ensaya como anon/authenticated no es servidor');
  assert.doesNotMatch(def!.cuerpo, /auth\.uid/);
  assert.match(GUARDIAS, /revoke all on function public\.es_llamada_servicio\(\) from public, anon;/);
  assert.match(GUARDIAS, /grant execute on function public\.es_llamada_servicio\(\) to authenticated, service_role;/);
});

test('conversión: las dos formas, sobre la definición viva, sin tocar ACL y sin dejar ninguna', () => {
  assert.match(GUARDIAS, /pg_get_functiondef\(f\.oid\)/);
  assert.match(GUARDIAS, /'auth\\\.uid\\\(\\\)\\s\+is\\s\+not\\s\+null', 'not public\.es_llamada_servicio\(\)', 'gi'/);
  assert.match(GUARDIAS, /'auth\\\.uid\\\(\\\)\\s\+is\\s\+null', 'public\.es_llamada_servicio\(\)', 'gi'/);
  assert.match(GUARDIAS, /la ACL de % cambió/);
  assert.match(GUARDIAS, /quedan funciones sin convertir/);
  assert.ok(
    GUARDIAS.indexOf('create or replace function public.es_llamada_servicio()') < GUARDIAS.indexOf('do $conversion$'),
    'el helper tiene que existir antes de reescribir las funciones que lo llaman',
  );
});

test('default ACL: postgres deja de conceder EXECUTE a anon (en public) y a PUBLIC (global)', () => {
  assert.match(DEFAULT_ACL, /alter default privileges for role postgres in schema public\s+revoke execute on functions from anon;/);
  assert.match(DEFAULT_ACL, /alter default privileges for role postgres\s+revoke execute on functions from public;/);
  assert.doesNotMatch(DEFAULT_ACL, /revoke execute on functions from[^;]*\bauthenticated\b/,
    'authenticated se mantiene: helpers de RLS y RPC del panel');
});

// ─── M9: tablas y políticas ─────────────────────────────────────────────────

test('tablas: las 54 tablas de negocio pierden todo privilegio de anon', () => {
  const revocadas = new Set<string>();
  for (const s of TABLAS.matchAll(/revoke all on table([^;]*)from anon;/gi)) {
    for (const t of s[1].matchAll(/public\.(\w+)/g)) revocadas.add(t[1]);
  }
  assert.deepEqual([...revocadas].sort(), [...TABLAS_SIN_ANON].sort());
  assert.equal(TABLAS_SIN_ANON.length, 54);
  // Lo único que les quedaba a estas dos era MAINTAIN; las columnas públicas de
  // `studios` son privilegio de columna y se quedan.
  assert.match(TABLAS, /revoke maintain on table public\.studios, public\.tipos_clase from anon;/);
  assert.doesNotMatch(TABLAS, /revoke[^;]*\(\s*\w[^;]*on\s+(table\s+)?public\.studios/i, 'no revocar columnas de studios aquí');
});

test('políticas: las que eran TO public pasan a TO authenticated sin reescribir su condición', () => {
  for (const t of TABLAS_POLITICAS_ERAN_PUBLIC) {
    assert.match(TABLAS, new RegExp(String.raw`alter policy \w+ on public\.${t} to authenticated;`), t);
  }
  assert.equal((TABLAS.match(/alter policy \w+ on public\.\w+ to authenticated;/g) ?? []).length, 32);
  assert.doesNotMatch(TABLAS, /\b(drop|create) policy\b/i, 'solo cambia el rol, nunca la lógica');
  assert.doesNotMatch(TABLAS, /\balter policy[^;]*\b(using|with check)\b/i);
});

// ─── Reglas para toda migración desde el corte ──────────────────────────────

test('migraciones nuevas: ninguna guardia lee «uid nulo» como servidor', () => {
  const fallos: string[] = [];
  for (const { nombre, sql } of desdeElCorte()) {
    for (const f of funcionesDe(sql)) {
      for (const g of guardiasUidNulo(f.cuerpo)) fallos.push(`${nombre} · ${f.nombre}: «${g}»`);
    }
  }
  assert.deepEqual(fallos, [],
    'Usa public.es_llamada_servicio() (o `if auth.uid() is null then raise` si lo que quieres es exigir sesión). ' +
    'Si partiste del texto de una migración anterior, copia la definición viva de prod.');
});

test('migraciones nuevas: toda función SECURITY DEFINER decide por escrito sobre anon', () => {
  const fallos: string[] = [];
  for (const { nombre, sql } of desdeElCorte()) {
    for (const f of funcionesDe(sql)) {
      if (f.definer && !decideAnon(sql, f.nombre)) fallos.push(`${nombre} · ${f.nombre}`);
    }
  }
  assert.deepEqual(fallos, [],
    'Añade en la misma migración `revoke all on function public.<fn>(<args>) from public, anon;` ' +
    '(o un `grant execute … to anon` si de verdad es pública) y comprueba has_function_privilege tras aplicarla.');
});

test('migraciones nuevas: nada devuelve a anon/PUBLIC el EXECUTE por defecto', () => {
  for (const { nombre, sql } of desdeElCorte()) {
    assert.doesNotMatch(sql, /alter\s+default\s+privileges[^;]*\bgrant\b[^;]*\bon\s+functions\b[^;]*\bto\b[^;]*\b(anon|public)\b/i, nombre);
  }
});

test('migraciones nuevas: sin GRANT de tabla a anon sobre las tablas de negocio', () => {
  const fallos: string[] = [];
  for (const { nombre, sql } of desdeElCorte()) {
    for (const sentencia of sql.split(';')) {
      if (!/^\s*grant\b/i.test(sentencia) || !/\bto\b[\s\S]*\banon\b/i.test(sentencia)) continue;
      if (/\bon\s+(function|functions|schema|sequence|sequences|all)\b/i.test(sentencia)) continue;
      for (const t of TABLAS_SIN_ANON) {
        if (new RegExp(String.raw`\bpublic\.${t}\b`, 'i').test(sentencia)) fallos.push(`${nombre} · ${t}`);
      }
    }
  }
  assert.deepEqual(fallos, []);
});

test('migraciones nuevas: toda política declara su rol y ninguno es PUBLIC', () => {
  const fallos: string[] = [];
  for (const { nombre, sql } of desdeElCorte()) {
    for (const m of sql.matchAll(/\b(create|alter)\s+policy\s[^;]*/gi)) {
      const s = m[0];
      if (/\bto\s+public\b/i.test(s)) fallos.push(`${nombre}: TO public · ${s.slice(0, 80)}`);
      else if (m[1].toLowerCase() === 'create' && !/\bto\s+"?\w+/i.test(s)) fallos.push(`${nombre}: sin TO · ${s.slice(0, 80)}`);
    }
  }
  assert.deepEqual(fallos, [], 'Una política sin `TO` es TO PUBLIC: incluye a anon.');
});
