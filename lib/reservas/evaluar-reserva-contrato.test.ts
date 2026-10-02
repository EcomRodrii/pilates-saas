import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Motor de derechos, FASE 3b (migración 20261002160000): `evaluar_reserva`, la elegibilidad en un solo sitio, de solo
// lectura y en sombra. Guardianes sobre el fuente de lo que no se puede invocar desde node:test; la PARIDAD con
// `reservar_plaza` contra una base de datos real vive en `supabase/tests/rls-evaluar-reserva-paridad.test.ts`.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const MIGRACION = leer('supabase/migrations/20261002160000_evaluar_reserva.sql');
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
    "'ya-reservada'", "'spot-no-disponible'", "'spot-ocupado'", "'aforo-lleno'", "'conflicto-horario'", "'limite-semanal-actividad'",
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
