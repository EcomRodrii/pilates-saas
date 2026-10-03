// La marca de «cobro con tarjeta o domiciliación guardada en marcha» (migración
// recibos_cobro_off_session_en_marcha, lib/billing/cobro-off-session-marca.ts), contra una
// base de datos real: la escribe solo el servidor, se va sola cuando el recibo deja de poder
// cobrarse, y con ella puesta el navegador no cambia el estado del recibo (una pestaña con el
// panel anterior no la conoce y podría mandarlo a la remesa encima del cargo).
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en
// `supabase/tests/` y no en `lib/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idRecibo = () => `rec-marca-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);
const MARCA = { cobro_off_session_clave: 'offsession-cobro-x-i0', cobro_off_session_desde: new Date().toISOString() };

async function reciboMarcado(studioId: string): Promise<string> {
  const id = idRecibo();
  const { error } = await admin.from('recibos').insert({
    id, studio_id: studioId, concepto: 'marca test', importe: 10, estado: 'PENDIENTE', fecha_vencimiento: hoy(), ...MARCA,
  });
  assert.equal(error, null, error?.message);
  return id;
}

async function leer(id: string) {
  const { data } = await admin.from('recibos').select('estado, cobro_off_session_clave, cobro_off_session_desde').eq('id', id).maybeSingle();
  return data as { estado: string; cobro_off_session_clave: string | null; cobro_off_session_desde: string | null } | null;
}

test('con la marca puesta, el navegador no cambia el estado del recibo (ni a la remesa)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = await reciboMarcado(studio.studioId);
    const { error } = await studio.comoPropietaria.from('recibos').update({ estado: 'EN_CURSO' }).eq('id', id);
    assert.ok(error, 'una pestaña vieja mandó a la remesa un recibo que se está cobrando con la tarjeta');
    assert.match(error.message, /recibos_cobrado_solo_servidor.*se está cobrando con su tarjeta/, `bloqueó otra cosa, no el trigger: ${error.message}`);
    const fila = await leer(id);
    assert.equal(fila?.estado, 'PENDIENTE');
    assert.equal(fila?.cobro_off_session_clave, MARCA.cobro_off_session_clave);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el navegador no puede poner ni quitar la marca', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = await reciboMarcado(studio.studioId);
    const { error } = await studio.comoPropietaria.from('recibos')
      .update({ cobro_off_session_clave: null, cobro_off_session_desde: null }).eq('id', id);
    assert.ok(error, 'el navegador soltó la marca');
    assert.match(error.message, /permission denied/);
    assert.equal((await leer(id))?.cobro_off_session_clave, MARCA.cobro_off_session_clave);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('al salir de PENDIENTE/FALLIDO la marca se va sola, la quite o no quien cambia el estado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const cambios: Record<string, Record<string, unknown>> = {
      COBRADO: { estado: 'COBRADO', fecha_cobro: hoy(), metodo_cobro: 'EFECTIVO' },
      ANULADO: { estado: 'ANULADO', anulado_en: new Date().toISOString() },
      EN_CURSO: { estado: 'EN_CURSO' },
    };
    for (const [estado, cambio] of Object.entries(cambios)) {
      const id = await reciboMarcado(studio.studioId);
      const { error } = await admin.from('recibos').update(cambio).eq('id', id);
      assert.equal(error, null, error?.message);
      const fila = await leer(id);
      assert.equal(fila?.cobro_off_session_clave, null, estado);
      assert.equal(fila?.cobro_off_session_desde, null, estado);
    }
    // Entre PENDIENTE y FALLIDO se queda: el recibo se sigue pudiendo cobrar.
    const id = await reciboMarcado(studio.studioId);
    await admin.from('recibos').update({ estado: 'FALLIDO' }).eq('id', id);
    assert.equal((await leer(id))?.cobro_off_session_clave, MARCA.cobro_off_session_clave);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('clave y momento van juntos (CHECK)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = await reciboMarcado(studio.studioId);
    const { error } = await admin.from('recibos').update({ cobro_off_session_desde: null }).eq('id', id);
    assert.ok(error, 'quedó una clave sin momento');
    assert.match(error.message, /recibos_cobro_off_session_coherente/);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
