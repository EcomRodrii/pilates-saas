import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Motor de derechos, FASE 3c (migración 20261002145629): `reservar_plaza` DECIDE con `evaluar_reserva`. Guardianes sobre el fuente;
// la paridad y la concurrencia contra una base de datos real viven en `supabase/tests/rls-evaluar-reserva-paridad.test.ts` y
// `supabase/tests/rls-reservar-plaza-concurrencia.test.ts`.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const MIGRACION = leer('supabase/migrations/20261002145629_reservar_plaza_decide_con_evaluar.sql');
const SIN_COMENTARIOS = MIGRACION.replace(/--.*$/gm, '');
const CUERPO = SIN_COMENTARIOS.slice(SIN_COMENTARIOS.indexOf('create or replace function public.reservar_plaza'), SIN_COMENTARIOS.indexOf('do $$'));
const ANTERIOR = leer('supabase/migrations/20260930094536_reservar_plaza_elige_el_bono_bajo_su_candado.sql');

test('⚠️ la elegibilidad vive en UN sitio: reservar_plaza ya no repite ninguna comprobación', () => {
  assert.match(CUERPO, /select public\.evaluar_reserva\(/);
  assert.match(CUERPO, /\) into v_ev;/);
  for (const inline of [
    'calcular_excede_limite_semanal', 'socio_tiene_conflicto_horario', 'aforo_efectivo', 'socio_tiene_entitlement_activo',
    'fecha_en_cierre', 'socio_tiene_impago', 'current_rol()', 'requiere_autorizacion', 'socio_tipos_clase_autorizados',
  ]) assert.ok(!CUERPO.includes(inline), `reservar_plaza vuelve a decidir por su cuenta: ${inline}`);
  for (const excepcion of ['YA_RESERVADA', 'CONFLICTO_HORARIO', 'ESTUDIO_CERRADO', 'SIN_ENTITLEMENT', 'NECESITA_AUTORIZACION',
    'RESERVA_BLOQUEADA_IMPAGO', 'AFORO_LLENO_SIN_ESPERA', 'SPOT_OCUPADO', 'SPOT_NO_DISPONIBLE']) {
    assert.ok(!new RegExp(`raise exception '${excepcion}'`).test(CUERPO), `${excepcion} lo lanza evaluar_reserva (detalle), no esta función`);
  }
});

test('⚠️ rechaza con LA MISMA excepción que siempre (el detalle de evaluar_reserva), para que el servidor vea exactamente lo mismo', () => {
  assert.match(CUERPO, /if \(v_ev ->> 'puede'\)::boolean is not true then\s+raise exception '%', coalesce\(v_ev ->> 'detalle', 'NO_AUTORIZADO'\);/);
  // Y los dos rechazos del tope semanal que sí decide aquí (carrera por la recuperación) siguen siendo los de siempre.
  assert.match(CUERPO, /raise exception 'LIMITE_SEMANAL_ACTIVIDAD'/);
  assert.match(CUERPO, /raise exception 'LIMITE_SEMANAL';/);
  assert.match(CUERPO, /raise exception 'SESION_NO_ENCONTRADA'/);
});

test('⚠️ conserva todo lo que es de ESCRITURA y de seguridad: candados, recuperación, inserción y cobro defensivo del bono', () => {
  const orden = [
    'validar_studio_mismatch', 'validar_socio_del_studio', 'pg_advisory_xact_lock', 'for update', 'select public.evaluar_reserva(',
    'intentar_consumir_recuperacion_semanal', 'insert into reservas', 'consumir_bono_interno',
  ];
  const posiciones = orden.map(c => CUERPO.indexOf(c));
  posiciones.forEach((p, i) => assert.ok(p > 0, `falta ${orden[i]}`));
  for (let i = 1; i < posiciones.length; i++) {
    assert.ok(posiciones[i - 1] < posiciones[i], `${orden[i - 1]} tiene que ir antes que ${orden[i]}`);
  }
  // La reserva nace rastreada, explícitamente.
  assert.match(CUERPO, /bono_consumo_rastreado\)\s+values \([\s\S]*?v_pos, null, now\(\), true\s*\)/);
  // El bono defensivo no tumba una reserva ya válida, y se vuelve a elegir bajo el candado.
  assert.match(CUERPO, /exception when raise_exception then/);
  assert.match(CUERPO, /public\.elegir_bono_consumible\(p_studio_id, p_socio_id, v_tipo_clase_id\)/);
  assert.match(CUERPO, /#variable_conflict use_column/);
  // La evaluación va en su PROPIA sentencia, tras los candados: ve lo que la reserva anterior de la clase ya confirmó.
  assert.ok(CUERPO.indexOf('pg_advisory_xact_lock') < CUERPO.indexOf('select public.evaluar_reserva('));
});

test('misma firma y mismos permisos que la versión anterior: nada que rehacer en PostgREST ni en el ACL', () => {
  const firma = (sql: string) => {
    const m = sql.match(/function public\.reservar_plaza\(([\s\S]*?)\)\s*returns table\(([^)]*)\)/i);
    assert.ok(m, 'no se lee la firma');
    return `${m[1]} → ${m[2]}`.replace(/\s+/g, ' ').trim().toLowerCase().replace(/::text/g, '');
  };
  assert.equal(firma(MIGRACION), firma(ANTERIOR));
  assert.ok(!/create\s+function\s+public\.reservar_plaza/i.test(SIN_COMENTARIOS), 'una firma nueva crearía otro objeto con permisos por defecto');
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.reservar_plaza\(text,text,text,text,boolean,boolean,text,boolean,boolean,text\)'::regprocedure, 'EXECUTE'\)/);
  assert.match(MIGRACION, /position\('public\.evaluar_reserva\(' in/);
});
