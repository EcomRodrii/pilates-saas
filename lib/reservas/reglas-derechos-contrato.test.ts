import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Motor de derechos, FASE 3a (migración 20261002134242): el no-show cuenta como uso para el tope semanal,
// y con varios bonos manda la especificidad. Guardianes sobre el fuente de lo que no se puede invocar desde
// node:test; el comportamiento contra una base de datos real vive en `supabase/tests/rls-reglas-derechos.test.ts`.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const MIGRACION = leer('supabase/migrations/20261002134242_reglas_derechos_noshow_y_especificidad.sql');

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

test('la migración solo cambia el CUERPO de dos funciones y deja sus permisos EXPLÍCITOS: solo el servidor', () => {
  const sql = MIGRACION.replace(/--.*$/gm, '');
  assert.equal((sql.match(/create or replace function/g) ?? []).length, 2);
  for (const firma of ['calcular_excede_limite_semanal\\(text, text, text, timestamp with time zone\\)', 'elegir_bono_consumible\\(text, text, text, date\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${firma} from public, anon, authenticated;`), firma);
    assert.match(sql, new RegExp(`grant execute on function public\\.${firma} to service_role;`), firma);
  }
  // Ningún permiso a nadie más (en una base de datos nueva estas funciones nacían abiertas: ver la cabecera del bloque).
  assert.ok(!/grant execute[^;]*\)\s+to\s+[^;]*\b(anon|authenticated|public)\b/i.test(sql), 'no se concede ejecución a nadie más que al servidor');
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.calcular_excede_limite_semanal\(text,text,text,timestamptz\)'::regprocedure, 'EXECUTE'\)/);
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.elegir_bono_consumible\(text,text,text,date\)'::regprocedure, 'EXECUTE'\)/);
});
