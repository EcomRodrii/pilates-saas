// La situación de un estudio (bajas, fase 2; migración 20261016123000) contra Postgres de verdad:
//
//  · paridad: `situacion_derivada` y `fase_plan_gratis` (SQL) dicen lo mismo que su gemela TS
//    (lib/retencion/situacion-estudio.ts), caso a caso, sobre una matriz de entradas;
//  · las señales de actividad: cuenta lo que hace una persona del estudio y no lo que hace Tentare
//    (ni Tentare desde /interno), en días de Madrid, y los días de «Cierre del centro» no cuentan;
//  · quien paga (plan a mano, plan de su cadena) no sale de ACTIVO_PAGO; las demos no se mueven;
//  · solo lectura de verdad: ni las marcas ni el informe cambian una sola columna de `studios`;
//  · las marcas: una al día; el punto de partida desde las sesiones: solo el equipo activo de ese
//    estudio, una sola vez y con su aviso;
//  · el navegador no escribe las marcas, no lee el informe y no llama a nada de esto.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearInstructora, crearSesion, crearSocia, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora,
  sqlLocal, type InstructoraFixture, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';
import {
  DIAS_HASTA_INACTIVO, DIAS_HASTA_SUSPENDIDO, diasSinActividad, faseDelGratis, situacionDerivada, type EntradaSituacion,
} from '../../lib/retencion/situacion-estudio.ts';
import type { FaseGratis } from '../../lib/billing/plan-gratis.ts';
import { masDias } from '../../lib/utils.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
let contador = 0;
const id = (p: string) => `${p}-sit-${process.pid}-${Date.now()}-${contador++}`;

after(async () => { await sql.end(); });

/** Una escritura que tiene que salir bien: si no, el test falla diciendo cuál. */
async function ok(paso: string, q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  assert.ok(!error, `${paso}: ${error?.message}`);
}

/** La huella de la fila ENTERA de un estudio: si algo de esto la toca, cambia. */
async function huella(studioId: string): Promise<string> {
  const [f] = await sql<{ h: string }[]>`select md5(st::text) as h from public.studios st where st.id = ${studioId}`;
  return f.h;
}

/** postgres.js codifica como JSON lo que va a un parámetro `jsonb`: se manda como texto y se convierte en SQL. */
const comoJson = (v: unknown) => JSON.stringify(v);

// ─── Paridad SQL ↔ TS ────────────────────────────────────────────────────────

test('paridad: situacion_derivada (SQL) = situacionDerivada (TS), caso a caso', async () => {
  const estados = [null, 'active', 'past_due', 'trialing', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'trial_expirado', 'gratis', 'gratis_cerrado'];
  const ids = [null, '', 'sub_x'];
  const cadenas: Array<{ tieneCadena: boolean; cadena: { subscriptionStatus: string | null; subscriptionId: string | null } | null }> = [
    { tieneCadena: false, cadena: null },
    { tieneCadena: true, cadena: null },
    { tieneCadena: true, cadena: { subscriptionStatus: 'active', subscriptionId: null } },
    { tieneCadena: true, cadena: { subscriptionStatus: 'unpaid', subscriptionId: 'sub_c' } },
    { tieneCadena: true, cadena: { subscriptionStatus: 'canceled', subscriptionId: 'sub_c' } },
    { tieneCadena: true, cadena: { subscriptionStatus: 'trialing', subscriptionId: '' } },
  ];
  const fases: FaseGratis[] = ['DENTRO', 'MARGEN', 'CERRADO', 'SIN_MEDIR'];
  const dias = [0, DIAS_HASTA_INACTIVO - 1, DIAS_HASTA_INACTIVO, DIAS_HASTA_SUSPENDIDO - 1, DIAS_HASTA_SUSPENDIDO];
  const casos: EntradaSituacion[] = [];
  for (const subscriptionStatus of estados) for (const subscriptionId of ids) for (const c of cadenas) {
    for (const esDemo of [false, true]) for (const baja of [0, 1, 2]) for (const purgado of [false, true]) {
      for (const faseGratis of fases) for (const diasSinActividad of dias) {
        casos.push({
          subscriptionStatus, subscriptionId, ...c, esDemo, purgado, faseGratis, diasSinActividad,
          contratoTerminado: baja === 1, supresionPedida: baja === 2,
        });
      }
    }
  }
  const entrada = casos.map((e, i) => ({
    i, estado: e.subscriptionStatus, sid: e.subscriptionId, tiene_cadena: e.tieneCadena,
    cadena_estado: e.cadena?.subscriptionStatus ?? null, cadena_sid: e.cadena?.subscriptionId ?? null,
    demo: e.esDemo, contrato: e.contratoTerminado, supresion: e.supresionPedida, purgado: e.purgado, fase: e.faseGratis, dias: e.diasSinActividad,
  }));
  const filas = await sql<{ i: number; estado: string; motivo: string | null; variante: string | null; paga: boolean; gestion_limitada: boolean; servicio_alumnas_suspendido: boolean; cobros_automaticos_pausados: boolean }[]>`
    select c.i, x.*
      from jsonb_to_recordset(${comoJson(entrada)}::text::jsonb) as c(
        i integer, estado text, sid text, tiene_cadena boolean, cadena_estado text, cadena_sid text,
        demo boolean, contrato boolean, supresion boolean, purgado boolean, fase text, dias integer)
      cross join lateral public.situacion_derivada(
        c.estado, c.sid, c.tiene_cadena, c.cadena_estado, c.cadena_sid, c.demo, c.contrato, c.supresion, c.purgado, c.fase, c.dias) x
     order by c.i`;
  assert.equal(filas.length, casos.length);
  const distintos: string[] = [];
  for (const f of filas) {
    const ts = situacionDerivada(casos[f.i]);
    const enSql = { estado: f.estado, motivo: f.motivo, variante: f.variante, paga: f.paga, gestionLimitada: f.gestion_limitada,
      servicioAlumnasSuspendido: f.servicio_alumnas_suspendido, cobrosAutomaticosPausados: f.cobros_automaticos_pausados };
    if (JSON.stringify(enSql) !== JSON.stringify(ts)) distintos.push(`${JSON.stringify(casos[f.i])} → SQL ${JSON.stringify(enSql)} / TS ${JSON.stringify(ts)}`);
  }
  assert.deepEqual(distintos.slice(0, 5), [], `${distintos.length} casos distintos`);
});

test('paridad: fase_plan_gratis (SQL) = estadoGratis del gate (TS), con sus bordes', async () => {
  const entrada: Array<{ i: number; alumnas: number | null; reservas: number | null; excedido: string | null; hoy: string }> = [];
  for (const hoy of ['2026-10-16', '2027-03-28']) {
    for (const alumnas of [null, 0, 119, 120, 150, 151]) for (const reservas of [null, 0, 199, 200, 250, 251]) {
      for (const d of [null, -40, -30, -29, -1, 0, 3]) {
        entrada.push({ i: entrada.length, alumnas, reservas, excedido: d === null ? null : masDias(hoy, d), hoy });
      }
    }
  }
  const filas = await sql<{ i: number; fase: string }[]>`
    select c.i, public.fase_plan_gratis(c.alumnas, c.reservas, c.excedido::date, c.hoy::date) as fase
      from jsonb_to_recordset(${comoJson(entrada)}::text::jsonb) as c(i integer, alumnas integer, reservas integer, excedido text, hoy text)
     order by c.i`;
  assert.equal(filas.length, entrada.length);
  const distintos = filas.filter(f => {
    const e = entrada[f.i];
    const uso = e.alumnas === null || e.reservas === null ? null : { alumnasActivas: e.alumnas, reservas30Dias: e.reservas };
    return faseDelGratis(uso, e.excedido, e.hoy) !== f.fase;
  });
  assert.deepEqual(distintos.map(f => ({ ...entrada[f.i], sql: f.fase })), []);
});

// ─── Las señales, con filas de verdad ────────────────────────────────────────

test('actividad real: cuenta lo que hace una persona, no lo que hace Tentare solo; los cierres no cuentan', async () => {
  const p = await crearStudioConPropietaria(admin);
  try {
    await ok('estudio gratis antiguo', admin.from('studios').update({ subscription_status: 'gratis', creado_en: '2026-01-01T10:00:00Z' }).eq('id', p.studioId));
    const [socia1, socia2] = [await crearSocia(admin, p.studioId), await crearSocia(admin, p.studioId)];
    const sesion = await crearSesion(admin, p.studioId);
    await ok('acción del equipo', admin.from('actividad_reciente').insert({ id: id('act'), studio_id: p.studioId, tipo: 'prueba', texto: 'prueba', origen: 'EQUIPO', creado_en: '2026-08-01T10:00:00Z' }));
    await ok('acción de Tentare (no cuenta)', admin.from('actividad_reciente').insert({ id: id('act'), studio_id: p.studioId, tipo: 'prueba', texto: 'prueba', origen: 'TENTARE', creado_en: '2026-09-01T10:00:00Z' }));
    await ok('reserva de una alumna', admin.from('reservas').insert({ id: id('res'), studio_id: p.studioId, sesion_id: sesion, socio_id: socia1, estado: 'CONFIRMADA', creado_en: '2026-08-10T10:00:00Z' }));
    await ok('reserva de clase fija (no cuenta)', admin.from('reservas').insert({ id: `res-pf-${id('x')}`, studio_id: p.studioId, sesion_id: sesion, socio_id: socia2, estado: 'CONFIRMADA', creado_en: '2026-09-10T10:00:00Z' }));
    // Una marca posterior al día que se mira no cuenta (ni una fecha inventada).
    await ok('marca futura', admin.from('estudio_marcas_uso').insert({ studio_id: p.studioId, panel_dia: '2026-12-01', panel_origen: 'marca' }));
    await ok('cierre del centro', admin.from('cierres_estudio').insert({ id: id('cie'), studio_id: p.studioId, desde: '2026-08-20', hasta: '2026-08-26' }));

    const [{ ultima }] = await sql<{ ultima: Date | null }[]>`select public.ultima_actividad_real(${p.studioId}, '2026-10-01'::date) as ultima`;
    assert.equal(ultima?.toISOString(), '2026-08-10T10:00:00.000Z');

    const situacion = async (hoy: string) => (await sql<{ estado: string; ancla: string; dias_de_cierre: number; dias_sin_actividad: number; avisos: string[] }[]>`
      select estado, ancla::text as ancla, dias_de_cierre, dias_sin_actividad, avisos from public.situacion_estudio(${p.studioId}, ${hoy}::date)`)[0];
    const ts = (hoy: string) => diasSinActividad({
      ultimaActividad: '2026-08-10T10:00:00Z', creadoEn: '2026-01-01T10:00:00Z', eventosDePlan: [],
      cierres: [{ desde: '2026-08-20', hasta: '2026-08-26' }], hoy,
    });
    const a = await situacion('2026-10-01');
    assert.deepEqual({ ancla: a.ancla, cierre: a.dias_de_cierre, dias: a.dias_sin_actividad }, { ancla: ts('2026-10-01').ancla, cierre: 7, dias: ts('2026-10-01').dias });
    assert.equal(a.estado, 'GRATIS');
    assert.ok(a.avisos.includes('gratis_sin_medir'));
    assert.ok(a.avisos.includes('marca_posterior_al_dia'));
    const b = await situacion('2026-10-15');
    assert.equal(b.dias_sin_actividad, ts('2026-10-15').dias);
    assert.equal(b.estado, b.dias_sin_actividad >= DIAS_HASTA_INACTIVO ? 'INACTIVO' : 'GRATIS');
    assert.equal((await situacion('2026-10-20')).estado, 'INACTIVO');
    // Un día de antes del alta se mira con lo que había: el ancla no pasa de ese día.
    assert.equal((await situacion('2025-12-01')).ancla, '2025-12-01');

    // La misma, demo: la falta de uso no la mueve, y queda apuntado.
    await ok('demo', admin.from('studios').update({ es_demo: true }).eq('id', p.studioId));
    const demo = await situacion('2027-06-01');
    assert.equal(demo.estado, 'GRATIS');
    assert.ok(demo.avisos.includes('demo_fuera_de_transiciones'));
  } finally {
    await limpiarFixtures(admin, [p]);
  }
});

test('acciones del registro de cambios: solo las de alguien del estudio, no las de fuera (Tentare desde /interno)', async () => {
  const [p, ajena] = [await crearStudioConPropietaria(admin), await crearStudioConPropietaria(admin)];
  try {
    await ok('estudio gratis antiguo', admin.from('studios').update({ subscription_status: 'gratis', creado_en: '2026-01-01T10:00:00Z' }).eq('id', p.studioId));
    const accion = (actor: string, cuando: string) => sql`
      insert into public.auditoria_estudio (studio_id, ocurrido_en, actor_uid, actor_rol, tabla, fila_id, operacion)
      values (${p.studioId}, ${cuando}::timestamptz, ${actor}::uuid, 'PROPIETARIO', 'recibos', 'r-1', 'UPDATE')`;
    await accion(p.authUserId, '2026-08-01T10:00:00Z');
    // Alguien que no es de este estudio (otra cuenta: p. ej. el equipo de Tentare), más reciente: no cuenta.
    await accion(ajena.authUserId, '2026-09-01T10:00:00Z');
    const [{ ultima }] = await sql<{ ultima: Date | null }[]>`select public.ultima_actividad_real(${p.studioId}, '2026-10-01'::date) as ultima`;
    assert.equal(ultima?.toISOString(), '2026-08-01T10:00:00.000Z');
  } finally {
    await limpiarFixtures(admin, [p, ajena]);
  }
});

test('el día es el de Madrid: una acción a las 00:30 de Madrid cuenta para ese día, no para el anterior', async () => {
  const p = await crearStudioConPropietaria(admin);
  try {
    await ok('estudio gratis antiguo', admin.from('studios').update({ subscription_status: 'gratis', creado_en: '2026-01-01T10:00:00Z' }).eq('id', p.studioId));
    // 20-oct-2026 00:30 en Madrid (CEST) = 19-oct 22:30 UTC.
    await ok('acción a las 00:30', admin.from('actividad_reciente').insert({ id: id('act'), studio_id: p.studioId, tipo: 'prueba', texto: 'prueba', origen: 'EQUIPO', creado_en: '2026-10-19T22:30:00Z' }));
    const [{ el19, el20 }] = await sql<{ el19: Date | null; el20: Date | null }[]>`
      select public.ultima_actividad_real(${p.studioId}, '2026-10-19'::date) as el19,
             public.ultima_actividad_real(${p.studioId}, '2026-10-20'::date) as el20`;
    assert.equal(el19, null, 'una acción del día 20 de Madrid no puede contar el 19');
    assert.equal(el20?.toISOString(), '2026-10-19T22:30:00.000Z');
    const [f] = await sql<{ ancla: string; dias: number }[]>`
      select ancla::text as ancla, dias_sin_actividad as dias from public.situacion_estudio(${p.studioId}, '2026-10-20'::date)`;
    assert.deepEqual({ ...f }, { ancla: '2026-10-20', dias: 0 });
  } finally {
    await limpiarFixtures(admin, [p]);
  }
});

test('quien paga no sale de ACTIVO_PAGO: plan a mano, y una sede con el plan a mano de su cadena', async () => {
  const p = await crearStudioConPropietaria(admin);
  const cadenaId = id('cadena');
  try {
    await ok('plan a mano, sin uso desde hace años', admin.from('studios').update({ subscription_status: 'active', subscription_id: null, creado_en: '2020-01-01T10:00:00Z' }).eq('id', p.studioId));
    const leer = async () => (await sql<{ estado: string; paga: boolean; servicio: boolean; avisos: string[] }[]>`
      select estado, paga, servicio_alumnas_suspendido as servicio, avisos from public.situacion_estudio(${p.studioId}, '2027-06-01'::date)`)[0];
    let f = await leer();
    assert.deepEqual([f.estado, f.paga, f.servicio], ['ACTIVO_PAGO', true, false]);
    assert.ok(f.avisos.includes('plan_a_mano'));

    await ok('cadena con plan a mano', admin.from('cadenas').insert({ id: cadenaId, nombre: 'Cadena de prueba', owner_auth_user_id: p.authUserId, subscription_status: 'active' }));
    await ok('la sede, en la cadena y cancelada por su cuenta', admin.from('studios').update({ cadena_id: cadenaId, subscription_status: 'canceled' }).eq('id', p.studioId));
    f = await leer();
    assert.deepEqual([f.estado, f.paga, f.servicio], ['ACTIVO_PAGO', true, false]);
    assert.ok(f.avisos.includes('plan_de_cadena_a_mano'));
  } finally {
    await admin.from('studios').update({ cadena_id: null }).eq('id', p.studioId);
    await admin.from('cadenas').delete().eq('id', cadenaId);
    await limpiarFixtures(admin, [p]);
  }
});

// ─── Solo lectura de verdad ──────────────────────────────────────────────────

test('las marcas: una al día, idempotentes, y sin tocar una sola columna de `studios`', async () => {
  const p = await crearStudioConPropietaria(admin);
  try {
    const socia = await crearSocia(admin, p.studioId);
    const antes = await huella(p.studioId);

    // Cada marca en su propia sentencia, como las llama el servidor.
    const marcar = async () => {
      const [{ panel }] = await sql<{ panel: boolean | null }[]>`select public.marcar_uso_panel(${p.studioId}) as panel`;
      const [{ app }] = await sql<{ app: boolean | null }[]>`select public.marcar_uso_app(${socia}) as app`;
      return { panel, app };
    };
    const fila = async () => (await sql<{ panel_dia: string; app_dia: string; panel_origen: string; actualizado_en: Date; hoy: string }[]>`
      select m.panel_dia::text as panel_dia, m.app_dia::text as app_dia, m.panel_origen, m.actualizado_en, public.hoy_estudio()::text as hoy
        from public.estudio_marcas_uso m where m.studio_id = ${p.studioId}`)[0];

    assert.deepEqual(await marcar(), { panel: true, app: true });
    const primera = await fila();
    assert.deepEqual([primera.panel_dia, primera.app_dia, primera.panel_origen], [primera.hoy, primera.hoy, 'marca']);
    // Otra vez el mismo día: no escribe nada.
    assert.deepEqual(await marcar(), { panel: null, app: null });
    assert.equal((await fila()).actualizado_en.toISOString(), primera.actualizado_en.toISOString());
    // Un estudio o una socia que no existen: nada, sin error.
    const [{ nada }] = await sql<{ nada: boolean | null }[]>`select coalesce(public.marcar_uso_panel('no-existe'), public.marcar_uso_app('no-existe')) as nada`;
    assert.equal(nada, null);

    assert.equal(await huella(p.studioId), antes, 'una marca de uso ha cambiado la fila del estudio');
  } finally {
    await limpiarFixtures(admin, [p]);
  }
});

test('informe diario: una fila por estudio y día, la segunda pasada no reescribe nada y `studios` no se toca', async () => {
  const p = await crearStudioConPropietaria(admin);
  // Un día lejano: no se mezcla con lo que escriba otro test, y nadie lee este informe para decidir.
  const dia = '2099-01-01';
  try {
    const antes = await huella(p.studioId);
    const [{ r1 }] = await sql<{ r1: { escritas: number; errores: number } }[]>`select public.registrar_situacion_diaria(${dia}::date) as r1`;
    assert.ok(r1.escritas >= 1, JSON.stringify(r1));
    const leer = () => sql<{ estado: string; calculado_en: Date; senales: Record<string, unknown> }[]>`
      select estado, calculado_en, senales from public.estudio_situacion_diaria where studio_id = ${p.studioId} and dia = ${dia}::date`;
    const [primera] = await leer();
    assert.ok(primera, 'no se escribió la fila del estudio');
    assert.notEqual(primera.estado, 'ERROR');
    assert.ok('fuentes' in primera.senales && 'dias_sin_actividad' in primera.senales);

    const [{ r2 }] = await sql<{ r2: { ya_estaban: number } }[]>`select public.registrar_situacion_diaria(${dia}::date) as r2`;
    assert.ok(r2.ya_estaban >= 1);
    const despues = await leer();
    assert.equal(despues.length, 1);
    assert.equal(despues[0].calculado_en.toISOString(), primera.calculado_en.toISOString());
    assert.equal(await huella(p.studioId), antes, 'el informe diario ha cambiado la fila del estudio');
  } finally {
    await limpiarFixtures(admin, [p]);
  }
});

test('punto de partida de la marca del panel: solo el equipo activo de ESE estudio, una sola vez y con su aviso', async () => {
  const [p, otro] = [await crearStudioConPropietaria(admin), await crearStudioConPropietaria(admin)];
  const equipo: InstructoraFixture[] = [];
  try {
    const activa = await crearInstructora(admin, p.studioId, 'RECEPCION');
    const deBaja = await crearInstructora(admin, p.studioId, 'RECEPCION');
    equipo.push(activa, deBaja);
    await ok('ficha de baja', admin.from('instructores').update({ activo: false }).eq('id', deBaja.instructorId));
    // Las sesiones de cada uno, con fechas conocidas (la de Auth la crea el login de cada fixture).
    const sesionDe = (uid: string, cuando: string) => sql`
      update auth.sessions set created_at = ${cuando}::timestamptz, updated_at = ${cuando}::timestamptz,
             refreshed_at = (${cuando}::timestamptz at time zone 'UTC')
       where user_id = ${uid}::uuid`;
    await sesionDe(p.authUserId, '2026-03-01T10:00:00Z');
    await sesionDe(activa.authUserId, '2026-04-01T10:00:00Z');
    await sesionDe(deBaja.authUserId, '2026-05-01T10:00:00Z'); // de baja: no cuenta
    await sesionDe(otro.authUserId, '2026-06-01T10:00:00Z'); // de otro estudio: no cuenta para `p`
    const antes = await huella(p.studioId);

    const marca = async (studioId: string) => (await sql<{ panel_dia: string; panel_origen: string }[]>`
      select panel_dia::text as panel_dia, panel_origen from public.estudio_marcas_uso where studio_id = ${studioId}`)[0];
    await sql`select public.registrar_situacion_diaria('2099-01-02'::date)`;
    assert.deepEqual({ ...(await marca(p.studioId)) }, { panel_dia: '2026-04-01', panel_origen: 'sesiones_iniciales' });
    assert.deepEqual({ ...(await marca(otro.studioId)) }, { panel_dia: '2026-06-01', panel_origen: 'sesiones_iniciales' });
    const [fila] = await sql<{ avisos: string[] }[]>`
      select avisos from public.estudio_situacion_diaria where studio_id = ${p.studioId} and dia = '2099-01-02'::date`;
    assert.ok(fila.avisos.includes('marca_panel_inicial_de_sesiones'), JSON.stringify(fila.avisos));

    // Con el informe ya empezado no se vuelve a sembrar, aunque haya una sesión más nueva.
    await sesionDe(activa.authUserId, '2026-07-01T10:00:00Z');
    const [{ r }] = await sql<{ r: { marcas_de_panel_iniciales: number } }[]>`select public.registrar_situacion_diaria('2099-01-03'::date) as r`;
    assert.deepEqual({ ...(await marca(p.studioId)) }, { panel_dia: '2026-04-01', panel_origen: 'sesiones_iniciales' });
    assert.equal(typeof r.marcas_de_panel_iniciales, 'number');
    // La primera marca de verdad la sustituye (y con ella el aviso).
    await sql`select public.marcar_uso_panel(${p.studioId})`;
    assert.equal((await marca(p.studioId)).panel_origen, 'marca');
    assert.equal(await huella(p.studioId), antes, 'la siembra ha cambiado la fila del estudio');
  } finally {
    for (const i of equipo) await limpiarInstructora(admin, i);
    await limpiarFixtures(admin, [p, otro]);
  }
});

// ─── El navegador, fuera ─────────────────────────────────────────────────────

test('privilegios: las marcas, el informe y las funciones son solo del servidor', async () => {
  const [t] = await sql<{ x: boolean }[]>`
    select bool_or(has_table_privilege(r, t, p)) as x
      from unnest(array['anon', 'authenticated']) as r,
           unnest(array['public.estudio_marcas_uso', 'public.estudio_situacion_diaria']) as t,
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p`;
  assert.equal(t.x, false);

  const p: StudioFixture = await crearStudioConPropietaria(admin);
  try {
    const { error: marca } = await p.comoPropietaria.from('estudio_marcas_uso').insert({ studio_id: p.studioId, panel_dia: '2099-01-01' });
    assert.ok(marca, 'la propietaria pudo escribir su marca de uso');
    const { error: informe } = await p.comoPropietaria.from('estudio_situacion_diaria').select('studio_id').limit(1);
    assert.ok(informe, 'la propietaria pudo leer el informe diario');
    for (const [fn, args] of [
      ['situacion_estudio', { p_studio_id: p.studioId }], ['situacion_estudios', {}], ['registrar_situacion_diaria', {}],
      ['marcar_uso_panel', { p_studio_id: p.studioId }], ['ultima_actividad_real', { p_studio_id: p.studioId }],
      ['sesiones_iniciales_del_equipo', {}],
    ] as const) {
      const { error } = await p.comoPropietaria.rpc(fn, args);
      assert.ok(error, `la propietaria pudo llamar a ${fn}`);
    }
  } finally {
    await limpiarFixtures(admin, [p]);
  }
});
