import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Motor de derechos, FASE 3a (migración 20261002150000): el no-show cuenta como uso para el tope semanal,
// y con varios bonos manda la especificidad. Guardianes sobre el fuente de lo que no se puede invocar desde
// node:test; el comportamiento contra una base de datos real vive en `supabase/tests/rls-reglas-derechos.test.ts`.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const MIGRACION = leer('supabase/migrations/20261002150000_reglas_derechos_noshow_y_especificidad.sql');

test('⚠️ el tope semanal cuenta el no-show en sus DOS conteos (total y por actividad)', () => {
  const funcion = MIGRACION.slice(
    MIGRACION.indexOf('create or replace function public.calcular_excede_limite_semanal'),
    MIGRACION.indexOf('create or replace function public.elegir_bono_consumible'));
  const estados = funcion.match(/r\.estado in \('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'\)/g) ?? [];
  assert.equal(estados.length, 2, 'los dos conteos (el del tope total y el del tope por actividad) tienen que contar el no-show');
  assert.ok(!/r\.estado in \('CONFIRMADA', 'ASISTIDA'\)/.test(funcion), 'queda un conteo sin el no-show');
  // Lo que NO cuenta sigue sin contar.
  assert.ok(!/LISTA_ESPERA|CANCELADA|PENDIENTE_APROBACION/.test(funcion.replace(/--.*$/gm, '')), 'la lista de espera y lo cancelado no gastan el tope');
});

test('⚠️ la recuperación semanal tampoco regala un hueco por un no-show: cuenta como uso, igual que el tope', () => {
  const barrido = leer('lib/recuperaciones/otorgar-semanales.ts');
  assert.match(barrido, /r\.estado === 'CONFIRMADA' \|\| r\.estado === 'ASISTIDA' \|\| r\.estado === 'NO_ASISTIO'/);
});

test('⚠️ elegir_bono_consumible: primero el acotado, luego la caducidad, luego el id; y la mensual sigue ganando', () => {
  const funcion = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.elegir_bono_consumible'));
  const orden = funcion.slice(funcion.indexOf('order by case when exists ('));
  const iEspecifico = orden.indexOf('plan_tipos_clase');
  const iCaducidad = orden.indexOf("coalesce(s.fecha_fin, '9999-12-31'::date)");
  const iId = orden.indexOf('s.id collate "C"');
  assert.ok(iEspecifico > 0 && iEspecifico < iCaducidad && iCaducidad < iId, 'el orden tiene que ser especificidad → caducidad → id');
  assert.match(funcion, /when p_tipo_clase_id is not null and exists \([\s\S]*?p\.tipo = 'MENSUAL'[\s\S]*?\) then null/,
    'la mensual que cubre la clase sigue ganando: ningún bono se elige');
  // Solo candidatos con saldo, vigentes y que cubren la clase: no se amplía quién puede pagar.
  assert.match(funcion, /s\.sesiones_restantes > 0/);
  assert.match(funcion, /public\.plan_cubre_tipo_clase\(p\.id, p_tipo_clase_id\)/);
});

test('la migración solo cambia el CUERPO de dos funciones y comprueba que sus permisos no se han movido', () => {
  assert.equal((MIGRACION.match(/create or replace function/g) ?? []).length, 2);
  assert.ok(!/grant execute/i.test(MIGRACION.replace(/--.*$/gm, '')), 'no se concede ningún permiso nuevo');
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.calcular_excede_limite_semanal\(text,text,text,timestamptz\)'::regprocedure, 'EXECUTE'\)/);
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.elegir_bono_consumible\(text,text,text,date\)'::regprocedure, 'EXECUTE'\)/);
});
