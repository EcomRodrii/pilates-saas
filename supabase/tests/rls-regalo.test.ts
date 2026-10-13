// Tarjeta regalo (migración 20261008231136), contra Postgres de verdad (job `calidad-rls`).
//
//  · el libro suma el saldo y la vista de conciliación sale vacía tras cada camino;
//  · gastar es atómico e idempotente (misma clave = una sola vez), nunca deja saldo negativo
//    ni gasta una tarjeta anulada o caducada (con el hoy de Madrid);
//  · crear por la misma sesión de pago dos veces (reintento del webhook) devuelve LA MISMA tarjeta;
//  · el navegador (authenticated) NO escribe ni lee el código; las RPC son solo de service_role;
//  · el libro es solo de inserción.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';
import { huellaCodigo } from '../../lib/regalo/reglas.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
// Sin cerrar la conexión el proceso no termina y el job de CI se queda colgado hasta que lo cancelan.
test.after(async () => { await sql.end(); });
let n = 0;
const sesion = () => `cs_test_regalo_${process.pid}_${Date.now()}_${n++}`;

async function crear(studioId: string, over: Record<string, unknown> = {}) {
  const { data, error } = await admin.rpc('regalo_crear', {
    p_studio_id: studioId, p_origen: 'ONLINE', p_session_id: sesion(), p_payment_intent: 'pi_x', p_importe: 50,
    p_comprador_nombre: 'Ana', p_comprador_email: 'ana@example.com', p_destinatario_nombre: 'Bea',
    p_destinatario_email: 'bea@example.com', p_mensaje: 'Hola', p_caducidad_meses: 12, p_metodo_manual: null,
    p_actor_tipo: 'webhook', p_actor_id: 'evt', ...over,
  });
  assert.ok(!error, error?.message);
  return (Array.isArray(data) ? data[0] : data) as { tarjeta_id: string; codigo: string; creada: boolean };
}

const saldo = async (id: string) => Number((await admin.from('tarjetas_regalo_estado').select('saldo').eq('tarjeta_id', id).single()).data?.saldo);

test('crear es idempotente por sesión de pago y la huella SQL = la de TypeScript', async () => {
  const s = await crearStudioConPropietaria(admin);
  try {
    const ses = sesion();
    const a = await crear(s.studioId, { p_session_id: ses });
    const b = await crear(s.studioId, { p_session_id: ses });
    assert.equal(a.creada, true);
    assert.equal(b.creada, false);
    assert.equal(b.tarjeta_id, a.tarjeta_id);
    assert.match(a.codigo, /^RG-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    const { data } = await admin.from('tarjetas_regalo').select('codigo_hash').eq('id', a.tarjeta_id).single();
    assert.equal(data?.codigo_hash, huellaCodigo(a.codigo), 'la huella de SQL y la de TS han divergido');
    const { count } = await admin.from('tarjetas_regalo').select('id', { count: 'exact', head: true }).eq('studio_id', s.studioId);
    assert.equal(count, 1);
    assert.equal(await saldo(a.tarjeta_id), 50);
  } finally { await limpiarFixtures(admin, [s]); }
});

test('gastar: parcial, idempotente por clave, nunca negativo', async () => {
  const s = await crearStudioConPropietaria(admin);
  try {
    const t = await crear(s.studioId);
    const usar = (importe: number, clave: string) => admin.rpc('regalo_usar', {
      p_studio_id: s.studioId, p_tarjeta_id: t.tarjeta_id, p_importe: importe, p_idem_key: clave, p_actor_id: 'u', p_nota: null, p_recibo_id: null,
    }).then(r => { assert.ok(!r.error, r.error?.message); return (r.data as { ok: boolean; motivo: string | null; saldo: number }[])[0]; });

    assert.deepEqual(await usar(20, 'clave-0001'), { ok: true, motivo: null, saldo: 30 });
    assert.equal((await usar(20, 'clave-0001')).saldo, 30, 'el mismo intento no gasta dos veces');
    assert.equal((await usar(25, 'clave-0001')).motivo, 'clave-reutilizada');
    assert.equal((await usar(40, 'clave-0002')).motivo, 'saldo-insuficiente');
    assert.equal((await usar(30, 'clave-0003')).ok, true);
    assert.equal((await usar(1, 'clave-0004')).motivo, 'saldo-insuficiente');
    assert.equal(await saldo(t.tarjeta_id), 0);
    assert.equal((await admin.from('tarjetas_regalo_estado').select('estado_efectivo').eq('tarjeta_id', t.tarjeta_id).single()).data?.estado_efectivo, 'AGOTADA');

    // Dos gastos a la vez por el último euro: solo uno puede ganar.
    const t2 = await crear(s.studioId, { p_importe: 10 });
    const carrera = await Promise.all(['clave-aaaa1', 'clave-bbbb2', 'clave-cccc3'].map(k => admin.rpc('regalo_usar', {
      p_studio_id: s.studioId, p_tarjeta_id: t2.tarjeta_id, p_importe: 10, p_idem_key: k, p_actor_id: 'u', p_nota: null, p_recibo_id: null,
    })));
    const ganadores = carrera.filter(r => (r.data as { ok: boolean }[])[0].ok).length;
    assert.equal(ganadores, 1, 'el candado de fila deja gastar el saldo una sola vez');
    assert.equal(await saldo(t2.tarjeta_id), 0);

    const { data: desc } = await admin.from('regalo_conciliacion').select('*').eq('studio_id', s.studioId);
    assert.deepEqual(desc, []);
  } finally { await limpiarFixtures(admin, [s]); }
});

test('caducada (hoy de Madrid) y anulada no se gastan; anular retira el saldo con motivo', async () => {
  const s = await crearStudioConPropietaria(admin);
  try {
    const cad = await crear(s.studioId);
    await admin.from('tarjetas_regalo').update({ caduca_en: '2000-01-01' }).eq('id', cad.tarjeta_id);
    const r1 = await admin.rpc('regalo_usar', { p_studio_id: s.studioId, p_tarjeta_id: cad.tarjeta_id, p_importe: 5, p_idem_key: 'clave-cad-1', p_actor_id: 'u', p_nota: null, p_recibo_id: null });
    assert.equal((r1.data as { motivo: string }[])[0].motivo, 'caducada');
    const v = await admin.rpc('regalo_vincular', { p_studio_id: s.studioId, p_huella: huellaCodigo(cad.codigo), p_socio_id: 'x' });
    assert.equal((v.data as { motivo: string }[])[0].motivo, 'caducada');

    const t = await crear(s.studioId);
    await admin.rpc('regalo_usar', { p_studio_id: s.studioId, p_tarjeta_id: t.tarjeta_id, p_importe: 15, p_idem_key: 'clave-an-001', p_actor_id: 'u', p_nota: null, p_recibo_id: null });
    const sinMotivo = await admin.rpc('regalo_anular', { p_studio_id: s.studioId, p_tarjeta_id: t.tarjeta_id, p_motivo: ' ', p_actor_tipo: 'staff', p_actor_id: 'u' });
    assert.equal((sinMotivo.data as { motivo: string }[])[0].motivo, 'motivo-obligatorio');
    const an = await admin.rpc('regalo_anular', { p_studio_id: s.studioId, p_tarjeta_id: t.tarjeta_id, p_motivo: 'Error al cobrar', p_actor_tipo: 'staff', p_actor_id: 'u' });
    assert.equal(Number((an.data as { saldo_retirado: number }[])[0].saldo_retirado), 35, 'se retira solo lo que quedaba');
    assert.equal((await admin.rpc('regalo_anular', { p_studio_id: s.studioId, p_tarjeta_id: t.tarjeta_id, p_motivo: 'otra vez', p_actor_tipo: 'staff', p_actor_id: 'u' })).error, null, 'anular dos veces es idempotente');
    assert.equal(await saldo(t.tarjeta_id), 0);
    const r2 = await admin.rpc('regalo_usar', { p_studio_id: s.studioId, p_tarjeta_id: t.tarjeta_id, p_importe: 1, p_idem_key: 'clave-an-002', p_actor_id: 'u', p_nota: null, p_recibo_id: null });
    assert.equal((r2.data as { motivo: string }[])[0].motivo, 'anulada');
    assert.deepEqual((await admin.from('regalo_conciliacion').select('*').eq('studio_id', s.studioId)).data, []);
  } finally { await limpiarFixtures(admin, [s]); }
});

test('vincular: una alumna, una vez; otra no puede quedársela', async () => {
  const s = await crearStudioConPropietaria(admin);
  try {
    const t = await crear(s.studioId);
    const h = huellaCodigo(t.codigo);
    const a = await admin.rpc('regalo_vincular', { p_studio_id: s.studioId, p_huella: h, p_socio_id: 'socia-a' });
    assert.equal((a.data as { ok: boolean }[])[0].ok, true);
    assert.equal((await admin.rpc('regalo_vincular', { p_studio_id: s.studioId, p_huella: h, p_socio_id: 'socia-a' })).data![0].ok, true, 'idempotente para la misma alumna');
    assert.equal((await admin.rpc('regalo_vincular', { p_studio_id: s.studioId, p_huella: h, p_socio_id: 'socia-b' })).data![0].motivo, 'ya-vinculada');
    assert.equal((await admin.rpc('regalo_vincular', { p_studio_id: s.studioId, p_huella: huellaCodigo('RG-AAAA-AAAA-AAAA-AAAA'), p_socio_id: 'socia-a' })).data![0].motivo, 'no-existe');
    const otro = await crearStudioConPropietaria(admin);
    try {
      assert.equal((await admin.rpc('regalo_vincular', { p_studio_id: otro.studioId, p_huella: h, p_socio_id: 'socia-a' })).data![0].motivo, 'no-existe', 'un código no vale en otro estudio');
    } finally { await limpiarFixtures(admin, [otro]); }
  } finally { await limpiarFixtures(admin, [s]); }
});

test('el libro es solo de inserción', async () => {
  const s = await crearStudioConPropietaria(admin);
  try {
    const t = await crear(s.studioId);
    const r = await admin.from('movimientos_regalo').update({ nota: 'x' }).eq('tarjeta_id', t.tarjeta_id);
    assert.ok(r.error, 'el UPDATE del libro tiene que fallar');
  } finally { await limpiarFixtures(admin, [s]); }
});

test('el navegador no escribe, no ejecuta las RPC y no lee el código', async () => {
  const s = await crearStudioConPropietaria(admin);
  try {
    const t = await crear(s.studioId);
    for (const firma of [
      'regalo_crear(text,text,text,text,numeric,text,text,text,text,text,integer,text,text,text)',
      'regalo_vincular(text,text,text)', 'regalo_usar(text,uuid,numeric,text,text,text,text)',
      'regalo_anular(text,uuid,text,text,text)', 'regalo_generar_codigo()',
    ]) {
      const [p] = await sql<{ anon: boolean; auth: boolean; svc: boolean }[]>`
        select has_function_privilege('anon', ${firma}::regprocedure, 'EXECUTE') as anon,
               has_function_privilege('authenticated', ${firma}::regprocedure, 'EXECUTE') as auth,
               has_function_privilege('service_role', ${firma}::regprocedure, 'EXECUTE') as svc`;
      assert.deepEqual(p, { anon: false, auth: false, svc: true }, `grants de ${firma}`);
    }
    // La propietaria (authenticated) ve las tarjetas de su estudio pero NO la columna del código.
    const ok = await s.comoPropietaria.from('tarjetas_regalo').select('id, importe_inicial').eq('studio_id', s.studioId);
    assert.equal(ok.data?.length, 1, `la propietaria debería ver su tarjeta: ${ok.error?.message}`);
    for (const col of ['codigo', 'codigo_hash']) {
      const mal = await s.comoPropietaria.from('tarjetas_regalo').select(col).eq('id', t.tarjeta_id);
      assert.ok(mal.error, `authenticated no debe poder leer ${col}`);
    }
    const ins = await s.comoPropietaria.from('movimientos_regalo').insert({ studio_id: s.studioId, tarjeta_id: t.tarjeta_id, tipo: 'COMPRA', delta: 999 });
    assert.ok(ins.error, 'authenticated no escribe el libro');
    const upd = await s.comoPropietaria.from('tarjetas_regalo').update({ estado: 'ANULADA' }).eq('id', t.tarjeta_id);
    assert.ok(upd.error || upd.count === 0, 'authenticated no cambia tarjetas');
    assert.equal(await saldo(t.tarjeta_id), 50);
  } finally { await limpiarFixtures(admin, [s]); }
});
