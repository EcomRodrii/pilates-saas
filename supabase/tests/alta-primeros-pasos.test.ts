// «Pon en marcha tu estudio» y el correo de la primera clase (migración
// 20261021160000_alta_primeros_pasos.sql), contra Postgres de verdad (job
// `calidad-rls`):
//
//  · el embudo admite las dos marcas nuevas (`recorrido_visto`,
//    `correo_primera_clase`) y sigue rechazando lo que no está en la lista;
//  · la guarda del job `altas-sin-terminar` llama cuando hay un estudio del alta
//    nueva de entre 24 y 72 h sin clase reservable ni el correo, y deja de
//    llamar en cuanto consta uno de los dos (si no, llamaría cada hora para
//    nada), igual que con las altas a medias de siempre;
//  · la guarda es solo del servidor, y el job la usa.
//
// La regla de quién recibe el correo, en lib/alta/correo-primera-clase.test.ts.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
after(async () => { await sql.end(); });

const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function guarda(studioId: string): Promise<boolean> {
  const [r] = await sql`select public.cron_hay_trabajo_altas(${studioId}) as v`;
  return r.v as boolean;
}

/**
 * Un estudio como lo deja el alta: su dueña con su fila de `altas_estudio`
 * (versión dada y el alta TERMINADA: el recordatorio de alta a medias no toca)
 * y creado hace `horas`.
 */
async function estudioDelAlta(version: 'v1' | 'v2' | 'v2_prueba', horas: number): Promise<StudioFixture> {
  const studio = await crearStudioConPropietaria(admin);
  const { error } = await admin.from('altas_estudio').upsert({
    auth_user_id: studio.authUserId, origen: 'registro', iniciada_en: haceHoras(horas + 1), version,
    recordatorio_descartado: 'terminada',
  }, { onConflict: 'auth_user_id' });
  assert.ok(!error, `altas_estudio: ${error?.message}`);
  await sql`update public.studios set creado_en = ${haceHoras(horas)} where id = ${studio.studioId}`;
  return studio;
}

async function conEstudio(version: 'v1' | 'v2' | 'v2_prueba', horas: number, prueba: (s: StudioFixture) => Promise<void>) {
  const studio = await estudioDelAlta(version, horas);
  try { await prueba(studio); } finally {
    await sql`delete from public.altas_estudio where auth_user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
}

test('el embudo admite las dos marcas nuevas y sigue con su lista cerrada', async () => {
  await conEstudio('v2', 1, async ({ studioId }) => {
    for (const paso of ['recorrido_visto', 'correo_primera_clase']) {
      const { error } = await admin.from('embudo_alta').insert({ studio_id: studioId, paso });
      assert.ok(!error, `${paso}: ${error?.message}`);
    }
    const { error } = await admin.from('embudo_alta').insert({ studio_id: studioId, paso: 'lo_que_sea' });
    assert.ok(error, 'un paso fuera de la lista no entra');
  });
});

test('alta nueva entre 24 y 72 h sin clase reservable: la guarda llama', async () => {
  await conEstudio('v2', 30, async ({ studioId }) => {
    assert.equal(await guarda(studioId), true);
  });
  // La versión de prueba también (el fundador lo ve antes de abrirlo).
  await conEstudio('v2_prueba', 30, async ({ studioId }) => {
    assert.equal(await guarda(studioId), true);
  });
});

test('fuera de la ventana, o con el alta de siempre, no llama', async () => {
  await conEstudio('v2', 10, async ({ studioId }) => { assert.equal(await guarda(studioId), false, 'aún no es el día siguiente'); });
  await conEstudio('v2', 80, async ({ studioId }) => { assert.equal(await guarda(studioId), false, 'pasadas las 72 h'); });
  await conEstudio('v1', 30, async ({ studioId }) => { assert.equal(await guarda(studioId), false, 'el alta de siempre tiene su aviso de las 48 h'); });
});

test('en cuanto consta la clase reservable, o el correo, deja de llamar', async () => {
  await conEstudio('v2', 30, async ({ studioId }) => {
    assert.equal(await guarda(studioId), true);
    const { error } = await admin.from('embudo_alta').insert({ studio_id: studioId, paso: 'clase_reservable' });
    assert.ok(!error, error?.message);
    assert.equal(await guarda(studioId), false);
  });
  await conEstudio('v2', 30, async ({ studioId }) => {
    const { error } = await admin.from('embudo_alta').insert({ studio_id: studioId, paso: 'correo_primera_clase' });
    assert.ok(!error, error?.message);
    assert.equal(await guarda(studioId), false);
  });
});

test('una sede de cadena no pasa por el alta: no llama', async () => {
  await conEstudio('v2', 30, async ({ studioId, authUserId }) => {
    const cadenaId = `cad-pp-${process.pid}-${Date.now()}`;
    const { error: e1 } = await admin.from('cadenas').insert({ id: cadenaId, nombre: 'Cadena de prueba', owner_auth_user_id: authUserId });
    assert.ok(!e1, e1?.message);
    try {
      await sql`update public.studios set cadena_id = ${cadenaId} where id = ${studioId}`;
      assert.equal(await guarda(studioId), false);
    } finally {
      await sql`update public.studios set cadena_id = null where id = ${studioId}`;
      await sql`delete from public.cadenas where id = ${cadenaId}`;
    }
  });
});

test('las altas a medias siguen llamando como antes', async () => {
  await conEstudio('v1', 1, async ({ studioId, authUserId }) => {
    assert.equal(await guarda(studioId), false);
    await sql`update public.altas_estudio set recordatorio_descartado = null, iniciada_en = ${haceHoras(30)} where auth_user_id = ${authUserId}`;
    assert.equal(await guarda(studioId), true, 'alta de hace 30 h sin recordatorio');
  });
});

test('la guarda es solo del servidor, y el job la usa', async () => {
  const [p] = await sql<{ anon: boolean; auth: boolean; srv: boolean }[]>`
    select has_function_privilege('anon', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') as anon,
           has_function_privilege('authenticated', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') as auth,
           has_function_privilege('service_role', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') as srv`;
  assert.deepEqual(p, { anon: false, auth: false, srv: true });
  const [job] = await sql<{ command: string; schedule: string }[]>`select command, schedule from cron.job where jobname = 'altas-sin-terminar'`;
  assert.ok(job, 'el job existe');
  assert.match(job.command, /where public\.cron_hay_trabajo_altas\(\);/);
  assert.match(job.command, /api\/cron\/altas-sin-terminar/);
  assert.equal(job.schedule, '23 * * * *', 'la cadencia no cambia');
});
