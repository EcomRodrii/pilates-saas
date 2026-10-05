// El libro de consumos del asistente (migr 20261005213749_asistente_y_consumos_ia.sql),
// contra Postgres de verdad (job `calidad-rls`): la cuota por plan, la reserva
// fail-closed, la fórmula de unidades, el reparto cuota → pack → sin saldo, la
// idempotencia del cierre, los topes en dólares y quién lee qué.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearInstructora, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora, sqlLocal,
  type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

const MES = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

async function reservar(studioId: string, coste = 0.15, authUserId: string | null = null) {
  const { data, error } = await admin.rpc('ia_reservar_consulta', {
    p_studio_id: studioId, p_auth_user_id: authUserId, p_origen: 'ASISTENTE', p_conversacion_id: null,
    p_modelo: 'claude-haiku-4-5', p_coste_max_usd: coste,
  });
  assert.ok(!error, error?.message);
  return (data as { consumo_id: string | null; codigo: string; disponibles: number }[])[0];
}

async function cerrar(studioId: string, consumoId: string, estado: string, coste: number) {
  const { data, error } = await admin.rpc('ia_cerrar_consulta', {
    p_consumo_id: consumoId, p_studio_id: studioId, p_estado: estado, p_input: 100, p_cache_read: 4000,
    p_cache_creation: 0, p_output: 200, p_coste_usd: coste, p_n_llamadas: 2, p_n_herramientas: 1, p_codigo_error: null, p_herramientas: ['contar_alumnas'],
  });
  assert.ok(!error, error?.message);
  return (data as { unidades_cobradas: number; disponibles: number }[])[0];
}

async function saldo(studioId: string) {
  const { data, error } = await admin.rpc('ia_saldo_consultas', { p_studio_id: studioId });
  assert.ok(!error, error?.message);
  return (data as { cuota: number; usadas: number; en_vuelo: number; disponibles: number; en_prueba: boolean; renueva_el: string | null }[])[0];
}

async function consumidas(studioId: string, n: number, periodo = MES()) {
  await sql`insert into public.ia_consumos (studio_id, origen, modelo, estado, periodo, coste_max_usd, coste_usd, unidades, unidades_cuota)
            select ${studioId}, 'ASISTENTE', 'm', 'CONSUMIDA', ${periodo}, 0.15, 0, 1, 1 from generate_series(1, ${n})`;
}

async function conPlan(f: StudioFixture, plan: string, status: string | null, sub: string | null) {
  await sql`update public.studios set plan = ${plan}, subscription_status = ${status}, subscription_id = ${sub} where id = ${f.studioId}`;
}

test('la cuota: Founding Studio 50, Estudio 200, Cadena 500, y la prueba local 30 en total', async () => {
  const f = await crearStudioConPropietaria(admin);
  try {
    await conPlan(f, 'BASE', 'active', 'sub_x');
    assert.equal((await saldo(f.studioId)).cuota, 50);
    await conPlan(f, 'ESTUDIO', 'active', 'sub_x');
    assert.equal((await saldo(f.studioId)).cuota, 200);
    await conPlan(f, 'CADENA', 'active', 'sub_x');
    assert.equal((await saldo(f.studioId)).cuota, 500);
    // La prueba local (sin suscripción de Stripe) tiene su tope, y no se renueva por mes.
    await conPlan(f, 'ESTUDIO', 'trialing', null);
    await consumidas(f.studioId, 29, '2000-01');
    const s = await saldo(f.studioId);
    assert.equal(s.cuota, 30);
    assert.equal(s.en_prueba, true);
    assert.equal(s.disponibles, 1, 'las consumidas en otro mes cuentan en la prueba');
    assert.equal(s.renueva_el, null);
  } finally {
    await limpiarFixtures(admin, [f]);
  }
});

test('reserva fail-closed, fórmula de unidades e idempotencia del cierre', async () => {
  const f = await crearStudioConPropietaria(admin);
  try {
    await conPlan(f, 'BASE', 'active', 'sub_x');
    const r = await reservar(f.studioId);
    assert.equal(r.codigo, 'OK');
    assert.equal((await saldo(f.studioId)).en_vuelo, 1, 'la reserva viva cuenta 1');
    assert.equal((await cerrar(f.studioId, r.consumo_id!, 'CONSUMIDA', 0.031)).unidades_cobradas, 2);
    // Repetir el cierre no cobra otra vez ni cambia nada.
    assert.equal((await cerrar(f.studioId, r.consumo_id!, 'CONSUMIDA', 0.5)).unidades_cobradas, 2);
    const r2 = await reservar(f.studioId);
    assert.equal((await cerrar(f.studioId, r2.consumo_id!, 'CONSUMIDA', 0.5)).unidades_cobradas, 5);
    const r3 = await reservar(f.studioId);
    assert.equal((await cerrar(f.studioId, r3.consumo_id!, 'FALLIDA', 0.02)).unidades_cobradas, 0);
    assert.equal((await saldo(f.studioId)).disponibles, 43);

    // Una reserva vieja (proceso muerto) cuenta 5; pasados 10 minutos, la limpia la siguiente reserva.
    await sql`insert into public.ia_consumos (studio_id, origen, modelo, periodo, coste_max_usd, creado_en)
              values (${f.studioId}, 'ASISTENTE', 'm', ${MES()}, 0.15, now() - interval '6 minutes')`;
    assert.equal((await saldo(f.studioId)).en_vuelo, 5);
    await sql`update public.ia_consumos set creado_en = now() - interval '11 minutes' where studio_id = ${f.studioId} and estado = 'RESERVADA'`;
    await reservar(f.studioId);
    const [h] = await sql<{ estado: string; codigo_error: string }[]>`
      select estado, codigo_error from public.ia_consumos where studio_id = ${f.studioId} and codigo_error = 'HUERFANA'`;
    assert.equal(h?.estado, 'FALLIDA');

    // Sin saldo: no se reserva (y por tanto no se llama a Anthropic).
    await consumidas(f.studioId, 50);
    assert.equal((await reservar(f.studioId)).codigo, 'SIN_SALDO');
  } finally {
    await limpiarFixtures(admin, [f]);
  }
});

test('packs: solo los vigentes y activos, el que antes caduca primero, y el reparto cuota → pack → sin saldo', async () => {
  const f = await crearStudioConPropietaria(admin);
  try {
    await conPlan(f, 'ESTUDIO', 'active', 'sub_x');
    await consumidas(f.studioId, 198);
    await sql`insert into public.ia_packs (studio_id, unidades, unidades_usadas, precio_eur, comprado_en, caduca_en, estado) values
      (${f.studioId}, 100, 0, 9, now() - interval '13 months', now() - interval '1 month', 'ACTIVO'),
      (${f.studioId}, 100, 0, 9, now(), now() + interval '12 months', 'REEMBOLSADO'),
      (${f.studioId}, 100, 99, 9, now(), now() + interval '6 months', 'ACTIVO'),
      (${f.studioId}, 300, 300, 24, now(), now() + interval '12 months', 'ACTIVO')`;
    assert.equal((await saldo(f.studioId)).disponibles, 3, '2 de cuota + 1 del pack vigente');
    const r = await reservar(f.studioId);
    await cerrar(f.studioId, r.consumo_id!, 'CONSUMIDA', 0.15);
    const [c] = await sql<{ unidades: number; unidades_cuota: number; unidades_pack: number; unidades_sin_saldo: number }[]>`
      select unidades, unidades_cuota, unidades_pack, unidades_sin_saldo from public.ia_consumos where id = ${r.consumo_id!}`;
    assert.deepEqual({ ...c }, { unidades: 5, unidades_cuota: 2, unidades_pack: 1, unidades_sin_saldo: 2 });
  } finally {
    await limpiarFixtures(admin, [f]);
  }
});

test('topes diarios en dólares: 3 $ por estudio y 50 $ en total', async () => {
  const f = await crearStudioConPropietaria(admin);
  const otro = await crearStudioConPropietaria(admin);
  try {
    await conPlan(f, 'CADENA', 'active', 'sub_x');
    await sql`insert into public.ia_consumos (studio_id, origen, modelo, estado, periodo, coste_max_usd, coste_usd)
              values (${f.studioId}, 'ASISTENTE', 'm', 'CONSUMIDA', ${MES()}, 0.15, 2.9)`;
    assert.equal((await reservar(f.studioId)).codigo, 'TOPE_DIARIO_ESTUDIO');
    await sql`update public.ia_consumos set coste_usd = 0 where studio_id = ${f.studioId}`;
    await sql`insert into public.ia_consumos (studio_id, origen, modelo, estado, periodo, coste_max_usd, coste_usd)
              values (${otro.studioId}, 'ASISTENTE', 'm', 'CONSUMIDA', ${MES()}, 0.15, 49.95)`;
    assert.equal((await reservar(f.studioId)).codigo, 'TOPE_DIARIO_GLOBAL');
  } finally {
    await limpiarFixtures(admin, [f, otro]);
  }
});

test('RLS: la gerente solo ve lo suyo, recepción nada, los packs solo la propietaria, y nadie escribe desde el navegador', async () => {
  const f = await crearStudioConPropietaria(admin);
  const gerente = await crearInstructora(admin, f.studioId, 'MANAGER');
  const recepcion = await crearInstructora(admin, f.studioId, 'RECEPCION');
  try {
    await conPlan(f, 'ESTUDIO', 'active', 'sub_x');
    await reservar(f.studioId, 0.15, f.authUserId);
    await reservar(f.studioId, 0.15, gerente.authUserId);
    await sql`insert into public.ia_packs (studio_id, unidades, precio_eur, caduca_en) values (${f.studioId}, 100, 9, now() + interval '12 months')`;
    const [conv] = await sql<{ id: string }[]>`
      insert into public.asistente_conversaciones (studio_id, auth_user_id, rol) values (${f.studioId}, ${f.authUserId}, 'PROPIETARIO') returning id`;
    await sql`insert into public.asistente_mensajes (conversacion_id, studio_id, orden, rol, contenido) values (${conv.id}, ${f.studioId}, 0, 'user', '[]')`;

    const prop = await f.comoPropietaria.from('ia_consumos').select('id');
    assert.equal(prop.data?.length, 2, prop.error?.message);
    assert.equal((await f.comoPropietaria.from('ia_packs').select('id')).data?.length, 1);
    assert.equal((await f.comoPropietaria.from('asistente_mensajes').select('id')).data?.length, 1);

    assert.equal((await gerente.comoInstructora.from('ia_consumos').select('id')).data?.length, 1, 'la gerente ve solo sus consumos');
    assert.equal((await gerente.comoInstructora.from('ia_packs').select('id')).data?.length ?? 0, 0);
    assert.equal((await gerente.comoInstructora.from('asistente_conversaciones').select('id')).data?.length ?? 0, 0, 'ni las conversaciones de la propietaria');
    assert.equal((await gerente.comoInstructora.from('asistente_mensajes').select('id')).data?.length ?? 0, 0);

    for (const t of ['ia_consumos', 'ia_packs', 'asistente_conversaciones', 'asistente_mensajes']) {
      assert.equal((await recepcion.comoInstructora.from(t).select('id')).data?.length ?? 0, 0, `recepción ve ${t}`);
    }
    const escritura = await f.comoPropietaria.from('ia_packs').insert({ studio_id: f.studioId, unidades: 1000, precio_eur: 0, caduca_en: '2099-01-01' });
    assert.ok(escritura.error, 'la propietaria no puede regalarse un pack desde el navegador');
    const rpc = await f.comoPropietaria.rpc('ia_reservar_consulta', {
      p_studio_id: f.studioId, p_auth_user_id: f.authUserId, p_origen: 'ASISTENTE', p_conversacion_id: null, p_modelo: 'm', p_coste_max_usd: 0.15,
    });
    assert.ok(rpc.error, 'ni reservar consultas por su cuenta');

    const politicas = await sql<{ tabla: string }[]>`
      select c.relname as tabla from pg_policy p join pg_class c on c.oid = p.polrelid
       where p.polname = 'exige_doble_factor' and not p.polpermissive
         and c.relname in ('ia_consumos', 'ia_packs', 'asistente_conversaciones', 'asistente_mensajes')`;
    assert.equal(politicas.length, 4);
  } finally {
    await limpiarInstructora(admin, gerente);
    await limpiarInstructora(admin, recepcion);
    await limpiarFixtures(admin, [f]);
  }
});
