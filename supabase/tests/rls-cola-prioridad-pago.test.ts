// PR-13 (migr …_cola_quien_pago_va_primera, P06 · Fase A): quien pagó una clase y se quedó sin plaza
// va la PRIMERA en la lista de espera. Contra Postgres de verdad (job `calidad-rls`):
//   · la compensada con prioridad pasa delante aunque se apuntara después, y el hueco es suyo;
//   · sin prioridad (pagó tarde), la cola de siempre;
//   · la carrera aceptada: si se libera plaza ANTES de anotar la prioridad, sube la de delante y la
//     compensada queda la 1.ª de lo que queda (la posición que se le enseña es la real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let n = 0;
const unico = (p: string) => `${p}-${process.pid}-${Date.now()}-${n++}`;
const haceMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

async function claseLlena(studioId: string) {
  const sesion = unico('ses');
  const inicio = new Date(Date.now() + 2 * 86_400_000);
  const { error } = await admin.from('sesiones').insert({
    id: sesion, studio_id: studioId, aforo_maximo: 1, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(),
  });
  assert.ok(!error, error?.message);
  const [a, b, c, d] = [await crearSocia(admin, studioId), await crearSocia(admin, studioId), await crearSocia(admin, studioId), await crearSocia(admin, studioId)];
  const ids = { a: unico('res-a'), b: unico('res-b'), c: unico('res-web'), d: unico('res-d') };
  const { error: e2 } = await admin.from('reservas').insert([
    { id: ids.a, studio_id: studioId, sesion_id: sesion, socio_id: a, estado: 'CONFIRMADA', creado_en: haceMin(60) },
    { id: ids.b, studio_id: studioId, sesion_id: sesion, socio_id: b, estado: 'LISTA_ESPERA', posicion_espera: 1, creado_en: haceMin(10) },
    // La que pagó: entró en la cola DESPUÉS que b.
    { id: ids.c, studio_id: studioId, sesion_id: sesion, socio_id: c, estado: 'LISTA_ESPERA', posicion_espera: 2, creado_en: haceMin(5) },
    { id: ids.d, studio_id: studioId, sesion_id: sesion, socio_id: d, estado: 'LISTA_ESPERA', posicion_espera: 3, creado_en: haceMin(1) },
  ]);
  assert.ok(!e2, e2?.message);
  const pago = unico('pc');
  const { error: e3 } = await admin.from('pagos_clase').insert({
    id: pago, studio_id: studioId, pagador: `socio:${c}`, socio_id: c, sesion_id: sesion, plan_id: 'plan-x',
    importe_centimos: 1500, plaza_comprobada_en: haceMin(6), estado: 'PAGADO', pagado_en: haceMin(5),
  });
  assert.ok(!e3, e3?.message);
  return { sesion, socias: { a, b, c, d }, ids, pago };
}

const compensar = (studioId: string, pago: string, reserva: string, prioridad: boolean) =>
  admin.rpc('registrar_resultado_pago_clase', {
    p_id: pago, p_studio_id: studioId, p_estado: 'COMPENSADA', p_motivo: 'EN_ESPERA', p_reserva_id: reserva,
    p_suscripcion_id: null, p_pagado_en: null, p_prioridad: prioridad,
  });

const liberar = (studioId: string, reserva: string) =>
  admin.rpc('cancelar_reserva_plaza', { p_studio_id: studioId, p_reserva_id: reserva, p_socio_id: null, p_omitir_penalizacion: true });

async function cola(sesion: string): Promise<Record<string, string>> {
  const { data } = await admin.from('reservas').select('id, estado, posicion_espera').eq('sesion_id', sesion);
  return Object.fromEntries((data ?? []).map(r => [r.id as string, `${r.estado}:${r.posicion_espera ?? '-'}`]));
}

test('la que pagó y se quedó sin plaza pasa delante aunque se apuntara después, y el hueco es suyo', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const f = await claseLlena(studio.studioId);
    const r = await compensar(studio.studioId, f.pago, f.ids.c, true);
    assert.ok(!r.error, r.error?.message);
    assert.equal((r.data as { posicion_espera: number }[])[0].posicion_espera, 1, 'la app le dice la posición REAL: la 1.ª');
    assert.deepEqual(await cola(f.sesion), {
      [f.ids.a]: 'CONFIRMADA:-', [f.ids.c]: 'LISTA_ESPERA:1', [f.ids.b]: 'LISTA_ESPERA:2', [f.ids.d]: 'LISTA_ESPERA:3',
    });

    const l = await liberar(studio.studioId, f.ids.a);
    assert.ok(!l.error, l.error?.message);
    assert.equal((l.data as { promovida_socio_id: string }[])[0].promovida_socio_id, f.socias.c, 'el hueco es de la que pagó');
    assert.deepEqual(await cola(f.sesion), {
      [f.ids.a]: 'CANCELADA:-', [f.ids.c]: 'CONFIRMADA:-', [f.ids.b]: 'LISTA_ESPERA:1', [f.ids.d]: 'LISTA_ESPERA:2',
    });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('sin prioridad (pagó tarde), la cola de siempre: por orden de llegada', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const f = await claseLlena(studio.studioId);
    const r = await compensar(studio.studioId, f.pago, f.ids.c, false);
    assert.ok(!r.error, r.error?.message);
    assert.equal((r.data as { posicion_espera: number }[])[0].posicion_espera, 2);
    const l = await liberar(studio.studioId, f.ids.a);
    assert.equal((l.data as { promovida_socio_id: string }[])[0].promovida_socio_id, f.socias.b);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('la carrera aceptada: se libera plaza ANTES de anotar la prioridad → sube la de delante, y la que pagó queda la 1.ª de lo que queda', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const f = await claseLlena(studio.studioId);
    const l = await liberar(studio.studioId, f.ids.a);
    assert.ok(!l.error, l.error?.message);
    assert.equal((l.data as { promovida_socio_id: string }[])[0].promovida_socio_id, f.socias.b, 'todavía sin prioridad: el orden de antes');
    const r = await compensar(studio.studioId, f.pago, f.ids.c, true);
    assert.ok(!r.error, r.error?.message);
    assert.equal((r.data as { posicion_espera: number }[])[0].posicion_espera, 1, 'la posición que se le enseña es la real');
    assert.deepEqual(await cola(f.sesion), {
      [f.ids.a]: 'CANCELADA:-', [f.ids.b]: 'CONFIRMADA:-', [f.ids.c]: 'LISTA_ESPERA:1', [f.ids.d]: 'LISTA_ESPERA:2',
    });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
