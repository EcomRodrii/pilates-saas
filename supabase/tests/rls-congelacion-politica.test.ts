// Política de congelación del estudio (migración 20261110121938):
//  · con `congelacion_permitida = false` no se congela una suscripción nueva (CONGELACION_NO_PERMITIDA), pero la ya
//    congelada se reanuda con normalidad;
//  · con `congelacion_max_dias`, una congelación alarga la fecha de fin como MÁXIMO esos días (y `dias_aplicados` lo dice);
//  · sin tope, todo como antes: cada día congelado alarga el plan.
// Contra Postgres de verdad (job `calidad-rls`), como el resto de supabase/tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearSocia, crearStudioConPropietaria, crearSuscripcion, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
let n = 0;
const idCong = () => `cong-pol-${process.pid}-${Date.now()}-${n++}`;

async function fechaFin(id: string): Promise<string | null> {
  const { data } = await admin.from('suscripciones').select('fecha_fin').eq('id', id).single();
  return (data as { fecha_fin: string | null }).fecha_fin;
}

/** Congela y retrocede el inicio de la congelación `dias` días: así «han pasado 40 días» sin esperar 40 días. */
async function congelarHaceDias(studio: Awaited<ReturnType<typeof crearStudioConPropietaria>>, susId: string, dias: number) {
  const id = idCong();
  const r = await studio.comoPropietaria.rpc('congelar_suscripcion', { p_id: id, p_suscripcion_id: susId, p_studio_id: studio.studioId, p_motivo: 'test' });
  assert.ok(!r.error, r.error?.message);
  await sql`update public.congelaciones set desde = public.hoy_estudio() - ${dias}::int where id = ${id}`;
  return id;
}

test('sin tope, cada día congelado alarga el plan (como siempre)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await crearSuscripcion(admin, studio.studioId, socio);
    await admin.from('suscripciones').update({ fecha_fin: '2030-01-01' }).eq('id', sus);
    const cong = await congelarHaceDias(studio, sus, 40);
    const r = await studio.comoPropietaria.rpc('descongelar_suscripcion', { p_suscripcion_id: sus, p_studio_id: studio.studioId });
    assert.ok(!r.error, r.error?.message);
    assert.equal(await fechaFin(sus), '2030-02-10', '2030-01-01 + 40 días');
    const { data } = await admin.from('congelaciones').select('dias_aplicados').eq('id', cong).single();
    assert.equal((data as { dias_aplicados: number }).dias_aplicados, 40);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('con un máximo, los días de más no se suman al plan, y el historial dice los aplicados', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await admin.from('studios').update({ congelacion_max_dias: 15 }).eq('id', studio.studioId);
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await crearSuscripcion(admin, studio.studioId, socio);
    await admin.from('suscripciones').update({ fecha_fin: '2030-01-01' }).eq('id', sus);
    const cong = await congelarHaceDias(studio, sus, 40);
    const r = await studio.comoPropietaria.rpc('descongelar_suscripcion', { p_suscripcion_id: sus, p_studio_id: studio.studioId });
    assert.ok(!r.error, r.error?.message);
    assert.equal(await fechaFin(sus), '2030-01-16', '2030-01-01 + 15 días, no 40');
    const { data } = await admin.from('congelaciones').select('dias_aplicados').eq('id', cong).single();
    assert.equal((data as { dias_aplicados: number }).dias_aplicados, 15);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('una congelación más corta que el máximo alarga solo lo que duró', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await admin.from('studios').update({ congelacion_max_dias: 30 }).eq('id', studio.studioId);
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await crearSuscripcion(admin, studio.studioId, socio);
    await admin.from('suscripciones').update({ fecha_fin: '2030-01-01' }).eq('id', sus);
    await congelarHaceDias(studio, sus, 10);
    const r = await studio.comoPropietaria.rpc('descongelar_suscripcion', { p_suscripcion_id: sus, p_studio_id: studio.studioId });
    assert.ok(!r.error, r.error?.message);
    assert.equal(await fechaFin(sus), '2030-01-11');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('con la congelación apagada no se congela una cuota nueva, pero la ya congelada se reanuda', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socio = await crearSocia(admin, studio.studioId);
    const yaCongelada = await crearSuscripcion(admin, studio.studioId, socio);
    const otra = await crearSuscripcion(admin, studio.studioId, await crearSocia(admin, studio.studioId));
    await congelarHaceDias(studio, yaCongelada, 5);

    await admin.from('studios').update({ congelacion_permitida: false }).eq('id', studio.studioId);
    const intento = await studio.comoPropietaria.rpc('congelar_suscripcion', { p_id: idCong(), p_suscripcion_id: otra, p_studio_id: studio.studioId, p_motivo: 'x' });
    assert.ok(intento.error, 'la política apagada debe frenarlo');
    assert.match(intento.error?.message ?? '', /CONGELACION_NO_PERMITIDA/);
    const { data: estado } = await admin.from('suscripciones').select('estado').eq('id', otra).single();
    assert.notEqual((estado as { estado: string }).estado, 'PAUSADA', 'no se ha pausado nada');

    const reanuda = await studio.comoPropietaria.rpc('descongelar_suscripcion', { p_suscripcion_id: yaCongelada, p_studio_id: studio.studioId });
    assert.ok(!reanuda.error, reanuda.error?.message);
    const { data: despues } = await admin.from('suscripciones').select('estado').eq('id', yaCongelada).single();
    assert.equal((despues as { estado: string }).estado, 'ACTIVA');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el máximo se mueve de 1 a 365 días', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    for (const malo of [0, 366, -1]) {
      const r = await admin.from('studios').update({ congelacion_max_dias: malo }).eq('id', studio.studioId);
      assert.ok(r.error, `${malo} no debería valer`);
    }
    const ok = await admin.from('studios').update({ congelacion_max_dias: 365 }).eq('id', studio.studioId);
    assert.ok(!ok.error, ok.error?.message);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('la propietaria puede guardar la política desde Configuración: authenticated escribe esas columnas de studios', async () => {
  // `studios` solo se escribe por lista blanca de columnas: sin el grant, guardar la política da 42501 aunque la RLS deje.
  const r = await sql<{ permitida: boolean; maximo: boolean }[]>`
    select has_column_privilege('authenticated', 'public.studios', 'congelacion_permitida', 'UPDATE') as permitida,
           has_column_privilege('authenticated', 'public.studios', 'congelacion_max_dias', 'UPDATE') as maximo`;
  assert.deepEqual(r[0], { permitida: true, maximo: true });
  const studio = await crearStudioConPropietaria(admin);
  try {
    const guarda = await studio.comoPropietaria.from('studios').update({ congelacion_permitida: false, congelacion_max_dias: 20 }).eq('id', studio.studioId).select('id');
    assert.ok(!guarda.error, guarda.error?.message);
    assert.equal(guarda.data?.length, 1, 'la RLS tiene que dejarla escribir su propio estudio');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('reintentar congelar lo que ya está congelado es idempotente aunque la política se apague entre medias', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sus = await crearSuscripcion(admin, studio.studioId, await crearSocia(admin, studio.studioId));
    const id = idCong();
    const primera = await studio.comoPropietaria.rpc('congelar_suscripcion', { p_id: id, p_suscripcion_id: sus, p_studio_id: studio.studioId, p_motivo: 'x' });
    assert.ok(!primera.error, primera.error?.message);
    await admin.from('studios').update({ congelacion_permitida: false }).eq('id', studio.studioId);
    const reintento = await studio.comoPropietaria.rpc('congelar_suscripcion', { p_id: idCong(), p_suscripcion_id: sus, p_studio_id: studio.studioId, p_motivo: 'x' });
    assert.ok(!reintento.error, `un doble clic no debería dar error: ${reintento.error?.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
