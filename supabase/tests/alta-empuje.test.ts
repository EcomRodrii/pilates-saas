// Los dos correos de «después de la primera clase» (migración
// 20261031100000_alta_empuje_compartir_y_alumnas.sql), contra Postgres de verdad
// (job `calidad-rls`):
//
//  · el embudo admite las dos marcas nuevas y sigue rechazando lo que no está en
//    la lista;
//  · la guarda del job `altas-sin-terminar` llama cuando la clase es reservable
//    desde hace 24 h-7 días y el enlace no se ha compartido ni se ha mandado el
//    correo («compartir»), y cuando el enlace se compartió hace 48 h-10 días, el
//    estudio no tiene ninguna reserva y no se ha mandado el correo («alumnas»);
//  · y deja de llamar en cuanto consta la marca, el enlace o una reserva.
//
// La regla de quién recibe cada correo, en lib/alta/correo-empuje.test.ts.
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

/** Un paso del embudo apuntado con la hora que se quiera (la base pone `now()` por defecto). */
async function paso(studioId: string, nombre: string, horas: number) {
  await sql`insert into public.embudo_alta (studio_id, paso, ocurrido_en) values (${studioId}, ${nombre}, ${haceHoras(horas)})`;
}

/**
 * Un estudio del alta nueva (v2, el alta TERMINADA: el recordatorio de alta a
 * medias no toca) creado hace 200 h: fuera de la ventana de 24-72 h de la
 * primera clase, para que SOLO se pruebe lo nuevo.
 */
async function conEstudio(prueba: (s: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  const { error } = await admin.from('altas_estudio').upsert({
    auth_user_id: studio.authUserId, origen: 'registro', iniciada_en: haceHoras(201), version: 'v2',
    recordatorio_descartado: 'terminada',
  }, { onConflict: 'auth_user_id' });
  assert.ok(!error, `altas_estudio: ${error?.message}`);
  await sql`update public.studios set creado_en = ${haceHoras(200)} where id = ${studio.studioId}`;
  try { await prueba(studio); } finally {
    await sql`delete from public.altas_estudio where auth_user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
}

test('el embudo admite las dos marcas nuevas y sigue con su lista cerrada', async () => {
  await conEstudio(async ({ studioId }) => {
    for (const p of ['correo_empuje_compartir', 'correo_empuje_alumnas']) {
      const { error } = await admin.from('embudo_alta').insert({ studio_id: studioId, paso: p });
      assert.ok(!error, `${p}: ${error?.message}`);
    }
    const { error } = await admin.from('embudo_alta').insert({ studio_id: studioId, paso: 'lo_que_sea' });
    assert.ok(error, 'un paso fuera de la lista no entra');
  });
});

test('«compartir»: clase reservable hace 24 h-7 días, sin enlace compartido ni correo → llama', async () => {
  await conEstudio(async ({ studioId }) => {
    assert.equal(await guarda(studioId), false, 'sin ningún hito no hay nada que empujar');
    await paso(studioId, 'clase_reservable', 30);
    assert.equal(await guarda(studioId), true);
  });
});

test('«compartir»: fuera de ventana, o en cuanto hay enlace o correo, no llama', async () => {
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'clase_reservable', 10);
    assert.equal(await guarda(studioId), false, 'aún no ha pasado un día');
  });
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'clase_reservable', 24 * 8);
    assert.equal(await guarda(studioId), false, 'pasados los 7 días');
  });
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'clase_reservable', 30);
    await paso(studioId, 'enlace_compartido', 2);
    assert.equal(await guarda(studioId), false, 'ya compartió el enlace (y compartió hace menos de 48 h)');
  });
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'clase_reservable', 30);
    await paso(studioId, 'correo_empuje_compartir', 1);
    assert.equal(await guarda(studioId), false, 'el correo ya salió');
  });
});

test('«alumnas»: enlace compartido hace 48 h-10 días y ninguna reserva → llama', async () => {
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'clase_reservable', 100);
    await paso(studioId, 'enlace_compartido', 60);
    assert.equal(await guarda(studioId), true);
  });
});

test('«alumnas»: fuera de ventana, con marca o con una reserva, no llama', async () => {
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'enlace_compartido', 40);
    assert.equal(await guarda(studioId), false, 'aún no han pasado 48 h');
  });
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'enlace_compartido', 24 * 11);
    assert.equal(await guarda(studioId), false, 'pasados los 10 días');
  });
  await conEstudio(async ({ studioId }) => {
    await paso(studioId, 'enlace_compartido', 60);
    await paso(studioId, 'correo_empuje_alumnas', 1);
    assert.equal(await guarda(studioId), false, 'el correo ya salió');
  });
});

test('un estudio del alta de siempre, o una sede de cadena, no pasa por aquí', async () => {
  await conEstudio(async ({ studioId, authUserId }) => {
    await paso(studioId, 'clase_reservable', 30);
    assert.equal(await guarda(studioId), true);
    await sql`update public.altas_estudio set version = 'v1' where auth_user_id = ${authUserId}`;
    assert.equal(await guarda(studioId), false, 'el alta de siempre no lleva estos correos');
    await sql`update public.altas_estudio set version = 'v2' where auth_user_id = ${authUserId}`;
    const cadenaId = `cad-emp-${process.pid}-${Date.now()}`;
    const { error } = await admin.from('cadenas').insert({ id: cadenaId, nombre: 'Cadena de prueba', owner_auth_user_id: authUserId });
    assert.ok(!error, error?.message);
    try {
      await sql`update public.studios set cadena_id = ${cadenaId} where id = ${studioId}`;
      assert.equal(await guarda(studioId), false);
    } finally {
      await sql`update public.studios set cadena_id = null where id = ${studioId}`;
      await sql`delete from public.cadenas where id = ${cadenaId}`;
    }
  });
});

test('la guarda sigue siendo solo del servidor y el job no ha cambiado', async () => {
  const [p] = await sql<{ anon: boolean; auth: boolean; srv: boolean }[]>`
    select has_function_privilege('anon', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') as anon,
           has_function_privilege('authenticated', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') as auth,
           has_function_privilege('service_role', 'public.cron_hay_trabajo_altas(text)', 'EXECUTE') as srv`;
  assert.deepEqual(p, { anon: false, auth: false, srv: true });
  const [job] = await sql<{ command: string; schedule: string }[]>`select command, schedule from cron.job where jobname = 'altas-sin-terminar'`;
  assert.match(job.command, /where public\.cron_hay_trabajo_altas\(\);/);
  assert.equal(job.schedule, '23 * * * *', 'la cadencia no cambia');
});
