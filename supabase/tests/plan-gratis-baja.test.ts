// Un estudio gratis con 90 días CERRADO entra en el ciclo de baja de un estudio de pago (decisión del fundador,
// 16-oct-2026; migración 20261016100200), contra Postgres de verdad (job `calidad-rls`):
//
//  · la regla (`plan_gratis_entra_en_baja`): 30 días de margen + 90 cerrado, en días de Madrid, con sus bordes;
//  · el reloj (`reevaluar_baja_plan_gratis`) le pone la fecha, y pagar la quita;
//  · en una cadena, mientras otra sede pague su plan suelto nadie entra en baja ni se purga (salvo la que pidió el
//    borrado), y la principal con 90 días cerrado ya no conserva a las demás;
//  · `studios.creado_en` lo pone el servidor: una sede creada desde el navegador no se hace «la más antigua».
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué vive en `supabase/tests/`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';
import { convertirAGratisSiToca, COLUMNAS_PARA_GRATIS, type FilaParaGratis } from '../../lib/billing/convertir-a-gratis.ts';
import { MARGEN_DIAS } from '../../lib/billing/plan-gratis.ts';
import { DIAS_PLAN_GRATIS_CERRADO_ANTES_DE_BAJA } from '../../lib/retencion/ciclo-estudios-vencidos.ts';

const sql = sqlLocal();
const admin = clienteAdminLocal();
after(async () => { await sql.end(); });

const sufijo = `${process.pid}-${Date.now()}`;
const id = (n: string) => `baja-gratis-${n}-${sufijo}`;

/** ¿Entra en baja ese día? Con el estado y el día dados (por defecto, el de Madrid). */
async function entra(studioId: string, estado: string | null, hoy?: string): Promise<boolean> {
  const [f] = hoy
    ? await sql<{ v: boolean }[]>`select public.plan_gratis_entra_en_baja(${studioId}, ${estado}, ${hoy}::date) as v`
    : await sql<{ v: boolean }[]>`select public.plan_gratis_entra_en_baja(${studioId}, ${estado}) as v`;
  return f!.v;
}

async function enBaja(studioId: string): Promise<boolean> {
  const [f] = await sql<{ v: boolean }[]>`select contrato_terminado_en is not null as v from public.studios where id = ${studioId}`;
  return f!.v;
}

async function purga(studioId: string): Promise<string> {
  try {
    await sql`select public.purgar_estudio_vencido(${studioId}, false)`;
    return 'admitida';
  } catch (e) {
    return (e as Error).message;
  }
}

test('la regla: 30 días de margen y 90 cerrado, en días de Madrid, con los bordes', async () => {
  const s = id('regla');
  try {
    await sql`insert into public.studios (id, nombre) values (${s}, 'Baja gratis')`;
    await sql`update public.studios set subscription_status = 'gratis_cerrado', plan = 'BASE' where id = ${s}`;
    // Se pasó el 1 de mayo; se medía desde mucho antes.
    await sql`insert into public.uso_plan_gratis (studio_id, excedido_desde, creado_en) values (${s}, '2026-05-01', '2026-01-01T10:00:00Z')`;
    assert.equal(MARGEN_DIAS + DIAS_PLAN_GRATIS_CERRADO_ANTES_DE_BAJA, 120);
    // Cierra el 31 de mayo; entra en baja el 29 de agosto (31-may + 90), no el 28.
    assert.equal(await entra(s, 'gratis_cerrado', '2026-08-28'), false, 'un día antes');
    assert.equal(await entra(s, 'gratis_cerrado', '2026-08-29'), true, 'el día justo');
    assert.equal(await entra(s, 'gratis', '2026-08-29'), true, "'gratis' en la base (la dueña no ha vuelto) cuenta igual");
    for (const estado of ['active', 'trialing', 'past_due', 'incomplete', 'canceled', null]) {
      assert.equal(await entra(s, estado, '2027-01-01'), false, `${estado}: solo el plan gratis`);
    }

    // Un estudio que entró en el gratis DESPUÉS (el grupo de la dueña ya se había pasado): sus 90 días
    // cuentan desde que se midió por primera vez, y ese día es el de Madrid: las 22:30 UTC del 17 de julio
    // son las 00:30 del 18 en Madrid.
    await sql`update public.uso_plan_gratis set creado_en = '2026-07-17T22:30:00Z' where studio_id = ${s}`;
    assert.equal(await entra(s, 'gratis_cerrado', '2026-10-15'), false, 'con el día UTC (17-jul) ya entraría');
    assert.equal(await entra(s, 'gratis_cerrado', '2026-10-16'), true, '18-jul (Madrid) + 90');

    // Sin fecha de exceso (no se ha pasado, o volvió a bajar en el margen), nunca.
    await sql`update public.uso_plan_gratis set excedido_desde = null where studio_id = ${s}`;
    assert.equal(await entra(s, 'gratis_cerrado', '2030-01-01'), false);

    // El día por defecto es el de Madrid.
    const [{ args }] = await sql<{ args: string }[]>`
      select pg_get_function_arguments('public.plan_gratis_entra_en_baja(text, text, date)'::regprocedure) as args`;
    assert.match(args, /p_hoy date DEFAULT (public\.)?hoy_estudio\(\)/);
  } finally {
    await sql`delete from public.studios where id = ${s}`;
  }
});

test('un estudio suelto: el reloj le pone la fecha, la guardia la respeta y pagar la quita', async () => {
  const [a, b] = [id('suelto-a'), id('suelto-b')];
  try {
    await sql`insert into public.studios (id, nombre) values (${a}, 'Baja gratis'), (${b}, 'Baja gratis')`;
    await sql`update public.studios set subscription_status = 'gratis_cerrado', plan = 'BASE' where id in (${a}, ${b})`;
    await sql`
      insert into public.uso_plan_gratis (studio_id, excedido_desde, creado_en) values
        (${a}, public.hoy_estudio() - 120, now() - interval '200 days'),
        (${b}, public.hoy_estudio() - 119, now() - interval '200 days')`;
    // Ningún trigger se dispara porque pase el tiempo: hasta que el barrido lo mira, nada.
    assert.equal(await enBaja(a), false);
    await sql`select public.reevaluar_baja_plan_gratis()`;
    assert.equal(await enBaja(a), true, '90 días cerrado: en baja');
    assert.equal(await enBaja(b), false, '89: todavía no');

    // Recién en baja no se purga; con la petición de borrado (la escribe el servidor), sí.
    assert.match(await purga(a), /no lleva 90 días/);
    await sql`update public.studios set supresion_pedida_en = now() where id = ${a}`;
    assert.equal(await purga(a), 'admitida');
    // Uno que no lleva los 90 días no se purga aunque alguien le pusiera una fecha de baja.
    await sql`update public.studios set supresion_pedida_en = now() where id = ${b}`;
    assert.match(await purga(b), /no lleva 90 días/);

    // Paga (o empieza a pagar): fuera de la baja, sin petición de borrado.
    await sql`update public.studios set subscription_status = 'incomplete' where id = ${a}`;
    const [f] = await sql<{ fin: Date | null; pedida: Date | null }[]>`
      select contrato_terminado_en as fin, supresion_pedida_en as pedida from public.studios where id = ${a}`;
    assert.deepEqual(f, { fin: null, pedida: null });
  } finally {
    await sql`delete from public.studios where id in (${a}, ${b})`;
  }
});

test('una cadena: nadie en baja mientras otra sede paga su plan, y la principal con 90 días cerrado ya no conserva a las demás', async () => {
  const p = await crearStudioConPropietaria(admin);
  const cadena = id('cadena');
  const [principal, f1, f2, q] = [p.studioId, id('f1'), id('f2'), id('q')];
  try {
    await sql`insert into public.cadenas (id, nombre, owner_auth_user_id, plan, subscription_status)
              values (${cadena}, 'Cadena', ${p.authUserId}, 'CADENA', 'canceled')`;
    await sql`update public.studios set cadena_id = ${cadena} where id = ${principal}`;
    await sql`insert into public.studios (id, nombre, owner_auth_user_id, cadena_id) values
                (${f1}, 'Sede', ${p.authUserId}, ${cadena}), (${f2}, 'Sede', ${p.authUserId}, ${cadena}),
                (${q}, 'Sede', ${p.authUserId}, ${cadena})`;
    await sql`update public.studios set subscription_status = 'gratis_cerrado', plan = 'BASE' where id = ${principal}`;
    await sql`update public.studios set subscription_status = 'active', plan = 'BASE' where id = ${q}`;
    await sql`insert into public.uso_plan_gratis (studio_id, excedido_desde, creado_en)
              values (${principal}, public.hoy_estudio() - 130, now() - interval '200 days')`;

    // Q paga su plan suelto: la dueña sigue siendo clienta.
    await sql`select public.reevaluar_baja_plan_gratis()`;
    for (const s of [principal, f1, f2, q]) assert.equal(await enBaja(s), false, s);

    // Q lo cancela: todas en baja al momento, sin esperar al barrido.
    await sql`update public.studios set subscription_status = 'canceled' where id = ${q}`;
    for (const s of [principal, f1, f2, q]) assert.equal(await enBaja(s), true, s);

    // Q vuelve a pagar: fuera de la baja todas, salvo la que ya pidió el borrado.
    await sql`update public.studios set supresion_pedida_en = now() where id = ${f1}`;
    await sql`update public.studios set subscription_status = 'active' where id = ${q}`;
    assert.equal(await enBaja(principal), false);
    assert.equal(await enBaja(f2), false);
    assert.equal(await enBaja(f1), true, 'la que pidió el borrado lo conserva');
    // Y la guardia lo dice por su cuenta: con Q pagando, una sede no se purga salvo que lo pidiera.
    assert.equal(await purga(f1), 'admitida');
    assert.match(await purga(f2), /no lleva 90 días|otra sede de la cadena/);

    // La cadena vuelve a pagar: manda en todas, nada en baja.
    await sql`update public.cadenas set subscription_status = 'active' where id = ${cadena}`;
    for (const s of [principal, f1, f2, q]) assert.equal(await enBaja(s), false, s);
  } finally {
    await sql`delete from public.studios where id in (${f1}, ${f2}, ${q})`;
    await sql`update public.studios set cadena_id = null where id = ${principal}`;
    await sql`delete from public.cadenas where id = ${cadena}`;
    await limpiarFixtures(admin, [p]);
  }
});

test('volver al gratis tras un periodo pagado empieza de cero: la medición vieja no lo deja en baja', async () => {
  const s = id('vuelve');
  try {
    await sql`insert into public.studios (id, nombre) values (${s}, 'Baja gratis')`;
    // Se pasó hace mucho, pagó Founding Studio y ahora cancela: la baja de pago le pone la fecha.
    await sql`insert into public.uso_plan_gratis (studio_id, excedido_desde, creado_en)
              values (${s}, public.hoy_estudio() - 200, now() - interval '300 days')`;
    await sql`update public.studios set subscription_status = 'canceled', subscription_id = 'sub_prueba' where id = ${s}`;
    assert.equal(await enBaja(s), true, 'cancelado: baja de pago');

    // Vuelve al plan gratis por la conversión de verdad.
    const { data, error } = await admin.from('studios').select(COLUMNAS_PARA_GRATIS).eq('id', s).single();
    assert.ok(!error, error?.message);
    const r = await convertirAGratisSiToca(admin, data as unknown as FilaParaGratis, { entorno: { FOUNDING_GRATIS: 'on' }, stripe: null });
    assert.equal(r, 'convertido');
    assert.equal(await enBaja(s), false, 'abierto y empezando de cero: ni avisos de borrado ni copias paradas');
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.uso_plan_gratis where studio_id = ${s}`;
    assert.equal(n, 0);
  } finally {
    await sql`delete from public.studios where id = ${s}`;
  }
});

test('el reloj arregla lo desajustado: las sedes entran aunque otro UPDATE se llevara la transición de la principal', async () => {
  const p = await crearStudioConPropietaria(admin);
  const cadena = id('cadena-reloj');
  const [principal, f1] = [p.studioId, id('reloj-f1')];
  try {
    await sql`insert into public.cadenas (id, nombre, owner_auth_user_id, plan, subscription_status)
              values (${cadena}, 'Cadena', ${p.authUserId}, 'CADENA', 'canceled')`;
    await sql`update public.studios set cadena_id = ${cadena} where id = ${principal}`;
    await sql`insert into public.studios (id, nombre, owner_auth_user_id, cadena_id) values (${f1}, 'Sede', ${p.authUserId}, ${cadena})`;
    await sql`update public.studios set subscription_status = 'gratis_cerrado', plan = 'BASE' where id = ${principal}`;
    assert.equal(await enBaja(f1), false, 'con la principal en el gratis, la sede se conserva');
    // Pasan los 90 días (la medición ya es vieja) y cualquier otro UPDATE de la principal (Connect, /interno…) le pone
    // la fecha: la transición se la lleva él, no el reloj, y su sede no se recalcula.
    await sql`insert into public.uso_plan_gratis (studio_id, excedido_desde, creado_en)
              values (${principal}, public.hoy_estudio() - 130, now() - interval '200 days')`;
    await sql`update public.studios set nombre = nombre where id = ${principal}`;
    assert.equal(await enBaja(principal), true);
    assert.equal(await enBaja(f1), false, 'todavía sin recalcular');
    // El reloj la ve desajustada y la pasa por el trigger.
    await sql`select public.reevaluar_baja_plan_gratis()`;
    assert.equal(await enBaja(f1), true, 'con la principal en baja, ya no hay quien la conserve');
    // Y no reescribe lo que ya está bien (una fila reescrita cambia de versión, `xmin`).
    const version = async () => (await sql<{ v: string }[]>`
      select string_agg(xmin::text, ',' order by id) as v from public.studios where id in (${principal}, ${f1})`)[0]!.v;
    const antes = await version();
    await sql`select public.reevaluar_baja_plan_gratis()`;
    assert.equal(await version(), antes);
  } finally {
    await sql`delete from public.studios where id = ${f1}`;
    await sql`update public.studios set cadena_id = null where id = ${principal}`;
    await sql`delete from public.cadenas where id = ${cadena}`;
    await limpiarFixtures(admin, [p]);
  }
});

test('con un pago de Cadena en marcha, la principal no entra en baja; si se abandona, el reloj la mete', async () => {
  const p = await crearStudioConPropietaria(admin);
  const cadena = id('cadena-3ds');
  const principal = p.studioId;
  try {
    await sql`insert into public.cadenas (id, nombre, owner_auth_user_id, plan, subscription_status)
              values (${cadena}, 'Cadena', ${p.authUserId}, 'CADENA', 'canceled')`;
    await sql`update public.studios set cadena_id = ${cadena} where id = ${principal}`;
    await sql`update public.studios set subscription_status = 'gratis_cerrado', plan = 'BASE' where id = ${principal}`;
    await sql`insert into public.uso_plan_gratis (studio_id, excedido_desde, creado_en)
              values (${principal}, public.hoy_estudio() - 130, now() - interval '200 days')`;
    for (const estado of ['incomplete', 'unpaid']) {
      await sql`update public.cadenas set subscription_status = ${estado} where id = ${cadena}`;
      await sql`select public.reevaluar_baja_plan_gratis()`;
      assert.equal(await enBaja(principal), false, `cadena ${estado}: nada de «descarga tus datos» en mitad de un pago`);
      assert.match(await purga(principal), /no lleva 90 días/, estado);
    }
    await sql`update public.cadenas set subscription_status = 'incomplete_expired' where id = ${cadena}`;
    await sql`select public.reevaluar_baja_plan_gratis()`;
    assert.equal(await enBaja(principal), true);
  } finally {
    await sql`update public.studios set cadena_id = null where id = ${principal}`;
    await sql`delete from public.cadenas where id = ${cadena}`;
    await limpiarFixtures(admin, [p]);
  }
});

test('studios.creado_en lo pone el servidor: desde el navegador una fecha antigua no hace de la sede «la más antigua»', async () => {
  const p = await crearStudioConPropietaria(admin);
  const [desdeNavegador, desdeServidor] = [id('nav'), id('srv')];
  try {
    const { error } = await p.comoPropietaria.from('studios').insert({
      id: desdeNavegador, nombre: 'Sede', owner_auth_user_id: p.authUserId, creado_en: '2000-01-01T00:00:00Z',
    });
    assert.ok(!error, error?.message);
    const { error: e2 } = await admin.from('studios').insert({ id: desdeServidor, nombre: 'Sede', creado_en: '2000-01-01T00:00:00Z' });
    assert.ok(!e2, e2?.message);

    const [nav] = await sql<{ reciente: boolean }[]>`
      select creado_en > now() - interval '1 hour' as reciente from public.studios where id = ${desdeNavegador}`;
    assert.equal(nav?.reciente, true, 'la del navegador nace con la hora del servidor');
    const [srv] = await sql<{ creado_en: Date }[]>`select creado_en from public.studios where id = ${desdeServidor}`;
    assert.equal(srv?.creado_en.toISOString(), '2000-01-01T00:00:00.000Z', 'el servidor (importaciones, seed) sí puede fijarla');
  } finally {
    await sql`delete from public.studios where id in (${desdeNavegador}, ${desdeServidor})`;
    await limpiarFixtures(admin, [p]);
  }
});
