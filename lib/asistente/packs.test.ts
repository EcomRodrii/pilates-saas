import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PACKS_CONSULTAS } from './packs.ts';
import { CONSULTAS_ASISTENTE_PRUEBA, PLAN_ENTITLEMENTS, PLANES } from '../billing/entitlements.ts';

const migracion = readFileSync(new URL('../../supabase/migrations/20261005210000_asistente_y_consumos_ia.sql', import.meta.url), 'utf8');

test('las unidades de los packs son las que admite el CHECK de ia_packs', () => {
  const check = migracion.match(/unidades integer not null check \(unidades in \(([^)]+)\)\)/);
  assert.ok(check, 'no encuentro el CHECK de ia_packs.unidades');
  assert.deepEqual(check[1].split(',').map(n => Number(n.trim())), PACKS_CONSULTAS.map(p => p.unidades));
  assert.deepEqual(PACKS_CONSULTAS.map(p => p.precioEur), [9, 24, 69]);
});

test('la cuota de TS es la misma que ia_cuota_mensual (la dueña del saldo)', () => {
  const cuerpo = migracion.slice(migracion.indexOf('create or replace function public.ia_cuota_mensual'), migracion.indexOf('$$;', migracion.indexOf('create or replace function public.ia_cuota_mensual')));
  assert.match(cuerpo, new RegExp(`when coalesce\\(p_en_prueba, false\\) then ${CONSULTAS_ASISTENTE_PRUEBA}\\b`));
  assert.match(cuerpo, new RegExp(`when p_plan = 'ESTUDIO' then ${PLAN_ENTITLEMENTS.ESTUDIO.consultasAsistenteMes}\\b`));
  assert.match(cuerpo, new RegExp(`when p_plan = 'CADENA' then ${PLAN_ENTITLEMENTS.CADENA.consultasAsistenteMes}\\b`));
  assert.match(cuerpo, new RegExp(`else ${PLAN_ENTITLEMENTS.BASE.consultasAsistenteMes}\\b`));
});

test('el asistente está en todos los planes, sin tocar la IA de Founding Studio', () => {
  for (const p of PLANES) assert.equal(PLAN_ENTITLEMENTS[p].features.asistente, true, `${p} sin asistente`);
  assert.equal(PLAN_ENTITLEMENTS.BASE.features.ia, false);
  assert.deepEqual(PLANES.map(p => PLAN_ENTITLEMENTS[p].consultasAsistenteMes), [50, 200, 500]);
});

test('las cuatro funciones del libro son solo de service_role, con los tres pasos', () => {
  for (const firma of [
    'ia_cuota_mensual(text, boolean)', 'ia_saldo_consultas(text)',
    'ia_reservar_consulta(text, uuid, text, uuid, text, numeric)',
    'ia_cerrar_consulta(uuid, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text[])',
  ]) {
    for (const rol of ['public', 'anon', 'authenticated']) {
      assert.ok(migracion.includes(`revoke all on function public.${firma} from ${rol};`), `${firma}: falta revoke from ${rol}`);
    }
    assert.ok(migracion.includes(`grant execute on function public.${firma} to service_role;`), `${firma}: falta grant a service_role`);
    assert.ok(migracion.includes(`'public.${firma}'`), `${firma}: falta en la comprobación con has_function_privilege`);
  }
});
