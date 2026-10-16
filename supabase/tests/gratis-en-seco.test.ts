// El plan gratis medido EN SECO en el informe diario de bajas (migración 20261016174500), contra
// Postgres de verdad:
//
//  · solo lectura de verdad: ni `uso_plan_gratis` (el gate cierra el panel leyéndola) ni `studios`
//    cambian una sola fila (md5 antes y después);
//  · quien paga no se mide, ni las demos; y sin BAJAS_AUTOMATICAS=informe no corre nada;
//  · el grupo de la dueña con la regla de hoy y con la propuesta (sin la abandonada ni la demo), y el
//    aviso cuando difieren;
//  · una vez por estudio y día: la segunda pasada no mide ni reescribe;
//  · el número del informe es el del gate: medido el mismo día, `refrescarUsoGratis` guarda lo mismo.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSesion, crearSocia, crearStudioConPropietaria, limpiarFixtures, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';
import { medirGratisEnSeco } from '../../lib/retencion/gratis-en-seco-servidor.ts';
import { medirUsoGratis, refrescarUsoGratis } from '../../lib/billing/uso-gratis-servidor.ts';
import type { InformeGratis } from '../../lib/retencion/gratis-en-seco.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
after(async () => { await sql.end(); });

// Un día lejano: no se mezcla con lo que escriba otro test, y nadie lee este informe para decidir.
const DIA = '2099-03-10';
const AHORA = new Date('2099-03-10T11:00:00Z');
const informe = { BAJAS_AUTOMATICAS: 'informe' };

/** Una escritura que tiene que salir bien: si no, el test falla diciendo cuál. */
async function ok(paso: string, q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  assert.ok(!error, `${paso}: ${error?.message}`);
}

/** La huella de las filas ENTERAS de cada estudio en `studios` y en `uso_plan_gratis`. */
async function huellas(ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const [f] = await sql<{ st: string | null; uso: string | null }[]>`
      select (select md5(st::text) from public.studios st where st.id = ${id}) as st,
             (select md5(u::text) from public.uso_plan_gratis u where u.studio_id = ${id}) as uso`;
    out.push(`${id}:${f.st}:${f.uso}`);
  }
  return out;
}

async function filasDelDia(ids: string[]) {
  const { data, error } = await admin.from('estudio_situacion_diaria')
    .select('studio_id, estado, motivo, gratis, avisos').eq('dia', DIA).in('studio_id', ids);
  assert.ok(!error, error?.message);
  return new Map((data ?? []).map(f => [f.studio_id as string, f as { estado: string; motivo: string | null; gratis: InformeGratis | null; avisos: string[] }]));
}

test('gratis en seco: mide sin tocar el gate ni `studios`, deja fuera a quien paga y a la demo, compara las dos reglas del grupo y da el número del gate', async () => {
  const p = await crearStudioConPropietaria(admin);
  const sufijo = `${process.pid}-${Date.now()}`;
  const [abandonado, demo, pagado] = [`abandonado-seco-${sufijo}`, `demo-seco-${sufijo}`, `pagado-seco-${sufijo}`];
  const b = p.studioId;
  const todos = [b, abandonado, demo, pagado];
  try {
    // B: gratis, con uso y abriendo el panel en 2099. Las otras tres, de la misma dueña.
    await ok('B gratis', admin.from('studios').update({ subscription_status: 'gratis' }).eq('id', b));
    await ok('alta de los otros estudios', admin.from('studios').insert([abandonado, demo, pagado].map(id => ({ id, nombre: 'Estudio de prueba', owner_auth_user_id: p.authUserId }))));
    // Después del alta: el trigger del alta les pone la prueba local.
    await ok('abandonado, gratis', admin.from('studios').update({ subscription_status: 'gratis' }).eq('id', abandonado));
    await ok('demo, gratis', admin.from('studios').update({ subscription_status: 'gratis', es_demo: true }).eq('id', demo));
    await ok('el que paga', admin.from('studios').update({ subscription_status: 'active', subscription_id: `sub_${sufijo}` }).eq('id', pagado));
    await ok('B abre el panel', admin.from('estudio_marcas_uso').insert({ studio_id: b, panel_dia: '2099-03-09', panel_origen: 'marca' }));
    const socia = await crearSocia(admin, b);
    const sesion = await crearSesion(admin, b);
    await ok('la clase, en la ventana de 30 días', admin.from('sesiones').update({ inicio: '2099-03-05T10:00:00Z', fin: '2099-03-05T10:50:00Z' }).eq('id', sesion));
    const reserva = `res-seco-${sufijo}`;
    await ok('la reserva', admin.from('reservas').insert({ id: reserva, studio_id: b, sesion_id: sesion, socio_id: socia, estado: 'CONFIRMADA' }));
    await ok('vino', admin.from('reservas').update({ estado: 'ASISTIDA' }).eq('id', reserva));
    // Lo que el gate ya tenía guardado de la abandonada (para que la huella mire una fila de verdad).
    await ok('medición vieja', admin.from('uso_plan_gratis').insert({ studio_id: abandonado, alumnas_activas: 0, reservas_30_dias: 0, medido_en: '2099-03-01T00:00:00Z' }));

    await sql`select public.registrar_situacion_diaria(${DIA}::date)`;
    let filas = await filasDelDia(todos);
    assert.deepEqual([filas.get(b)?.estado, filas.get(abandonado)?.estado, filas.get(abandonado)?.motivo, filas.get(demo)?.estado, filas.get(pagado)?.estado],
      ['GRATIS', 'SUSPENDIDO', 'abandono', 'GRATIS', 'ACTIVO_PAGO']);

    const antes = await huellas(todos);

    // Apagado: ni lee.
    assert.deepEqual(await medirGratisEnSeco(admin, { hoy: DIA, ahora: AHORA, entorno: {} }), { skipped: 'BAJAS_AUTOMATICAS no está en informe' });
    assert.equal((await filasDelDia([b])).get(b)?.gratis, null);

    const medidos: string[] = [];
    const espia: typeof medirUsoGratis = async (a, ids, ahora) => { medidos.push(...ids); return medirUsoGratis(a, ids, ahora); };
    const r1 = await medirGratisEnSeco(admin, { hoy: DIA, ahora: AHORA, entorno: informe, tope: 100_000, medir: espia });
    assert.ok('apuntados' in r1 && r1.apuntados >= 2, JSON.stringify(r1));

    assert.deepEqual(await huellas(todos), antes, 'el informe ha cambiado `studios` o `uso_plan_gratis`');
    assert.ok(!medidos.includes(pagado), 'se ha medido a un estudio que paga');

    filas = await filasDelDia(todos);
    assert.equal(filas.get(pagado)?.gratis, null);
    assert.equal(filas.get(demo)?.gratis, null);
    assert.ok(filas.get(abandonado)?.gratis, 'la abandonada sigue siendo gratis: se mide');
    const g = filas.get(b)!.gratis!;
    assert.deepEqual(g.propio, { alumnas: 1, reservas: 1 });
    assert.deepEqual([...g.actual!.grupo].sort(), [b, abandonado, demo].sort());
    assert.deepEqual([g.actual!.alumnas, g.actual!.reservas, g.actual!.fase, g.actual!.excedido_desde], [1, 1, 'DENTRO', null]);
    assert.equal(g.guardado?.fase, 'SIN_MEDIR');
    assert.deepEqual(g.propuesta?.grupo, [b]);
    assert.deepEqual([...g.propuesta!.fuera].sort((x, y) => x.id.localeCompare(y.id)),
      [{ id: abandonado, motivo: 'abandono' }, { id: demo, motivo: 'demo' }].sort((x, y) => x.id.localeCompare(y.id)));
    assert.equal(g.grupo_difiere, true);
    assert.deepEqual(g.ambiguo, []);
    for (const a of ['grupo_dueña_difiere', 'gratis_lo_mediria_el_barrido']) assert.ok(filas.get(b)!.avisos.includes(a), a);

    // Una vez por estudio y día: la segunda pasada no mide ni reescribe.
    medidos.length = 0;
    await medirGratisEnSeco(admin, { hoy: DIA, ahora: new Date(AHORA.getTime() + 3_600_000), entorno: informe, tope: 100_000, medir: espia });
    assert.ok(!medidos.includes(b));
    assert.equal((await filasDelDia([b])).get(b)?.gratis?.medido_en, g.medido_en);
    assert.deepEqual(await huellas(todos), antes);

    // El número del gate: medido el mismo día, guarda lo mismo que dice el informe.
    assert.equal(await refrescarUsoGratis(admin, b, p.authUserId, AHORA), true);
    const { data: uso, error } = await admin.from('uso_plan_gratis').select('studio_id, alumnas_activas, reservas_30_dias, excedido_desde').in('studio_id', [b, abandonado, demo]);
    assert.ok(!error, error?.message);
    const deB = uso!.find(u => u.studio_id === b)!;
    assert.deepEqual([deB.alumnas_activas, deB.reservas_30_dias, deB.excedido_desde], [g.propio!.alumnas, g.propio!.reservas, g.actual!.excedido_desde]);
    assert.equal(uso!.reduce((t, u) => t + (u.alumnas_activas as number), 0), g.actual!.alumnas);
    assert.equal(uso!.reduce((t, u) => t + (u.reservas_30_dias as number), 0), g.actual!.reservas);

    // El navegador no lee la columna.
    const { error: desdeElNavegador } = await p.comoPropietaria.from('estudio_situacion_diaria').select('gratis').limit(1);
    assert.ok(desdeElNavegador, 'la propietaria pudo leer el informe');
  } finally {
    await admin.from('uso_plan_gratis').delete().in('studio_id', todos);
    await admin.from('studios').delete().in('id', [abandonado, demo, pagado]);
    await limpiarFixtures(admin, [p]);
  }
});
