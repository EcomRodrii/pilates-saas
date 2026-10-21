// El embudo del alta (migración 20261021020248_embudo_alta.sql), contra Postgres
// de verdad (job `calidad-rls`):
//
//  · `embudo_alta` no la lee ni la escribe el navegador (ni la propietaria de su
//    propio estudio), y la lectura `embudo_activacion_detalle` es solo de
//    service_role;
//  · el trigger de auth.users copia `version` y `llegada` del `pending_studio`, y
//    con valores raros NO rompe el alta: guarda 'v1' y null;
//  · la lectura cruza lo que ya existía (primera clase, primera reserva sin las
//    importadas) con los pasos apuntados, deja fuera las demos y las altas de
//    prueba, y cuenta las altas que no llegaron a estudio.
//
// La lógica de las cohortes está en lib/alta/embudo.test.ts.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  clienteAdminLocal, crearSesion, crearSocia, crearStudioConPropietaria, limpiarFixtures, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
after(async () => { await sql.end(); });

const sufijo = () => `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Una cuenta creada como la crea /crear-estudio: con `pending_studio` en la metadata. */
async function cuentaDeAlta(pendiente: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `alta-${sufijo()}@rls-test.invalid`, password: 'rls-test-password-1234', email_confirm: true,
    user_metadata: { nombre: 'Prueba', pending_studio: pendiente },
  });
  assert.ok(!error && data.user, `el alta no puede fallar por el trigger: ${error?.message}`);
  return data.user.id;
}

async function filaDeAlta(authUserId: string) {
  const [f] = await sql<{ version: string; llegada: string | null; origen: string }[]>`
    select version, llegada, origen from public.altas_estudio where auth_user_id = ${authUserId}`;
  return f;
}

test('el navegador no lee ni escribe embudo_alta, y la lectura es solo de service_role', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { error: errAlta } = await admin.from('embudo_alta').insert({ studio_id: studio.studioId, paso: 'panel_abierto' });
    assert.ok(!errAlta, `service_role tiene que poder apuntar: ${errAlta?.message}`);

    const lee = await studio.comoPropietaria.from('embudo_alta').select('paso').eq('studio_id', studio.studioId);
    assert.ok(lee.error || (lee.data ?? []).length === 0, 'la propietaria no debería leer el embudo de su estudio');
    const escribe = await studio.comoPropietaria.from('embudo_alta')
      .insert({ studio_id: studio.studioId, paso: 'clase_reservable' });
    assert.ok(escribe.error, 'la propietaria no debería poder apuntarse un paso');
    const rpc = await studio.comoPropietaria.rpc('embudo_activacion_detalle', { p_desde: '2026-01-01' });
    assert.ok(rpc.error, 'authenticated no puede ejecutar la lectura (lee auth.users)');

    const [p] = await sql<{ anon: boolean; auth: boolean; srv: boolean; tabla_anon: boolean; tabla_auth: boolean }[]>`
      select has_function_privilege('anon', 'public.embudo_activacion_detalle(date, boolean)', 'EXECUTE') as anon,
             has_function_privilege('authenticated', 'public.embudo_activacion_detalle(date, boolean)', 'EXECUTE') as auth,
             has_function_privilege('service_role', 'public.embudo_activacion_detalle(date, boolean)', 'EXECUTE') as srv,
             has_table_privilege('anon', 'public.embudo_alta', 'SELECT') or has_table_privilege('anon', 'public.embudo_alta', 'INSERT') as tabla_anon,
             has_table_privilege('authenticated', 'public.embudo_alta', 'SELECT') or has_table_privilege('authenticated', 'public.embudo_alta', 'INSERT') as tabla_auth`;
    assert.deepEqual(p, { anon: false, auth: false, srv: true, tabla_anon: false, tabla_auth: false });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un paso, una vez al día: repetirlo no duplica ni cambia la primera hora', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const primera = await admin.from('embudo_alta')
      .upsert({ studio_id: studio.studioId, paso: 'enlace_compartido', detalle: 'copiar' }, { onConflict: 'studio_id,paso,dia', ignoreDuplicates: true });
    assert.ok(!primera.error, primera.error?.message);
    const otra = await admin.from('embudo_alta')
      .upsert({ studio_id: studio.studioId, paso: 'enlace_compartido', detalle: 'qr' }, { onConflict: 'studio_id,paso,dia', ignoreDuplicates: true });
    assert.ok(!otra.error, otra.error?.message);
    const filas = await sql<{ detalle: string; hoy: boolean }[]>`
      select detalle, dia = public.hoy_estudio() as hoy from public.embudo_alta
       where studio_id = ${studio.studioId} and paso = 'enlace_compartido'`;
    assert.deepEqual([...filas], [{ detalle: 'copiar', hoy: true }], 'el día es el de Madrid y manda la primera');

    // La lista es cerrada: ni un paso ni un detalle inventados.
    const raro = await admin.from('embudo_alta').insert({ studio_id: studio.studioId, paso: 'cualquier_cosa' });
    assert.equal(raro.error?.code, '23514');
    const detalle = await admin.from('embudo_alta').insert({ studio_id: studio.studioId, paso: 'panel_abierto', detalle: 'texto libre' });
    assert.equal(detalle.error?.code, '23514');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el trigger de auth.users copia version y llegada, y un valor raro no rompe el alta', async () => {
  const cuentas: string[] = [];
  try {
    const nueva = await cuentaDeAlta({ nombre: 'Estudio Norte', version: 'v2', llegada: '/funcionalidades/plazas-fijas' });
    cuentas.push(nueva);
    assert.deepEqual(await filaDeAlta(nueva), { version: 'v2', llegada: '/funcionalidades/plazas-fijas', origen: 'registro' });

    const deSiempre = await cuentaDeAlta({ nombre: 'Estudio Sur' });
    cuentas.push(deSiempre);
    assert.deepEqual(await filaDeAlta(deSiempre), { version: 'v1', llegada: null, origen: 'registro' });

    // Mayúsculas y espacios se normalizan, como en lib/alta/embudo.ts.
    const conMayusculas = await cuentaDeAlta({ nombre: 'Estudio Este', version: 'v2_prueba', llegada: '  Precio ' });
    cuentas.push(conMayusculas);
    assert.deepEqual(await filaDeAlta(conMayusculas), { version: 'v2_prueba', llegada: 'precio', origen: 'registro' });

    // Lo que no está en la lista: 'v1' y null, y la cuenta se crea igual.
    for (const raro of [
      { version: 'v3', llegada: 'Hola mundo!<b>' },
      { version: 2, llegada: { a: 1 } },
      { version: null, llegada: 'x'.repeat(200) },
    ]) {
      const id = await cuentaDeAlta({ nombre: 'Estudio Raro', ...raro });
      cuentas.push(id);
      assert.deepEqual(await filaDeAlta(id), { version: 'v1', llegada: null, origen: 'registro' }, JSON.stringify(raro));
    }
  } finally {
    for (const id of cuentas) await admin.auth.admin.deleteUser(id).catch(() => {});
  }
});

test('la lectura cruza lo que ya existía con los pasos, sin demos, sin pruebas ni reservas importadas', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const demo = await crearStudioConPropietaria(admin);
  const cuentas: string[] = [];
  const estudiosExtra: string[] = [];
  try {
    // Lo que ya existía: una clase y dos reservas, la primera IMPORTADA.
    const sesion = await crearSesion(admin, studio.studioId);
    const socia = await crearSocia(admin, studio.studioId);
    const importada = `res-imp-${sufijo()}`;
    const real = `res-real-${sufijo()}`;
    let r = await admin.from('reservas').insert({
      id: importada, studio_id: studio.studioId, sesion_id: sesion, socio_id: socia, estado: 'CONFIRMADA',
      creado_en: new Date(Date.now() - 3_600_000).toISOString(),
    });
    assert.ok(!r.error, r.error?.message);
    r = await admin.from('migracion_batches').insert({ id: `mig-${randomUUID()}`, studio_id: studio.studioId, ids_creados: { reservas: [importada] } });
    assert.ok(!r.error, r.error?.message);
    r = await admin.from('reservas').insert({ id: real, studio_id: studio.studioId, sesion_id: sesion, socio_id: socia, estado: 'CANCELADA' });
    assert.ok(!r.error, r.error?.message);

    // Los pasos apuntados: hoy reservable y el panel abierto el día siguiente.
    await sql`insert into public.embudo_alta (studio_id, paso) values (${studio.studioId}, 'clase_reservable')`;
    await sql`insert into public.embudo_alta (studio_id, paso, dia) values (${studio.studioId}, 'panel_abierto', public.hoy_estudio() + 1)`;
    await sql`update public.studios set es_demo = true where id = ${demo.studioId}`;

    // Un alta de prueba con estudio, y un alta normal que no llegó a estudio.
    const llegadaPrueba = `prueba-${sufijo()}`;
    const deprueba = await cuentaDeAlta({ nombre: 'De prueba', version: 'v2_prueba', llegada: llegadaPrueba });
    cuentas.push(deprueba);
    const estudioPrueba = `studio-embudo-${sufijo()}`;
    r = await admin.from('studios').insert({ id: estudioPrueba, nombre: 'De prueba', plan: 'ESTUDIO', owner_auth_user_id: deprueba });
    assert.ok(!r.error, r.error?.message);
    estudiosExtra.push(estudioPrueba);
    const llegadaSinEstudio = `sin-estudio-${sufijo()}`;
    cuentas.push(await cuentaDeAlta({ nombre: 'Sin estudio', version: 'v2', llegada: llegadaSinEstudio }));

    type Fila = {
      studio_id: string | null; version: string; llegada: string | null; dia_alta: string; semana: string;
      tiene_clase: boolean; primera_clase_en: Date | null; primera_reserva_en: Date | null; email_confirmado_en: Date | null;
      pasos: Record<string, string>; dias_panel: number[]; medido_desde: Record<string, string>;
      lunes: boolean; es_hoy: boolean;
    };
    const leer = (incluirPruebas: boolean) => sql<Fila[]>`
      select f.*, extract(isodow from f.semana) = 1 as lunes, f.dia_alta = public.hoy_estudio() as es_hoy
        from public.embudo_activacion_detalle(public.hoy_estudio() - 1, ${incluirPruebas}) f`;

    const filas = await leer(false);
    const mia = filas.find(f => f.studio_id === studio.studioId);
    assert.ok(mia, 'el estudio de hoy tiene que salir');
    assert.equal(mia.version, 'v1', 'sin fila en altas_estudio cuenta como el alta de siempre');
    assert.equal(mia.lunes, true, 'la semana es el lunes');
    assert.equal(mia.es_hoy, true, 'el día del alta es el de Madrid');
    assert.equal(mia.tiene_clase, true);
    assert.ok(mia.primera_clase_en, 'la primera clase programada');
    assert.ok(mia.email_confirmado_en, 'el email del dueño, confirmado');
    const [{ creado_en: realEn }] = await sql<{ creado_en: Date }[]>`select creado_en from public.reservas where id = ${real}`;
    assert.equal(mia.primera_reserva_en?.toISOString(), realEn.toISOString(), 'la importada no es la primera reserva');
    assert.ok(mia.pasos.clase_reservable, 'el paso apuntado');
    assert.equal(mia.pasos.panel_abierto, undefined, 'el panel va en dias_panel, no en pasos');
    assert.deepEqual(mia.dias_panel, [1]);
    assert.ok(mia.medido_desde.clase_reservable && mia.medido_desde.panel_abierto);

    assert.equal(filas.some(f => f.studio_id === demo.studioId), false, 'una demo no es un estudio nuevo');
    assert.equal(filas.some(f => f.studio_id === estudioPrueba), false, 'el alta de prueba no entra de serie');
    const sinEstudio = filas.find(f => f.llegada === llegadaSinEstudio);
    assert.ok(sinEstudio, 'el alta que no llegó a estudio cuenta arriba del embudo');
    assert.equal(sinEstudio.studio_id, null);
    assert.equal(sinEstudio.version, 'v2');

    const conPruebas = await leer(true);
    assert.equal(conPruebas.find(f => f.studio_id === estudioPrueba)?.version, 'v2_prueba', 'pedida a propósito, sí');
  } finally {
    if (estudiosExtra.length) await admin.from('studios').delete().in('id', estudiosExtra);
    for (const id of cuentas) await admin.auth.admin.deleteUser(id).catch(() => {});
    await limpiarFixtures(admin, [studio, demo]);
  }
});
