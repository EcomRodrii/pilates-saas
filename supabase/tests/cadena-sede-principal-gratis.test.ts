// Una cadena que deja de pagar (decisión del fundador, 15-oct-2026; migración
// 20261015141653), contra Postgres de verdad (job `calidad-rls`):
//
//  · su sede PRINCIPAL (la más antigua) pasa a Founding Studio gratis, y la BD
//    no se lo pisa con el estado de la cadena ni le da el contrato por terminado;
//  · las DEMÁS siguen cerradas, sin contrato terminado (no se avisa de borrado
//    ni se purga: la dueña sigue siendo clienta), salvo la que ya pidió el
//    borrado, que lo conserva;
//  · si vuelve a pagar Cadena, la cadena manda otra vez en todas.
//
// La conversión es la de verdad (`convertirAGratisSiToca`), no un UPDATE a mano:
// así se prueba también cómo elige la principal.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';
import { convertirAGratisSiToca, COLUMNAS_PARA_GRATIS, type FilaParaGratis } from '../../lib/billing/convertir-a-gratis.ts';

const admin = clienteAdminLocal();
const encendido = { entorno: { FOUNDING_GRATIS: 'on' }, stripe: null };

interface Foto { estado: string | null; plan: string | null; terminado: boolean }

/** Una escritura que tiene que salir bien: si no, el test falla diciendo cuál. */
async function ok(paso: string, q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  assert.ok(!error, `${paso}: ${error?.message}`);
}

test('cadena que deja de pagar: la principal a gratis, las demás cerradas sin borrar nada (salvo la que pidió el borrado), y al volver a pagar manda la cadena', async () => {
  const p = await crearStudioConPropietaria(admin);
  const sufijo = `${process.pid}-${Date.now()}`;
  const cadenaId = `cadena-gratis-${sufijo}`;
  const [sede2, sede3] = [`sede2-gratis-${sufijo}`, `sede3-gratis-${sufijo}`];
  const nombres: Record<string, string> = { [p.studioId]: 'principal', [sede2]: 'sede2', [sede3]: 'sede3' };
  try {
    // Como en /api/billing/checkout: la cadena nace del estudio desde el que se contrata…
    await ok('alta de la cadena', admin.from('cadenas').insert({ id: cadenaId, nombre: 'Cadena de prueba', owner_auth_user_id: p.authUserId }));
    await ok('vincular la principal', admin.from('studios').update({ cadena_id: cadenaId, creado_en: '2000-01-01T00:00:00Z' }).eq('id', p.studioId));
    // …y las demás sedes se crean después (/api/cadena/sedes).
    await ok('alta de las otras sedes', admin.from('studios').insert([sede2, sede3].map(id => ({ id, nombre: 'Sede de prueba', owner_auth_user_id: p.authUserId, cadena_id: cadenaId }))));

    const cadena = (paso: string, v: Record<string, unknown>) => ok(paso, admin.from('cadenas').update(v).eq('id', cadenaId));
    const sede = (paso: string, id: string, v: Record<string, unknown>) => ok(paso, admin.from('studios').update(v).eq('id', id));
    const leer = async () => {
      const { data, error } = await admin.from('studios')
        .select('id, subscription_status, plan, contrato_terminado_en, supresion_pedida_en').eq('cadena_id', cadenaId);
      assert.ok(!error, error?.message);
      return new Map((data ?? []).map(s => [nombres[s.id], s as { subscription_status: string | null; plan: string | null; contrato_terminado_en: string | null; supresion_pedida_en: string | null }]));
    };
    const foto = async (): Promise<Record<string, Foto>> => Object.fromEntries([...(await leer())].map(([n, s]) => [
      n, { estado: s.subscription_status, plan: s.plan, terminado: s.contrato_terminado_en !== null },
    ]));
    const fila = async (id: string) => {
      const { data, error } = await admin.from('studios').select(COLUMNAS_PARA_GRATIS).eq('id', id).single();
      assert.ok(!error, error?.message);
      return data as unknown as FilaParaGratis;
    };

    await cadena('la cadena paga', { plan: 'CADENA', subscription_status: 'active' });
    assert.deepEqual((await foto()).sede2, { estado: 'active', plan: 'CADENA', terminado: false });

    // Deja de pagar: todas cerradas y, de momento, con el contrato terminado.
    await cadena('la cadena deja de pagar', { subscription_status: 'canceled' });
    let f = await foto();
    for (const s of ['principal', 'sede2', 'sede3']) assert.deepEqual(f[s], { estado: 'canceled', plan: 'CADENA', terminado: true }, s);

    // Un 'canceled' repetido (otro evento de Stripe) conserva EXACTAMENTE la fecha: no reinicia los 30 días.
    const antes = (await leer()).get('sede2')!.contrato_terminado_en;
    await cadena('evento repetido', { subscription_status: 'canceled', current_period_end: new Date().toISOString() });
    assert.equal((await leer()).get('sede2')!.contrato_terminado_en, antes);

    // La sede3 pide borrar sus datos (lo escribe el servidor, con el contrato ya terminado).
    await sede('petición de borrado', sede3, { supresion_pedida_en: new Date().toISOString() });
    const pedida = (await leer()).get('sede3')!.supresion_pedida_en;
    assert.ok(pedida);

    // Solo la principal pasa a gratis (con su medición de antes borrada: venía de un periodo pagado).
    await ok('medición vieja', admin.from('uso_plan_gratis').insert({ studio_id: p.studioId, excedido_desde: '2026-01-01' }));
    assert.equal(await convertirAGratisSiToca(admin, await fila(sede2), encendido), 'no-toca');
    assert.equal(await convertirAGratisSiToca(admin, await fila(p.studioId), encendido), 'convertido');
    const { data: uso } = await admin.from('uso_plan_gratis').select('studio_id').eq('studio_id', p.studioId);
    assert.equal(uso?.length, 0, 'tras un periodo pagado, la medición empieza de cero');
    f = await foto();
    assert.deepEqual(f.principal, { estado: 'gratis', plan: 'BASE', terminado: false });
    // La sede2, cerrada pero sin contrato terminado: ni avisos de borrado ni purga.
    assert.deepEqual(f.sede2, { estado: 'canceled', plan: 'CADENA', terminado: false });
    // La sede3 pidió el borrado: sigue terminada y conserva su petición.
    assert.deepEqual(f.sede3, { estado: 'canceled', plan: 'CADENA', terminado: true });
    assert.equal((await leer()).get('sede3')!.supresion_pedida_en, pedida);

    // Ni un evento repetido de la cadena ni un pago de Cadena a medias o abandonado le quitan el gratis.
    for (const estado of ['canceled', 'incomplete', 'incomplete_expired']) {
      await cadena(estado, { subscription_status: estado, current_period_end: new Date().toISOString() });
      f = await foto();
      assert.deepEqual(f.principal, { estado: 'gratis', plan: 'BASE', terminado: false }, estado);
      assert.deepEqual(f.sede2, { estado, plan: 'CADENA', terminado: false }, estado);
    }

    // Cerrada por el margen, sigue siendo suya: la sede2 tampoco se borra.
    await sede('gratis cerrado', p.studioId, { subscription_status: 'gratis_cerrado' });
    f = await foto();
    assert.equal(f.principal.terminado, false);
    assert.equal(f.sede2.terminado, false);

    // Vuelve a pagar Cadena: todas abiertas por la cadena, sin trabajo a mano.
    await cadena('vuelve a pagar', { subscription_status: 'active', plan: 'CADENA' });
    f = await foto();
    for (const s of ['principal', 'sede2', 'sede3']) assert.deepEqual(f[s], { estado: 'active', plan: 'CADENA', terminado: false }, s);
    assert.equal(await convertirAGratisSiToca(admin, await fila(p.studioId), encendido), 'no-toca');

    // Y si la principal deja también su plan suelto (sin el gratis), entonces sí termina todo.
    await cadena('la cadena lo deja otra vez', { subscription_status: 'canceled' });
    await sede('la principal paga su plan suelto', p.studioId, { subscription_status: 'active', plan: 'BASE' });
    assert.equal((await foto()).sede2.terminado, false, 'con la principal pagando su plan, las demás se conservan');
    await sede('la principal lo cancela', p.studioId, { subscription_status: 'canceled' });
    f = await foto();
    for (const s of ['principal', 'sede2', 'sede3']) assert.equal(f[s].terminado, true, s);
  } finally {
    await admin.from('uso_plan_gratis').delete().eq('studio_id', p.studioId);
    await admin.from('studios').delete().in('id', [sede2, sede3, p.studioId]);
    await admin.from('cadenas').delete().eq('id', cadenaId);
    await limpiarFixtures(admin, [p]);
  }
});
