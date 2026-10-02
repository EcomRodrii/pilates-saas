// La hora del cobro, el envío al banco y el día de cargo pedido (migración
// recibos_marcas_de_tiempo, rediseño de Cobros del 2-oct-2026).
//
// Las escribe UN trigger y nadie más: el navegador no tiene permiso sobre esas
// columnas, y la pantalla las enseña como ciertas («Fichero preparado el 29 sep ·
// cargo pedido para el 4 oct», la hora de cada cobro). Este fichero lo comprueba
// contra una base de datos real, por los dos caminos: el servidor (cliente admin) y
// el navegador (la sesión de la propietaria).
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';
import { hoyEnEstudio, masDias } from '../../lib/utils.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idRecibo = () => `rec-marcas-${process.pid}-${Date.now()}-${contador++}`;
// El día del ESTUDIO: el trigger compara con la fecha de Madrid, no con la de UTC.
const hoy = () => hoyEnEstudio();

type Fila = Record<string, unknown>;
const base = (studioId: string, id: string, extra: Fila = {}) =>
  ({ id, studio_id: studioId, concepto: 'Marcas de tiempo', importe: 10, estado: 'PENDIENTE', fecha_vencimiento: hoy(), ...extra });

async function marcas(id: string) {
  const { data, error } = await admin.from('recibos').select('cobrado_en, enviado_al_banco_en, cargo_pedido_para').eq('id', id).single();
  assert.ok(!error, `no se pudo leer el recibo: ${error?.message}`);
  return data as { cobrado_en: string | null; enviado_al_banco_en: string | null; cargo_pedido_para: string | null };
}

test('la remesa del navegador: al enviarlo al banco, la hora y el día de cargo (hoy + 5), y los devuelve el propio UPDATE; al deshacer, se vacían', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    await admin.from('recibos').insert(base(studio.studioId, id));
    const { data, error } = await studio.comoPropietaria.from('recibos').update({ estado: 'EN_CURSO' })
      .eq('id', id).eq('estado', 'PENDIENTE').select('id, cargo_pedido_para');
    assert.ok(!error, `la remesa no pudo marcar: ${error?.message}`);
    assert.deepEqual(data, [{ id, cargo_pedido_para: masDias(hoy(), 5) }], 'el día de cargo vuelve en el propio UPDATE (lo lleva el fichero)');
    const enviado = await marcas(id);
    assert.ok(enviado.enviado_al_banco_en, 'sin la hora del envío');

    const { error: errVuelta } = await studio.comoPropietaria.from('recibos').update({ estado: 'PENDIENTE' }).eq('id', id);
    assert.ok(!errVuelta, `no pudo deshacer la remesa: ${errVuelta?.message}`);
    assert.deepEqual(await marcas(id), { cobrado_en: null, enviado_al_banco_en: null, cargo_pedido_para: null }, 'no llegó a ir al banco');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el navegador no escribe ninguna de las tres columnas, ni al crear ni al cambiar', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    await admin.from('recibos').insert(base(studio.studioId, id));
    for (const [col, valor] of [['cobrado_en', new Date().toISOString()], ['enviado_al_banco_en', new Date().toISOString()], ['cargo_pedido_para', hoy()]] as const) {
      const { error } = await studio.comoPropietaria.from('recibos').update({ [col]: valor }).eq('id', id);
      assert.ok(error, `el navegador escribió recibos.${col}`);
      assert.match(error.message, /permission denied/, `al escribir ${col}, bloqueó otra cosa: ${error.message}`);
      const { error: errAlta } = await studio.comoPropietaria.from('recibos').insert(base(studio.studioId, idRecibo(), { [col]: valor }));
      assert.ok(errAlta, `el navegador creó un recibo con ${col}`);
      assert.match(errAlta.message, /permission denied/, `al crear con ${col}, bloqueó otra cosa: ${errAlta.message}`);
    }
    assert.deepEqual(await marcas(id), { cobrado_en: null, enviado_al_banco_en: null, cargo_pedido_para: null });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('servidor: la hora del cobro solo cuando el registro es del momento del pago', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const cobrar = async (extra: Fila) => {
      const id = idRecibo();
      await admin.from('recibos').insert(base(studio.studioId, id));
      const { error } = await admin.from('recibos').update({ estado: 'COBRADO', fecha_cobro: hoy(), ...extra }).eq('id', id);
      assert.ok(!error, `el servidor no pudo cobrar: ${error?.message}`);
      return (await marcas(id)).cobrado_en;
    };
    assert.ok(await cobrar({ metodo_cobro: 'EFECTIVO', conciliado_por: 'manual', conciliado_en: new Date().toISOString() }), 'mostrador de hoy: con hora');
    assert.ok(await cobrar({ metodo_cobro: 'TARJETA', conciliado_por: 'webhook', conciliado_en: new Date().toISOString() }), 'webhook de hoy: con hora');
    assert.equal(await cobrar({ metodo_cobro: 'SEPA', conciliado_por: 'manual', conciliado_en: new Date().toISOString() }), null, 'domiciliación: sin hora');
    assert.equal(await cobrar({ metodo_cobro: 'TRANSFERENCIA', conciliado_por: 'manual', conciliado_en: new Date().toISOString() }), null, 'transferencia: sin hora');
    assert.equal(await cobrar({ metodo_cobro: 'TARJETA', conciliado_por: 'conciliador', conciliado_en: new Date().toISOString() }), null, 'conciliador (llega tarde): sin hora');
    assert.equal(await cobrar({ metodo_cobro: 'EFECTIVO', fecha_cobro: masDias(hoy(), -2) }), null, 'cobro de otro día: sin hora');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('servidor: un recibo que nace cobrado (TPV, plan comprado) lleva la hora; con fecha antigua no; si trae la suya, se conserva', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const nace = async (extra: Fila) => {
      const id = idRecibo();
      const { error } = await admin.from('recibos').insert(base(studio.studioId, id, { estado: 'COBRADO', fecha_cobro: hoy(), metodo_cobro: 'EFECTIVO', ...extra }));
      assert.ok(!error, `el servidor no pudo crear un recibo cobrado: ${error?.message}`);
      return (await marcas(id)).cobrado_en;
    };
    assert.ok(await nace({}), 'nace cobrado hoy: con hora');
    assert.equal(await nace({ fecha_cobro: masDias(hoy(), -10) }), null, 'con fecha antigua: sin hora');
    const traida = '2020-01-01T10:00:00+00:00';
    assert.equal(new Date((await nace({ cobrado_en: traida }))!).toISOString(), new Date(traida).toISOString(), 'una restauración conserva la suya');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el mismo cobro que vuelve (devuelto → cobrado sin cambiar día, conciliación ni cargo) conserva su hora', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    const conciliado = new Date().toISOString();
    await admin.from('recibos').insert(base(studio.studioId, id));
    await admin.from('recibos').update({ estado: 'COBRADO', fecha_cobro: hoy(), metodo_cobro: 'TARJETA', conciliado_por: 'webhook', conciliado_en: conciliado, stripe_payment_intent_id: 'pi_marcas' }).eq('id', id);
    const hora = (await marcas(id)).cobrado_en;
    assert.ok(hora);
    await admin.from('recibos').update({ estado: 'DEVUELTO' }).eq('id', id);
    await admin.from('recibos').update({ estado: 'COBRADO' }).eq('id', id);
    assert.equal((await marcas(id)).cobrado_en, hora);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un adeudo de Stripe: se anota el envío, pero el día de cargo lo decide Stripe (sin día)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    await admin.from('recibos').insert(base(studio.studioId, id));
    const { error } = await admin.from('recibos').update({ estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_adeudo' }).eq('id', id);
    assert.ok(!error, error?.message);
    const m = await marcas(id);
    assert.ok(m.enviado_al_banco_en);
    assert.equal(m.cargo_pedido_para, null);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('a COBRADO desde el navegador: lo para la guardia de servidor, no esto', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    await admin.from('recibos').insert(base(studio.studioId, id));
    const { error } = await studio.comoPropietaria.from('recibos').update({ estado: 'COBRADO' }).eq('id', id);
    assert.ok(error);
    assert.match(error.message, /recibos_cobrado_solo_servidor/);
    assert.equal((await marcas(id)).cobrado_en, null);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
