import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PACKS_CONSULTAS, caducidadDelPack, centimosDe, packPorUnidades, precioPorConsulta, puedeComprarPacks, saldoBajo, textoQuedan, ORIGEN_PACK,
} from './packs.ts';
import { CONSULTAS_ASISTENTE_PRUEBA, PLAN_ENTITLEMENTS, PLANES } from '../billing/entitlements.ts';

const migracion = readFileSync(new URL('../../supabase/migrations/20261005213749_asistente_y_consumos_ia.sql', import.meta.url), 'utf8');

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

// ── Fase 3: la compra (6-oct-2026) ─────────────────────────────────────────

test('catálogo: tres packs de pago único, en céntimos exactos, y nada fuera de él', () => {
  assert.deepEqual(PACKS_CONSULTAS.map(p => [p.unidades, centimosDe(p)]), [[100, 900], [300, 2400], [1000, 6900]]);
  assert.equal(packPorUnidades(300)?.precioEur, 24);
  for (const x of [0, 50, 101, '100', null, undefined, 1000.5]) assert.equal(packPorUnidades(x), null, String(x));
  assert.equal(ORIGEN_PACK, 'ia_pack');
  assert.deepEqual(PACKS_CONSULTAS.map(precioPorConsulta), ['0,09 € por consulta', '0,08 € por consulta', '0,069 € por consulta']);
});

test('caducidad: el mismo día 12 meses después; el 29 de febrero, el último del mes', () => {
  assert.equal(caducidadDelPack(new Date('2026-10-06T10:15:00Z')).toISOString(), '2027-10-06T10:15:00.000Z');
  assert.equal(caducidadDelPack(new Date('2028-02-29T08:00:00Z')).toISOString(), '2029-02-28T08:00:00.000Z');
  assert.equal(caducidadDelPack(new Date('2026-12-31T23:30:00Z')).toISOString(), '2027-12-31T23:30:00.000Z');
});

test('quién compra: solo la propietaria (la gerente usa el asistente, pero no mueve dinero)', () => {
  assert.equal(puedeComprarPacks('PROPIETARIO'), true);
  for (const r of ['MANAGER', 'RECEPCION', 'INSTRUCTOR'] as const) assert.equal(puedeComprarPacks(r), false, r);
  assert.equal(puedeComprarPacks(null), false);
});

test('saldo bajo: menos del 10 % de la cuota del mes, y todavía alguna', () => {
  assert.equal(saldoBajo(4, 50), true);
  assert.equal(saldoBajo(5, 50), false);
  assert.equal(saldoBajo(0, 50), false, 'a cero ya sale la tarjeta, no el aviso');
  assert.equal(saldoBajo(19, 200), true);
  assert.equal(saldoBajo(null, 200), false);
  assert.equal(saldoBajo(3, 0), false);
});

test('«Te quedan N»: suma cuota y packs y no dice «este mes» si hay packs', () => {
  assert.equal(textoQuedan(182, { packsQuedan: 0 }), 'Te quedan 182 consultas este mes');
  assert.equal(textoQuedan(182, null), 'Te quedan 182 consultas este mes');
  assert.equal(textoQuedan(1, {}), 'Te queda 1 consulta este mes');
  assert.equal(textoQuedan(312, { packsQuedan: 300 }), 'Te quedan 312 consultas');
  assert.equal(textoQuedan(1200, { packsQuedan: 1000 }), 'Te quedan 1.200 consultas');
  assert.equal(textoQuedan(12, { enPrueba: true }), 'Te quedan 12 consultas de prueba');
  assert.equal(textoQuedan(0, {}), 'No te quedan consultas este mes');
  assert.equal(textoQuedan(0, { enPrueba: true }), 'No te quedan consultas de prueba');
  assert.equal(textoQuedan(null, {}), null);
});

test('orden de gasto (la dueña es ia_cerrar_consulta): primero la cuota, luego packs vigentes por caducidad', () => {
  const cierre = readFileSync(new URL('../../supabase/migrations/20261006014513_asistente_charla_no_gasta.sql', import.meta.url), 'utf8');
  const cuerpo = cierre.slice(cierre.indexOf('create or replace function public.ia_cerrar_consulta'));
  const iCuota = cuerpo.indexOf('v_de_cuota := least(v_u, v_cuota_queda)');
  const iPacks = cuerpo.indexOf('from public.ia_packs p');
  assert.ok(iCuota > 0 && iPacks > iCuota, 'la cuota se reparte antes que los packs');
  assert.match(cuerpo, /p\.estado = 'ACTIVO' and p\.caduca_en > now\(\)[\s\S]*?order by p\.caduca_en, p\.id[\s\S]*?for update/);
  assert.match(cuerpo, /unidades_pack = v_de_pack/);
  assert.match(cuerpo, /set unidades_usadas = p\.unidades_usadas \+ v_toma/);
});
