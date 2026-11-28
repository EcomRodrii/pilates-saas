import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Motor de derechos, FASE 3b (migración 20261002145300): `evaluar_reserva`, la elegibilidad en un solo sitio, de solo
// lectura y en sombra. Guardianes sobre el fuente de lo que no se puede invocar desde node:test; la PARIDAD con
// `reservar_plaza` contra una base de datos real vive en `supabase/tests/rls-evaluar-reserva-paridad.test.ts`.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const DIR_MIGRACIONES = new URL('../../supabase/migrations/', import.meta.url);
const MIGRACION_VIVA = readdirSync(DIR_MIGRACIONES)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .reverse()
  .find((f) => readFileSync(new URL(f, DIR_MIGRACIONES), 'utf8').includes('create or replace function public.evaluar_reserva'));
assert.ok(MIGRACION_VIVA, 'ninguna migración define public.evaluar_reserva');
const MIGRACION = readFileSync(new URL(MIGRACION_VIVA, DIR_MIGRACIONES), 'utf8');
const SIN_COMENTARIOS = MIGRACION.replace(/--.*$/gm, '');
const CUERPO = SIN_COMENTARIOS.slice(SIN_COMENTARIOS.indexOf('create or replace function public.evaluar_reserva'), SIN_COMENTARIOS.indexOf('revoke all on function public.evaluar_reserva'));

/** Los miembros del tipo `CodigoReserva` (los tipos no existen en ejecución). */
function codigosDelTipo(): string[] {
  const fuente = leer('lib/student/reserva-codigos.ts');
  const ini = fuente.indexOf('export type CodigoReserva =');
  const fin = fuente.indexOf('const CODIGOS_DE_NEGOCIO', ini);
  return [...fuente.slice(ini, fin).matchAll(/^\s*\| '([a-z-]+)'/gm)].map(m => m[1]);
}

test('⚠️ es de SOLO LECTURA: ni escribe, ni toma candados, ni deja contexto', () => {
  assert.match(CUERPO, /\bstable\b/, 'tiene que declararse STABLE');
  for (const prohibido of [/\binsert\s+into\b/i, /\bupdate\s+public\./i, /\bdelete\s+from\b/i, /\bfor\s+update\b/i, /pg_advisory/i, /set_config/i, /\braise\s+exception\b/i]) {
    assert.ok(!prohibido.test(CUERPO), `evaluar_reserva no puede contener ${prohibido}`);
  }
});

test('⚠️ solo la llama el servidor, y se comprueba al aplicarse', () => {
  assert.match(MIGRACION, /revoke all on function public\.evaluar_reserva\(text, text, text, jsonb\) from public, anon, authenticated;/);
  assert.match(MIGRACION, /grant execute on function public\.evaluar_reserva\(text, text, text, jsonb\) to service_role;/);
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.evaluar_reserva\(text,text,text,jsonb\)'::regprocedure, 'EXECUTE'\)/);
  assert.match(MIGRACION, /has_function_privilege\('authenticated', 'public\.evaluar_reserva\(text,text,text,jsonb\)'::regprocedure, 'EXECUTE'\)/);
  assert.ok(!/auth\.uid\(\) is (not )?null/.test(MIGRACION), 'un uid nulo no significa «servidor»');
});

test('⚠️ los códigos que devuelve son los de CodigoReserva (la misma lengua que el resto de la reserva)', () => {
  const devueltos = new Set([...CUERPO.matchAll(/'codigo', '([a-z-]+)'/g)].map(m => m[1]));
  const delTipo = new Set(codigosDelTipo());
  assert.ok(devueltos.size >= 11, `solo se leen ${devueltos.size} códigos`);
  for (const codigo of devueltos) assert.ok(delTipo.has(codigo), `evaluar_reserva devuelve «${codigo}», que no es un CodigoReserva`);
  // El de la rama condicional del tope semanal.
  assert.match(CUERPO, /'limite-semanal-actividad' else 'limite-semanal'/);
});

test('⚠️ comprueba en el MISMO orden que reservar_plaza (el primer rechazo tiene que ser el mismo)', () => {
  const orden = [
    "'sesion-no-encontrada'", "'estudio-cerrado'", "'impago'", "'necesita-autorizacion'", "'sin-plan'",
    "'ya-reservada'", "'max-por-dia'", "'spot-no-disponible'", "'spot-ocupado'", "'aforo-lleno'", "'conflicto-horario'", "'limite-semanal-actividad'",
  ];
  const posiciones = orden.map(c => CUERPO.indexOf(c));
  posiciones.forEach((p, i) => assert.ok(p > 0, `falta ${orden[i]}`));
  for (let i = 1; i < posiciones.length; i++) {
    assert.ok(posiciones[i - 1] < posiciones[i], `${orden[i - 1]} tiene que ir antes que ${orden[i]}, como en reservar_plaza`);
  }
});

test('usa las MISMAS funciones auxiliares que reservar_plaza: la paridad no depende de copiar su lógica', () => {
  for (const f of [
    'fecha_en_cierre', 'socio_tiene_impago', 'socio_tiene_entitlement_activo', 'aforo_efectivo',
    'socio_tiene_conflicto_horario', 'calcular_excede_limite_semanal', 'elegir_bono_consumible', 'plan_cubre_tipo_clase',
  ]) assert.match(CUERPO, new RegExp(`public\\.${f}\\(`), `no usa ${f}`);
  // Y el tope semanal solo se mira al confirmar, como en reservar_plaza.
  assert.match(CUERPO, /if v_estado = 'CONFIRMADA' then\s+select ce\.excede_total/);
  // El solape, solo al confirmar o dejar pendiente (no en la lista de espera).
  assert.match(CUERPO, /if v_estado in \('CONFIRMADA', 'PENDIENTE_APROBACION'\)/);
});

test('un único pagador por reserva: recuperación, bono o cuota, nunca dos a la vez', () => {
  // La recuperación solo se anuncia cuando se topa el límite; el bono/cuota, cuando no.
  const recuperacion = CUERPO.indexOf("'origen', 'recuperacion'");
  const bono = CUERPO.indexOf("'origen', 'bono'");
  const cuota = CUERPO.indexOf("'origen', 'cuota'");
  assert.ok(recuperacion > 0 && bono > recuperacion && cuota > bono);
  assert.match(CUERPO, /if v_excede_total or v_excede_tipo then[\s\S]*?v_pagador := jsonb_build_object\('origen', 'recuperacion'[\s\S]*?else\s+v_bono := public\.elegir_bono_consumible/);
});

test('el máximo diario es un gate opcional y cuenta el día del estudio en la evaluación SQL', () => {
  assert.match(CUERPO, /v_aplicar_max_por_dia boolean := coalesce\(\(p_opciones ->> 'aplicar_max_por_dia'\)::boolean, false\)/);
  assert.match(CUERPO, /\(s\.inicio at time zone 'Europe\/Madrid'\)::date = \(v_inicio at time zone 'Europe\/Madrid'\)::date/);
  assert.match(CUERPO, /r\.estado <> 'CANCELADA'/);
  assert.match(CUERPO, /not coalesce\(s\.cancelada, false\)/);
  assert.match(CUERPO, /'detalle', 'MAX_POR_DIA'/);
});

test('la RPC pública conserva el lock hasta insertar y está cerrada a anon/authenticated', () => {
  const inicio = SIN_COMENTARIOS.indexOf('create or replace function public.reservar_plaza_con_max_diario');
  const fin = SIN_COMENTARIOS.indexOf('revoke all on function public.reservar_plaza_con_max_diario', inicio);
  assert.ok(inicio >= 0 && fin > inicio, 'no se encontró la definición y revocación de la RPC pública');
  const wrapper = SIN_COMENTARIOS.slice(inicio, fin);
  assert.match(wrapper, /perform pg_advisory_xact_lock\(hashtext\(p_studio_id \|\| ':' \|\| p_socio_id\)\)/);
  assert.match(wrapper, /'aplicar_max_por_dia', true/);
  assert.match(wrapper, /return query select \* from public\.reservar_plaza\(/);
  assert.match(MIGRACION, /revoke all on function public\.reservar_plaza_con_max_diario\([^;]+ from public, anon, authenticated;/);
  assert.match(MIGRACION, /grant execute on function public\.reservar_plaza_con_max_diario\([^;]+ to service_role;/);
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.reservar_plaza_con_max_diario/);
  assert.match(MIGRACION, /has_function_privilege\('authenticated', 'public\.reservar_plaza_con_max_diario/);
});

test('solo la reserva pública de la alumna usa el wrapper atómico y su rechazo se traduce', () => {
  const admin = leer('lib/db/supabase-data-admin.ts');
  const inicio = admin.indexOf('export async function crearReservaPublica(');
  const fin = admin.indexOf('export async function reservarPlazaTrasPagoPublico(', inicio);
  assert.ok(inicio >= 0 && fin > inicio, 'no se encontró el límite de crearReservaPublica');
  const crear = admin.slice(inicio, fin);
  assert.match(crear, /admin\.rpc\('reservar_plaza_con_max_diario'/);
  assert.equal((admin.match(/rpc\('reservar_plaza_con_max_diario'/g) ?? []).length, 1,
    'el gate diario debe seguir limitado al canal de reserva pública de alumna');
  assert.match(crear, /esCodigoReserva\(error\.message, 'MAX_POR_DIA'\)/);
  assert.match(leer('lib/reservas/errores-rpc.ts'), /MAX_POR_DIA:/,
    'el código SQL debe tener traducción en el catálogo de errores');
});

test('⚠️ cada rechazo dice QUÉ excepción lanza reservar_plaza (`detalle`), y ese nombre es el que el servidor ya traduce', () => {
  const rechazos = [...CUERPO.matchAll(/'puede', false, 'codigo', '([a-z-]+)'(, 'detalle', '([A-Z_]+)')?/g)];
  assert.ok(rechazos.length >= 11, `solo se leen ${rechazos.length} rechazos`);
  for (const [, codigo, , detalle] of rechazos) assert.ok(detalle, `el rechazo «${codigo}» no dice su excepción`);
  const detalles = new Set([...CUERPO.matchAll(/'detalle', '([A-Z_]+)'/g)].map(m => m[1]));
  // Los que `crearReservaPublica` traduce por mensaje: si cambia uno, el servidor dejaría de reconocerlo.
  const admin = leer('lib/db/supabase-data-admin.ts');
  for (const d of detalles) assert.ok(admin.includes(d), `«${d}» no lo traduce el servidor (lib/db/supabase-data-admin.ts)`);
  // Los dos rechazos de sitio siguen siendo dos (mensajes distintos para la alumna).
  assert.ok(detalles.has('SPOT_NO_PERTENECE_A_LA_SALA') && detalles.has('SPOT_NO_DISPONIBLE'));
  assert.match(CUERPO, /'detalle', case when v_excede_tipo then 'LIMITE_SEMANAL_ACTIVIDAD' else 'LIMITE_SEMANAL' end/);
});
