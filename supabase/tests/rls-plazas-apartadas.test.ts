// Plazas apartadas para ClassPass (migr 20261007164222, decisión del fundador del 7-oct-2026), contra una base real.
//
// La paridad de `evaluar_reserva`/`reservar_plaza` con plazas apartadas vive en rls-evaluar-reserva-paridad.test.ts.
// Aquí va el resto: las ventas de fuera (ClassPass usa sus apartadas, USC no), el «liberar 1» del mostrador, la lista
// de espera cuando se liberan, el lote que pintan las pantallas y quién lee y escribe la hora de liberarlas.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearInstructora, crearSocia, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora,
  type InstructoraFixture, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-apa-${process.pid}-${Date.now()}-${contador++}`;
const enMinutos = (n: number) => new Date(Date.now() + n * 60_000);

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

/** ClassPass encendida con `cupo` plazas cedidas en un tipo de clase, y X horas si se da. */
async function conClasspass(studioId: string, p: { cupo: number; liberarHorasAntes?: number }) {
  const tipo = idUnico('tc');
  const { error: e0 } = await admin.from('tipos_clase').insert({ id: tipo, studio_id: studioId, nombre: `Tipo ${tipo}` });
  assert.ok(!e0, `tipo de clase: ${e0?.message}`);
  const { error: e1 } = await admin.from('integraciones').insert({ id: idUnico('intg'), studio_id: studioId, tipo: 'CLASSPASS', activo: true });
  assert.ok(!e1, `integración: ${e1?.message}`);
  const { error: e2 } = await admin.from('plataforma_cupos').insert({ studio_id: studioId, plataforma: 'CLASSPASS', tipo_clase_id: tipo, plazas: p.cupo });
  assert.ok(!e2, `cupo: ${e2?.message}`);
  if (p.liberarHorasAntes != null) {
    const { error: e3 } = await admin.from('plataforma_ajustes').insert({ studio_id: studioId, plataforma: 'CLASSPASS', liberar_horas_antes: p.liberarHorasAntes });
    assert.ok(!e3, `ajuste: ${e3?.message}`);
  }
  return tipo;
}

async function sesion(studioId: string, tipo: string, inicio: Date, aforo: number) {
  const id = idUnico('ses');
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, tipo_clase_id: tipo, inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(), aforo_maximo: aforo,
  });
  assert.ok(!error, `sesión: ${error?.message}`);
  return id;
}

async function reserva(studioId: string, sesionId: string, estado: 'CONFIRMADA' | 'LISTA_ESPERA', posicion: number | null = null) {
  const id = idUnico('res');
  const { error } = await admin.from('reservas').insert({
    id, studio_id: studioId, sesion_id: sesionId, socio_id: await crearSocia(admin, studioId), estado,
    posicion_espera: posicion, bono_consumo_rastreado: true,
  });
  assert.ok(!error, `reserva: ${error?.message}`);
  return id;
}

/** Una venta de fuera por la RPC de siempre; devuelve el error de la base de datos, si lo hay. */
async function ventaDe(studioId: string, sesionId: string, origen: 'CLASSPASS' | 'URBAN_SPORTS_CLUB') {
  const { error } = await admin.rpc('reservar_plaza_externa', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_reserva_id: idUnico('res-ext'), p_origen: origen, p_nombre: `Venta ${origen}`,
  });
  return error?.message ?? null;
}

async function apartadas(sesionId: string, para = 'TENTARE') {
  const { data, error } = await admin.rpc('plazas_apartadas', { p_sesion_id: sesionId, p_para_origen: para });
  assert.ok(!error, error?.message);
  return data as number;
}

async function liberar(studioId: string, sesionId: string, plataforma = 'CLASSPASS') {
  const { data, error } = await admin.rpc('liberar_plaza_apartada', { p_studio_id: studioId, p_sesion_id: sesionId, p_plataforma: plataforma });
  return { quedan: data as number | null, error: error?.message ?? null };
}

test('ventas de fuera: ClassPass vende SUS apartadas y USC no puede usarlas', async () => {
  await conEstudio(async ({ studioId }) => {
    const tipo = await conClasspass(studioId, { cupo: 2 });
    const s = await sesion(studioId, tipo, enMinutos(72 * 60), 3);
    assert.equal(await apartadas(s), 2, 'para Tentare, las dos de ClassPass están apartadas');
    assert.equal(await apartadas(s, 'CLASSPASS'), 0, 'ClassPass no se aparta plazas a sí misma');

    assert.equal(await ventaDe(studioId, s, 'URBAN_SPORTS_CLUB'), null, 'queda una plaza libre: la vende USC');
    assert.match(await ventaDe(studioId, s, 'URBAN_SPORTS_CLUB') ?? '', /AFORO_LLENO_APARTADAS/, 'USC no se queda las de ClassPass');

    assert.equal(await ventaDe(studioId, s, 'CLASSPASS'), null);
    assert.equal(await apartadas(s), 1, 'cada venta de ClassPass gasta una de sus apartadas');
    assert.equal(await ventaDe(studioId, s, 'CLASSPASS'), null);
    assert.equal(await apartadas(s), 0);
    assert.match(await ventaDe(studioId, s, 'CLASSPASS') ?? '', /AFORO_LLENO/, 'llena de verdad: ni ClassPass vende más');
  });
});

test('«liberar 1» del mostrador: baja el cupo de ESA clase, solo lo que está apartado ahora', async () => {
  await conEstudio(async ({ studioId }) => {
    const tipo = await conClasspass(studioId, { cupo: 2, liberarHorasAntes: 24 });
    const a = await sesion(studioId, tipo, enMinutos(72 * 60), 4);
    const b = await sesion(studioId, tipo, enMinutos(73 * 60), 4);
    assert.equal(await ventaDe(studioId, a, 'CLASSPASS'), null);
    assert.equal(await apartadas(a), 1);

    assert.deepEqual(await liberar(studioId, a), { quedan: 0, error: null });
    const { data: cupos } = await admin.from('plataforma_cupos').select('plazas').eq('sesion_id', a);
    assert.deepEqual(cupos, [{ plazas: 1 }], 'la excepción por sesión: lo vendido, nunca menos');
    assert.match((await liberar(studioId, a)).error ?? '', /NADA_APARTADO/, 'no se libera por debajo de lo vendido');
    assert.equal(await apartadas(b), 2, 'las demás clases del tipo no cambian');

    // Ya liberadas por la hora (X = 24 h): no hay nada que liberar ni rastro que dejar.
    const pronto = await sesion(studioId, tipo, enMinutos(3 * 60), 4);
    assert.match((await liberar(studioId, pronto)).error ?? '', /NADA_APARTADO/);
    assert.match((await liberar(studioId, b, 'URBAN_SPORTS_CLUB')).error ?? '', /PLATAFORMA_NO_APARTA/);

    // El estudio sale de la sesión del panel: con otro estudio, la clase no existe.
    const otro = await crearStudioConPropietaria(admin);
    try {
      assert.match((await liberar(otro.studioId, b)).error ?? '', /SESION_NO_ENCONTRADA/);
    } finally {
      await limpiarFixtures(admin, [otro]);
    }
    assert.equal(await apartadas(b), 2);

    // ClassPass apagada: no aparta, así que tampoco hay nada que liberar.
    await admin.from('integraciones').update({ activo: false }).eq('studio_id', studioId).eq('tipo', 'CLASSPASS');
    assert.equal(await apartadas(b), 0);
    assert.match((await liberar(studioId, b)).error ?? '', /NADA_APARTADO/);
  });
});

test('la lista de espera: mientras están apartadas no sube nadie; al liberarse, el barrido la encuentra y sube a la primera', async () => {
  await conEstudio(async ({ studioId }) => {
    // X = 1 h. Una clase a 55 min: sus apartadas se liberaron hace 5 (dentro de la ventana de 15 del barrido).
    const tipo = await conClasspass(studioId, { cupo: 1, liberarHorasAntes: 1 });
    const liberada = await sesion(studioId, tipo, enMinutos(55), 2);
    const apartada = await sesion(studioId, tipo, enMinutos(72 * 60), 2);
    for (const s of [liberada, apartada]) {
      await reserva(studioId, s, 'CONFIRMADA');
      await reserva(studioId, s, 'LISTA_ESPERA', 1);
    }

    const lista = async () => {
      const { data, error } = await admin.rpc('sesiones_con_plazas_liberadas', { p_ventana: '15 minutes' });
      assert.ok(!error, error?.message);
      return (data as { studio_id: string; sesion_id: string; huecos: number }[]).filter(x => x.sesion_id === liberada || x.sesion_id === apartada);
    };
    assert.deepEqual(await lista(), [{ studio_id: studioId, sesion_id: liberada, huecos: 1 }],
      'solo la liberada (la otra sigue apartada), con su hueco');

    const promover = async (s: string) => {
      const { data, error } = await admin.rpc('promocionar_espera_de_sesion', { p_studio_id: studioId, p_sesion_id: s });
      assert.ok(!error, error?.message);
      return (data as { promovida_socio_id: string | null }[])[0]?.promovida_socio_id ?? null;
    };
    assert.equal(await promover(apartada), null, 'la plaza apartada vuelve a ClassPass, no a la cola');
    assert.notEqual(await promover(liberada), null, 'liberada: sube la primera de la cola');

    const { data: estados } = await admin.from('reservas').select('estado').eq('sesion_id', liberada).order('estado');
    assert.deepEqual(estados, [{ estado: 'CONFIRMADA' }, { estado: 'CONFIRMADA' }]);
    assert.deepEqual(await lista(), [], 'resuelta: sin cola ni huecos, el barrido ya no la ve');
  });
});

test('el lote de las pantallas: solo las clases con algo apartado, con la hora a la que se liberan', async () => {
  await conEstudio(async ({ studioId }) => {
    const tipo = await conClasspass(studioId, { cupo: 2, liberarHorasAntes: 6 });
    const inicio = enMinutos(72 * 60);
    const conApartadas = await sesion(studioId, tipo, inicio, 4);
    const yaLiberada = await sesion(studioId, tipo, enMinutos(60), 4);
    const vendida = await sesion(studioId, tipo, enMinutos(74 * 60), 4);
    assert.equal(await ventaDe(studioId, vendida, 'CLASSPASS'), null);
    assert.equal(await ventaDe(studioId, vendida, 'CLASSPASS'), null);

    const { data, error } = await admin.rpc('plazas_apartadas_de', {
      p_studio_id: studioId, p_sesion_ids: [conApartadas, yaLiberada, vendida], p_para_origen: 'TENTARE',
    });
    assert.ok(!error, error?.message);
    const filas = data as { sesion_id: string; plazas: number; liberan_en: string }[];
    assert.deepEqual(filas.map(f => [f.sesion_id, f.plazas]), [[conApartadas, 2]]);
    assert.equal(new Date(filas[0].liberan_en).getTime(), inicio.getTime() - 6 * 3_600_000, 'X horas antes de empezar');
  });
});

test('la hora de liberarlas: la escribe quien gestiona la sede; recepción la lee y no la cambia; la instructora no la ve', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const equipo: InstructoraFixture[] = [];
  try {
    const { studioId, comoPropietaria } = studio;
    const manager = await crearInstructora(admin, studioId, 'MANAGER'); equipo.push(manager);
    const recepcion = await crearInstructora(admin, studioId, 'RECEPCION'); equipo.push(recepcion);
    const instructora = await crearInstructora(admin, studioId, 'INSTRUCTOR'); equipo.push(instructora);

    const { error: e1 } = await comoPropietaria.from('plataforma_ajustes')
      .upsert({ studio_id: studioId, plataforma: 'CLASSPASS', liberar_horas_antes: 12 }, { onConflict: 'studio_id,plataforma' });
    assert.ok(!e1, `la propietaria no pudo guardarla: ${e1?.message}`);
    const { data: m, error: e2 } = await manager.comoInstructora.from('plataforma_ajustes')
      .update({ liberar_horas_antes: 8 }).eq('studio_id', studioId).eq('plataforma', 'CLASSPASS').select('liberar_horas_antes');
    assert.ok(!e2, e2?.message);
    assert.deepEqual(m, [{ liberar_horas_antes: 8 }], 'gerencia gestiona la sede: la cambia');

    const { data: r } = await recepcion.comoInstructora.from('plataforma_ajustes').select('liberar_horas_antes').eq('studio_id', studioId);
    assert.deepEqual(r, [{ liberar_horas_antes: 8 }], 'recepción la lee (la hoja de la clase dice hasta cuándo)');
    const { data: rCambio } = await recepcion.comoInstructora.from('plataforma_ajustes')
      .update({ liberar_horas_antes: 0 }).eq('studio_id', studioId).eq('plataforma', 'CLASSPASS').select('liberar_horas_antes');
    assert.deepEqual(rCambio ?? [], [], 'recepción no la cambia');
    const { error: rAlta } = await recepcion.comoInstructora.from('plataforma_ajustes')
      .insert({ studio_id: studioId, plataforma: 'URBAN_SPORTS_CLUB', liberar_horas_antes: 1 });
    assert.ok(rAlta, 'recepción no la crea');

    const { data: i } = await instructora.comoInstructora.from('plataforma_ajustes').select('liberar_horas_antes').eq('studio_id', studioId);
    assert.deepEqual(i ?? [], [], 'la instructora no trabaja en el panel');

    // Otro estudio: ni la ve ni la cambia.
    const otro = await crearStudioConPropietaria(admin);
    try {
      const { data: ajena } = await otro.comoPropietaria.from('plataforma_ajustes').select('liberar_horas_antes').eq('studio_id', studioId);
      assert.deepEqual(ajena ?? [], [], 'otro estudio no lee la hora de este');
      const { data: cambioAjeno } = await otro.comoPropietaria.from('plataforma_ajustes')
        .update({ liberar_horas_antes: 0 }).eq('studio_id', studioId).select('liberar_horas_antes');
      assert.deepEqual(cambioAjeno ?? [], [], 'otro estudio no la cambia');
      const { error: altaAjena } = await otro.comoPropietaria.from('plataforma_ajustes')
        .insert({ studio_id: studioId, plataforma: 'WELLHUB', liberar_horas_antes: 1 });
      assert.ok(altaAjena, 'otro estudio no la crea en este');
    } finally {
      await limpiarFixtures(admin, [otro]);
    }

    const { error: fuera } = await comoPropietaria.from('plataforma_ajustes')
      .update({ liberar_horas_antes: 73 }).eq('studio_id', studioId).eq('plataforma', 'CLASSPASS');
    assert.ok(fuera, 'más de 72 h no se guarda');
  } finally {
    for (const x of equipo) await limpiarInstructora(admin, x);
    await limpiarFixtures(admin, [studio]);
  }
});
