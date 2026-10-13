// «Repetir este mes» (migr 20261012210100): `renovar_serie` con `p_hasta` y
// `p_fechas`, contra Postgres de verdad (job `calidad-rls`).
//
//  · Sin los parámetros nuevos, hace y devuelve lo de siempre (forma exacta del
//    resultado, tramo de la serie, «no renovar»).
//  · Con `p_hasta`: cada día de la semana llega hasta ese día; simular no crea
//    nada; solo se crean las fechas marcadas; las desmarcadas salen como
//    'excluida', las pasadas como 'pasada', las que la serie no tiene como
//    'fuera_de_serie', y los cierres se siguen saltando. Invariante: cada fecha
//    pedida se crea o se omite con un motivo que no es 'excluida'.
//  · La hora local se mantiene al cruzar el cambio de hora.
//  · Solo la puede ejecutar el servidor.
//  · (migr 20261012220000) Una fecha saltada al final de un período, por el
//    motivo que sea, cuenta como la última de su día de la semana: la
//    renovación siguiente no pierde ese día ni vuelve a intentar la fecha.
//
// Se llama con `admin` (service_role) porque es como la llama la app.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal, type StudioFixture } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
after(async () => { await sql.end(); });

let contador = 0;
const idUnico = (p: string) => `${p}-rsh-${process.pid}-${Date.now()}-${contador++}`;

async function conEstudio(prueba: (studio: StudioFixture, salaId: string) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const salaId = idUnico('sala');
    const { error } = await admin.from('salas').insert({ id: salaId, studio_id: studio.studioId, nombre: 'Sala', capacidad: 8 });
    assert.ok(!error, error?.message);
    await prueba(studio, salaId);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

/** Un día de la semana concreto a partir de `hoy + minimo` (fechas como texto: sin Date de JS). */
async function proximo(dow: number, minimoDias: number): Promise<string> {
  const [r] = await sql<{ d: string }[]>`
    select (public.hoy_estudio() + ${minimoDias}::int
            + ((${dow}::int - extract(dow from public.hoy_estudio() + ${minimoDias}::int)::int + 7) % 7))::text as d`;
  return r.d;
}
async function masDias(d: string, n: number): Promise<string> {
  const [r] = await sql<{ d: string }[]>`select (${d}::date + ${n}::int)::text as d`;
  return r.d;
}

/** Las clases de una serie, creadas en UN insert (así nace la serie, como desde el panel). */
async function crearSerie(studioId: string, salaId: string, fechas: string[], hora = '18:30') {
  const serieId = idUnico('serie');
  await sql`
    insert into public.sesiones (id, studio_id, sala_id, inicio, fin, aforo_maximo, cancelada, serie_id)
    select 'ses-' || gen_random_uuid()::text, ${studioId}, ${salaId},
           (d::date + ${hora}::time) at time zone 'Europe/Madrid',
           (d::date + ${hora}::time) at time zone 'Europe/Madrid' + interval '50 minutes',
           8, false, ${serieId}
      from unnest(${fechas}::text[]) as d`;
  return serieId;
}

async function periodoActual(serieId: string): Promise<number> {
  const [r] = await sql<{ p: number }[]>`select coalesce(max(periodo), 0)::int as p from public.series_periodos where serie_id = ${serieId}`;
  return r.p;
}

async function fechasDeLaSerie(serieId: string): Promise<string[]> {
  const filas = await sql<{ d: string }[]>`
    select ((inicio at time zone 'Europe/Madrid')::date)::text as d from public.sesiones
     where serie_id = ${serieId} and not cancelada order by inicio`;
  return filas.map((f) => f.d);
}

type Res = Record<string, unknown> & { omitidas: { fecha: string; motivo: string }[] };

async function renovar(studioId: string, serieId: string, extra: Record<string, unknown>): Promise<Res> {
  const { data, error } = await admin.rpc('renovar_serie', {
    p_studio_id: studioId, p_serie_id: serieId, p_periodo_visto: await periodoActual(serieId), p_origen: 'manual', ...extra,
  });
  assert.ok(!error, error?.message);
  return data as Res;
}

test('sin p_hasta: la renovación de siempre, con la forma de resultado de siempre', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    const martes = await proximo(2, 3);
    const serieId = await crearSerie(studioId, salaId, [martes, await masDias(martes, 2)]);
    await sql`update public.series set no_renovar = true, semanas_periodo = 4 where id = ${serieId}`;

    const r = await renovar(studioId, serieId, { p_semanas: 3, p_simular: false });
    assert.equal(r.estado, 'renovada');
    assert.equal(r.creadas, 6, 'tres semanas por cada uno de los dos días');
    assert.deepEqual(Object.keys(r).sort(), [
      'creadas', 'desde', 'estado', 'hasta', 'instructora_inactiva', 'omitidas', 'periodo', 'periodo_actual',
      'plazas_fijas', 'plazas_fijas_ids', 'renovacion_automatica', 'semanas', 'sin_instructora',
    ], 'sin claves nuevas en el modo de siempre');
    const [serie] = await sql<{ semanas_periodo: number; no_renovar: boolean }[]>`
      select semanas_periodo, no_renovar from public.series where id = ${serieId}`;
    assert.equal(serie.semanas_periodo, 3, 'renovar fija el tramo, como siempre');
    assert.equal(serie.no_renovar, false, 'renovar a mano quita «no renovar», como siempre');
  });
});

test('con p_hasta: simular no crea nada y enseña todas las fechas hasta ese día', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    const martes = await proximo(2, 3);
    const jueves = await masDias(martes, 2);
    const serieId = await crearSerie(studioId, salaId, [martes, jueves]);
    const hasta = await masDias(martes, 30);

    const r = await renovar(studioId, serieId, { p_semanas: null, p_simular: true, p_hasta: hasta });
    assert.equal(r.estado, 'simulacion');
    const esperadas = await Promise.all([7, 14, 21, 28, 9, 16, 23, 30].map((n) => masDias(martes, n)));
    assert.deepEqual(r.fechas, [...esperadas].sort());
    assert.equal(r.creadas, 8);
    assert.deepEqual(await fechasDeLaSerie(serieId), [martes, jueves], 'simular no deja clases');

    // Un día menos: 4 martes y 3 jueves (cada día de la semana llega hasta p_hasta por su cuenta).
    const r29 = await renovar(studioId, serieId, { p_semanas: null, p_simular: true, p_hasta: await masDias(martes, 29) });
    assert.equal(r29.creadas, 7);
  });
});

test('desmarcar el último viernes no borra los viernes de la serie ni hace que la siguiente renovación lo cree', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    const lunes = await proximo(1, 3);
    const serieId = await crearSerie(studioId, salaId, [lunes, await masDias(lunes, 4)]);
    // Rango: lunes +7 y +14; viernes +11 y +18. Se desmarca el último viernes (+18).
    const ultimoViernes = await masDias(lunes, 18);
    const pedidas = await Promise.all([7, 11, 14].map((n) => masDias(lunes, n)));
    const r = await renovar(studioId, serieId, { p_semanas: null, p_simular: false, p_hasta: ultimoViernes, p_fechas: pedidas });
    assert.equal(r.creadas, 3);
    assert.equal(r.omitidas.find((o) => o.fecha === ultimoViernes)?.motivo, 'excluida');

    // La renovación de siempre (también la automática), una semana más: lunes Y viernes.
    const r2 = await renovar(studioId, serieId, { p_semanas: 1, p_simular: false });
    assert.equal(r2.creadas, 2);
    const fechas = await fechasDeLaSerie(serieId);
    assert.ok(fechas.includes(await masDias(lunes, 21)), 'el lunes siguiente');
    assert.ok(fechas.includes(await masDias(lunes, 25)), 'y el viernes siguiente: los viernes siguen');
    assert.ok(!fechas.includes(ultimoViernes), 'el viernes desmarcado no lo crea nadie');
  });
});

test('con p_hasta y p_fechas: solo las marcadas; excluida, fuera_de_serie y cierre con su motivo; la serie no cambia', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    const martes = await proximo(2, 3);
    const jueves = await masDias(martes, 2);
    const serieId = await crearSerie(studioId, salaId, [martes, jueves]);
    await sql`update public.series set no_renovar = true, semanas_periodo = 5 where id = ${serieId}`;
    const hasta = await masDias(martes, 30);
    const todas = await Promise.all([7, 9, 14, 16, 21, 23, 28, 30].map((n) => masDias(martes, n)));
    const quitada = await masDias(martes, 14);
    const cerrada = await masDias(martes, 21);
    const miercoles = await masDias(martes, 15); // la serie no da clase ese día
    await admin.from('cierres_estudio').insert({ id: idUnico('cie'), studio_id: studioId, desde: cerrada, hasta: cerrada, motivo: 'Festivo' });

    const pedidas = [...todas.filter((f) => f !== quitada), miercoles];
    const r = await renovar(studioId, serieId, { p_semanas: null, p_simular: false, p_hasta: hasta, p_fechas: pedidas });

    assert.equal(r.estado, 'renovada');
    const motivo = (f: string) => r.omitidas.find((o) => o.fecha === f)?.motivo;
    assert.equal(motivo(quitada), 'excluida');
    assert.equal(motivo(cerrada), 'cierre');
    assert.equal(motivo(miercoles), 'fuera_de_serie');
    assert.equal(r.creadas, 6);
    assert.equal((r.creadas_ids as string[]).length, 6);
    // Invariante: cada fecha pedida se crea o se omite con un motivo que no es 'excluida'.
    const noExcluidas = r.omitidas.filter((o) => o.motivo !== 'excluida').length;
    assert.equal(pedidas.length, (r.creadas as number) + noExcluidas);

    const creadas = await fechasDeLaSerie(serieId);
    assert.ok(!creadas.includes(quitada) && !creadas.includes(cerrada) && !creadas.includes(miercoles));
    assert.equal(creadas.length, 2 + 6);

    const [serie] = await sql<{ semanas_periodo: number; no_renovar: boolean }[]>`
      select semanas_periodo, no_renovar from public.series where id = ${serieId}`;
    assert.deepEqual(serie, { semanas_periodo: 5, no_renovar: true }, 'repetir un mes no cambia cómo se renueva la serie');
    const [periodo] = await sql<{ origen: string; sesiones_creadas: number }[]>`
      select origen, sesiones_creadas from public.series_periodos where serie_id = ${serieId} order by periodo desc limit 1`;
    assert.deepEqual(periodo, { origen: 'manual', sesiones_creadas: 6 });
  });
});

test('con p_hasta: una fecha que ya pasó nunca se crea', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    const [r0] = await sql<{ d: string }[]>`select (public.hoy_estudio() - 10)::text as d`;
    const serieId = await crearSerie(studioId, salaId, [r0.d]);
    const hasta = await masDias(r0.d, 21);
    const r = await renovar(studioId, serieId, { p_semanas: null, p_simular: false, p_hasta: hasta });
    assert.equal(r.omitidas.find((o) => o.fecha === (r.fechas as string[])[0])?.motivo, 'pasada');
    const [pasadas] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.sesiones where serie_id = ${serieId} and inicio < now()
        and ((inicio at time zone 'Europe/Madrid')::date) > ${r0.d}::date`;
    assert.equal(pasadas.n, 0);
  });
});

test('con p_hasta: la hora local se mantiene al cruzar el cambio de hora', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    const lunes = await proximo(1, 3);
    const serieId = await crearSerie(studioId, salaId, [lunes]);
    // 34 semanas: siempre cruzan al menos un cambio de hora (marzo y octubre).
    const r = await renovar(studioId, serieId, { p_semanas: null, p_simular: false, p_hasta: await masDias(lunes, 7 * 34) });
    assert.equal(r.creadas, 34);
    const horas = await sql<{ local: string; utc: string }[]>`
      select to_char(inicio at time zone 'Europe/Madrid', 'HH24:MI') as local, to_char(inicio at time zone 'UTC', 'HH24') as utc
        from public.sesiones where serie_id = ${serieId}`;
    assert.ok(horas.every((h) => h.local === '18:30'), 'todas a las 18:30 de Madrid');
    assert.ok(new Set(horas.map((h) => h.utc)).size === 2, 'en UTC hay dos horas: ha cruzado un cambio de hora');
  });
});

test('con p_hasta en el pasado: HASTA_INVALIDO', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    const serieId = await crearSerie(studioId, salaId, [await proximo(3, 3)]);
    const [ayer] = await sql<{ d: string }[]>`select (public.hoy_estudio() - 1)::text as d`;
    const { error } = await admin.rpc('renovar_serie', {
      p_studio_id: studioId, p_serie_id: serieId, p_periodo_visto: 1, p_semanas: null, p_origen: 'manual',
      p_simular: true, p_hasta: ayer.d,
    });
    assert.match(error?.message ?? '', /HASTA_INVALIDO/);
  });
});

test('solo el servidor la puede ejecutar', async () => {
  const firma = 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean, date, date[])';
  const [r] = await sql<{ anon: boolean; auth: boolean; servicio: boolean }[]>`
    select has_function_privilege('anon', ${firma}, 'EXECUTE') as anon,
           has_function_privilege('authenticated', ${firma}, 'EXECUTE') as auth,
           has_function_privilege('service_role', ${firma}, 'EXECUTE') as servicio`;
  assert.deepEqual(r, { anon: false, auth: false, servicio: true });
  const [vieja] = await sql<{ n: number }[]>`
    select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'renovar_serie'`;
  assert.equal(vieja.n, 1, 'una sola firma: con dos, PostgREST no sabría a cuál llamar');
});

// Migr 20261012220000: cada fecha que el último período saltó cuenta como la
// última de su día de la semana, sea cual sea el motivo (no solo 'excluida').
// Sin eso, el día de la semana cuya última fecha se saltó desaparecía de la
// serie, o la renovación siguiente volvía a intentar esa fecha.

async function cerrar(studioId: string, fecha: string) {
  const { error } = await admin.from('cierres_estudio').insert({ id: idUnico('cie'), studio_id: studioId, desde: fecha, hasta: fecha, motivo: 'Festivo' });
  assert.ok(!error, error?.message);
}

test('un cierre en el último viernes no borra los viernes aunque la serie acabe en lunes', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    // Serie viernes+lunes: el último día de cada semana es el lunes.
    const viernes = await proximo(5, 3);
    const serieId = await crearSerie(studioId, salaId, [viernes, await masDias(viernes, 3)]);
    const cerrado = await masDias(viernes, 14);
    await cerrar(studioId, cerrado);

    // Dos semanas: viernes +7 y +14 (cerrado), lunes +10 y +17.
    const r = await renovar(studioId, serieId, { p_semanas: 2, p_simular: false });
    assert.equal(r.creadas, 3);
    assert.deepEqual(r.omitidas, [{ fecha: cerrado, motivo: 'cierre' }]);

    // La siguiente: el viernes después del cierre y el lunes. Antes, solo el lunes.
    const r2 = await renovar(studioId, serieId, { p_semanas: 1, p_simular: false });
    assert.equal(r2.creadas, 2, 'lunes Y viernes');
    assert.deepEqual(r2.omitidas, [], 'no vuelve a intentar el día cerrado');
    const fechas = await fechasDeLaSerie(serieId);
    assert.ok(fechas.includes(await masDias(viernes, 21)), 'los viernes siguen');
    assert.ok(fechas.includes(await masDias(viernes, 24)), 'y los lunes');
    assert.ok(!fechas.includes(cerrado));
  });
});

test('un cierre en el último día de la serie no se vuelve a intentar ni le quita una clase al siguiente período', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    // Serie lunes+viernes: el último día de cada semana es el viernes.
    const lunes = await proximo(1, 3);
    const serieId = await crearSerie(studioId, salaId, [lunes, await masDias(lunes, 4)]);
    const cerrado = await masDias(lunes, 18);
    await cerrar(studioId, cerrado);

    const r = await renovar(studioId, serieId, { p_semanas: 2, p_simular: false });
    assert.equal(r.creadas, 3);
    // Aunque el centro vuelva a abrir ese día, la serie no vuelve atrás: igual que
    // al quitar un cierre, las clases no vuelven solas.
    await sql`delete from public.cierres_estudio where studio_id = ${studioId}`;

    const r2 = await renovar(studioId, serieId, { p_semanas: 1, p_simular: false });
    assert.equal(r2.creadas, 2);
    assert.deepEqual(r2.omitidas, []);
    const fechas = await fechasDeLaSerie(serieId);
    assert.ok(fechas.includes(await masDias(lunes, 21)) && fechas.includes(await masDias(lunes, 25)));
    assert.ok(!fechas.includes(cerrado), 'la fecha que se saltó no la crea la renovación siguiente');
  });
});

test('dos fechas saltadas por motivos distintos al final: no se pierde ningún día', async () => {
  await conEstudio(async ({ studioId }, salaId) => {
    // Lunes+viernes. Último lunes: ya hay otra clase a esa hora en la sala
    // ('ya_existe'). Último viernes: cerrado. Contando solo el cierre, la última
    // semana se movía al viernes y los lunes se perdían.
    const lunes = await proximo(1, 3);
    const serieId = await crearSerie(studioId, salaId, [lunes, await masDias(lunes, 4)]);
    const ocupado = await masDias(lunes, 14);
    await sql`
      insert into public.sesiones (id, studio_id, sala_id, inicio, fin, aforo_maximo, cancelada)
      values (${idUnico('ses')}, ${studioId}, ${salaId},
              (${ocupado}::date + '18:30'::time) at time zone 'Europe/Madrid',
              (${ocupado}::date + '18:30'::time) at time zone 'Europe/Madrid' + interval '50 minutes', 8, false)`;
    const cerrado = await masDias(lunes, 18);
    await cerrar(studioId, cerrado);

    const r = await renovar(studioId, serieId, { p_semanas: 2, p_simular: false });
    assert.equal(r.creadas, 2);
    const motivo = (f: string) => r.omitidas.find((o) => o.fecha === f)?.motivo;
    assert.equal(motivo(ocupado), 'ya_existe');
    assert.equal(motivo(cerrado), 'cierre');

    const r2 = await renovar(studioId, serieId, { p_semanas: 1, p_simular: false });
    assert.equal(r2.creadas, 2, 'lunes Y viernes');
    assert.deepEqual(r2.omitidas, []);
    const fechas = await fechasDeLaSerie(serieId);
    assert.ok(fechas.includes(await masDias(lunes, 21)) && fechas.includes(await masDias(lunes, 25)));
  });
});
