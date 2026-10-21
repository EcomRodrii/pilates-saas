// La primera clase del alta nueva (migración 20261021134000_alta_primera_clase.sql),
// contra Postgres de verdad (job `calidad-rls`):
//
//  · Solo el servidor: ni anon ni authenticated (ni la propietaria de su propio
//    estudio) la ejecutan.
//  · Crea todo a la vez: tipo, sala, su ficha, la serie con renovación
//    automática (y su periodo 1, del trigger), las clases y la tarifa activa; y
//    «En el estudio» o «gratis» dejan reservar sin plan.
//  · TODO O NADA: un solape (23P01) o una fecha pasada no dejan ni el tipo ni la
//    sala ni la tarifa.
//  · Idempotente por intento, y el estudio manda: un id de otro estudio no
//    entra, y el mismo intento en dos estudios no choca.
//
// Se llama con `admin` (service_role) porque es como la llama la app
// (app/api/alta/primera-clase). La lógica del formulario está en
// lib/alta/primera-clase.test.ts.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal, type StudioFixture } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
after(async () => { await sql.end(); });

/** Inicio y fin de una clase a las `hora` de Madrid, `dias` después de hoy (en Madrid), como ISO. */
async function clase(dias: number, hora = '18:30', minutos = 55): Promise<{ inicio: string; fin: string }> {
  const [r] = await sql<{ inicio: Date; fin: Date }[]>`
    select ((public.hoy_estudio() + ${dias}::int) + ${hora}::time) at time zone 'Europe/Madrid' as inicio,
           ((public.hoy_estudio() + ${dias}::int) + ${hora}::time) at time zone 'Europe/Madrid' + make_interval(mins => ${minutos}::int) as fin`;
  return { inicio: r.inicio.toISOString(), fin: r.fin.toISOString() };
}

async function semanal(dias: number, hora = '18:30') {
  return Promise.all([0, 7, 14, 21].map(d => clase(dias + d, hora)));
}

function plan(o: { intento?: string; sesiones: { inicio: string; fin: string }[]; propia?: string } & Record<string, unknown>) {
  const { intento, sesiones, propia, ...resto } = o;
  return {
    intento: intento ?? randomUUID(),
    gratis: false,
    cobro: 'estudio',
    semanal: sesiones.length > 1,
    aforo: 8,
    tipo: { nombre: 'Reformer para principiantes', color: '#F7A6C4' },
    sala: { nombre: 'Sala 1', color: '#7FB2E5' },
    instructor: propia ? { propia: true, auth_user_id: propia, nombre: 'Prueba', email: 'prueba@example.com' } : { propia: false, nombre: 'Marta' },
    sesiones,
    tarifa: { tipo: 'PUNTUAL', nombre: 'Clase suelta', precio: 20, sesiones: 1 },
    ...resto,
  };
}

const rpc = (studioId: string, p: unknown) => admin.rpc('alta_primera_clase', { p_studio_id: studioId, p_plan: p });

async function cuenta(studioId: string) {
  const [c] = await sql<{ tipos: number; salas: number; ins: number; ses: number; series: number; planes: number; exigir: boolean | null }[]>`
    select (select count(*)::int from public.tipos_clase where studio_id = ${studioId}) as tipos,
           (select count(*)::int from public.salas where studio_id = ${studioId}) as salas,
           (select count(*)::int from public.instructores where studio_id = ${studioId}) as ins,
           (select count(*)::int from public.sesiones where studio_id = ${studioId}) as ses,
           (select count(*)::int from public.series where studio_id = ${studioId}) as series,
           (select count(*)::int from public.planes_tarifa where studio_id = ${studioId}) as planes,
           (select reserva_exigir_plan from public.studios where id = ${studioId}) as exigir`;
  return c;
}

async function conEstudio(prueba: (s: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try { await prueba(studio); } finally { await limpiarFixtures(admin, [studio]); }
}

test('solo el servidor: ni anon, ni authenticated, ni la propietaria de su propio estudio', async () => {
  const [p] = await sql<{ anon: boolean; auth: boolean; srv: boolean }[]>`
    select has_function_privilege('anon', 'public.alta_primera_clase(text, jsonb)', 'EXECUTE') as anon,
           has_function_privilege('authenticated', 'public.alta_primera_clase(text, jsonb)', 'EXECUTE') as auth,
           has_function_privilege('service_role', 'public.alta_primera_clase(text, jsonb)', 'EXECUTE') as srv`;
  assert.deepEqual(p, { anon: false, auth: false, srv: true });
  await conEstudio(async (s) => {
    const r = await s.comoPropietaria.rpc('alta_primera_clase', { p_studio_id: s.studioId, p_plan: plan({ sesiones: [await clase(2)] }) });
    assert.ok(r.error, 'la propietaria no la ejecuta desde el navegador');
    assert.equal((await cuenta(s.studioId)).ses, 0);
  });
});

test('crea todo a la vez: la clase semanal con renovación automática, su ficha y la tarifa activa', async () => {
  await conEstudio(async (s) => {
    const r = await rpc(s.studioId, plan({ sesiones: await semanal(2), propia: s.authUserId }));
    assert.ok(!r.error, r.error?.message);
    const res = r.data as Record<string, unknown>;
    assert.equal(res.ok, true);
    assert.equal(res.sesiones, 4);
    assert.equal(res.creadas, 4);
    assert.equal(res.repetida, false);

    const ses = await sql<{ studio_id: string; tipo_clase_id: string; sala_id: string; instructor_id: string; serie_id: string; aforo_maximo: number; hora: string }[]>`
      select studio_id, tipo_clase_id, sala_id, instructor_id, serie_id, aforo_maximo,
             to_char(inicio at time zone 'Europe/Madrid', 'HH24:MI') as hora
        from public.sesiones where studio_id = ${s.studioId} order by inicio`;
    assert.equal(ses.length, 4);
    assert.ok(ses.every(x => x.tipo_clase_id === res.tipo_clase_id && x.sala_id === res.sala_id && x.instructor_id === res.instructor_id && x.serie_id === res.serie_id));
    assert.ok(ses.every(x => x.aforo_maximo === 8 && x.hora === '18:30'), 'las 18:30 de Madrid, también tras el cambio de hora');

    const [serie] = await sql<{ studio_id: string; semanas_periodo: number; renovacion_automatica: boolean; no_renovar: boolean }[]>`
      select studio_id, semanas_periodo, renovacion_automatica, no_renovar from public.series where id = ${res.serie_id as string}`;
    assert.deepEqual({ ...serie }, { studio_id: s.studioId, semanas_periodo: 4, renovacion_automatica: true, no_renovar: false },
      'sin fin: la renueva sola el barrido de series');
    const periodos = await sql<{ periodo: number; sesiones_creadas: number; origen: string }[]>`
      select periodo, sesiones_creadas, origen from public.series_periodos where serie_id = ${res.serie_id as string}`;
    assert.deepEqual(periodos.map(p => ({ ...p })), [{ periodo: 1, sesiones_creadas: 4, origen: 'creacion' }], 'el trigger da de alta su periodo 1');

    const [ficha] = await sql<{ studio_id: string; auth_user_id: string; rol: string; activo: boolean }[]>`
      select studio_id, auth_user_id, rol, activo from public.instructores where id = ${res.instructor_id as string}`;
    assert.deepEqual({ ...ficha }, { studio_id: s.studioId, auth_user_id: s.authUserId, rol: 'PROPIETARIO', activo: true });

    const [tarifa] = await sql<{ studio_id: string; tipo: string; precio: string; sesiones: number; activo: boolean }[]>`
      select studio_id, tipo, precio::text, sesiones, activo from public.planes_tarifa where id = ${res.plan_id as string}`;
    assert.deepEqual({ ...tarifa }, { studio_id: s.studioId, tipo: 'PUNTUAL', precio: '20.00', sesiones: 1, activo: true });

    const [tipo] = await sql<{ nombre: string; duracion_minutos: number; aforo_por_defecto: number }[]>`
      select nombre, duracion_minutos, aforo_por_defecto from public.tipos_clase where id = ${res.tipo_clase_id as string}`;
    assert.deepEqual({ ...tipo }, { nombre: 'Reformer para principiantes', duracion_minutos: 55, aforo_por_defecto: 8 });

    assert.equal((await cuenta(s.studioId)).exigir, false, '«En el estudio»: reservan sin comprar nada online');
  });
});

test('idempotente: la misma petición otra vez no crea nada', async () => {
  await conEstudio(async (s) => {
    const p = plan({ sesiones: await semanal(3) });
    const a = await rpc(s.studioId, p);
    assert.ok(!a.error, a.error?.message);
    const antes = await cuenta(s.studioId);
    const b = await rpc(s.studioId, p);
    assert.ok(!b.error, b.error?.message);
    assert.equal((b.data as Record<string, unknown>).repetida, true);
    assert.deepEqual(await cuenta(s.studioId), antes);
    assert.deepEqual(antes, { tipos: 1, salas: 1, ins: 1, ses: 4, series: 1, planes: 1, exigir: false });
  });
});

test('todo o nada: un solape con una clase que ya está deshace el tipo, la sala, la ficha y la tarifa', async () => {
  await conEstudio(async (s) => {
    // Ya tiene su «Sala 1» con una clase el día de la tercera semana, a la misma hora.
    const salaId = `sala-${randomUUID()}`;
    const { error: e1 } = await admin.from('salas').insert({ id: salaId, studio_id: s.studioId, nombre: 'Sala 1', capacidad: 8 });
    assert.ok(!e1, e1?.message);
    const choca = await clase(2 + 14, '18:00', 60);
    const { error: e2 } = await admin.from('sesiones').insert({ id: `ses-${randomUUID()}`, studio_id: s.studioId, sala_id: salaId, inicio: choca.inicio, fin: choca.fin, aforo_maximo: 8 });
    assert.ok(!e2, e2?.message);
    const antes = await cuenta(s.studioId);

    const r = await rpc(s.studioId, plan({ sesiones: await semanal(2), gratis: false, cobro: 'estudio' }));
    assert.equal(r.error?.code, '23P01', `el solape de sala: ${r.error?.message}`);
    assert.match(r.error?.message ?? '', /sesiones_sala_sin_solape/);
    assert.deepEqual(await cuenta(s.studioId), antes, 'no queda nada a medias: ni tipo, ni ficha, ni tarifa, ni serie, ni exigir_plan cambiado');
  });
});

test('una fecha anterior a hoy en Madrid, o una clase que ya empezó, no entra (ni nada de lo demás)', async () => {
  await conEstudio(async (s) => {
    const ayer = await rpc(s.studioId, plan({ sesiones: [await clase(-1)] }));
    assert.match(ayer.error?.message ?? '', /FECHA_PASADA/);
    const haceUnaHora = await sql<{ inicio: Date; fin: Date }[]>`select now() - interval '1 hour' as inicio, now() as fin`;
    const empezada = await rpc(s.studioId, plan({ sesiones: [{ inicio: haceUnaHora[0].inicio.toISOString(), fin: haceUnaHora[0].fin.toISOString() }] }));
    assert.match(empezada.error?.message ?? '', /FECHA_PASADA/);
    assert.deepEqual(await cuenta(s.studioId), { tipos: 0, salas: 0, ins: 0, ses: 0, series: 0, planes: 0, exigir: true });
  });
});

test('el estudio manda: un id de otro estudio no entra, y el mismo intento en dos estudios no choca', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  try {
    const tipoB = `tc-${randomUUID()}`;
    const { error } = await admin.from('tipos_clase').insert({ id: tipoB, studio_id: b.studioId, nombre: 'De B' });
    assert.ok(!error, error?.message);
    const ajeno = await rpc(a.studioId, plan({ sesiones: [await clase(2)], tipo: { id: tipoB } }));
    assert.match(ajeno.error?.message ?? '', /TIPO_AJENO/);
    assert.equal((await cuenta(a.studioId)).ses, 0);

    const intento = randomUUID();
    const enA = await rpc(a.studioId, plan({ intento, sesiones: [await clase(2)] }));
    const enB = await rpc(b.studioId, plan({ intento, sesiones: [await clase(2)] }));
    assert.ok(!enA.error && !enB.error, enA.error?.message ?? enB.error?.message);
    const ra = enA.data as Record<string, string>, rb = enB.data as Record<string, string>;
    assert.notEqual(ra.tipo_clase_id, rb.tipo_clase_id);
    for (const [id, tabla, estudio] of [[ra.tipo_clase_id, 'tipos_clase', a.studioId], [rb.sala_id, 'salas', b.studioId], [ra.plan_id, 'planes_tarifa', a.studioId]] as const) {
      const [f] = await sql<{ studio_id: string }[]>`select studio_id from ${sql(`public.${tabla}`)} where id = ${id}`;
      assert.equal(f.studio_id, estudio, `${tabla} en su estudio`);
    }
  } finally {
    await limpiarFixtures(admin, [a, b]);
  }
});

test('exigir plan: «Online» no lo toca, «gratis» lo quita y no pone tarifa, y 0 € sin «gratis» no entra', async () => {
  await conEstudio(async (s) => {
    const antes = (await cuenta(s.studioId)).exigir;
    assert.equal(antes, true, 'un estudio nace exigiendo plan');
    const online = await rpc(s.studioId, plan({ sesiones: [await clase(2)], cobro: 'online' }));
    assert.ok(!online.error, online.error?.message);
    assert.equal((await cuenta(s.studioId)).exigir, antes, '«Online, con tarjeta»: no se toca');

    const cero = await rpc(s.studioId, plan({ sesiones: [await clase(3)], tarifa: { tipo: 'PUNTUAL', nombre: 'Clase suelta', precio: 0, sesiones: 1 } }));
    assert.match(cero.error?.message ?? '', /SIN_PRECIO/);

    const gratis = await rpc(s.studioId, plan({ sesiones: [await clase(4)], cobro: 'online', gratis: true, tarifa: null, tipo: { nombre: 'Clase abierta' } }));
    assert.ok(!gratis.error, gratis.error?.message);
    assert.equal((gratis.data as Record<string, unknown>).plan_id, null, 'gratis: sin tarifa');
    const c = await cuenta(s.studioId);
    assert.equal(c.exigir, false, 'gratis: se reserva sin pagar');
    assert.equal(c.planes, 1, 'solo la de la clase de pago');
    // El tipo y la sala se reutilizan por nombre; la clase no semanal no lleva serie.
    assert.equal(c.salas, 1);
    assert.equal(c.series, 0);
  });
});
