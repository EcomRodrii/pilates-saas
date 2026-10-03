// La marca de «cobro con tarjeta o domiciliación guardada en marcha» (migración
// recibos_cobro_off_session_en_marcha, lib/billing/cobro-off-session-marca.ts), contra una
// base de datos real: la escribe solo el servidor, se va sola cuando el recibo deja de poder
// cobrarse, y con ella puesta el navegador no cambia el estado del recibo (una pestaña con el
// panel anterior no la conoce y podría mandarlo a la remesa encima del cargo).
//
// Y ni se borra ni se anula con el cargo en vuelo (migración
// recibos_cobro_en_marcha_ni_se_borra_ni_se_anula): `eliminar_recibo` y el ANULAR de la política
// de cancelar una cuota son SECURITY DEFINER y quitaban el recibo de en medio sin mirarla.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en
// `supabase/tests/` y no en `lib/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, crearSuscripcion, limpiarFixtures,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idRecibo = () => `rec-marca-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);
const MARCA = { cobro_off_session_clave: 'offsession-cobro-x-i0', cobro_off_session_desde: new Date().toISOString() };

async function reciboMarcado(studioId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = idRecibo();
  const { error } = await admin.from('recibos').insert({
    id, studio_id: studioId, concepto: 'marca test', importe: 10, estado: 'PENDIENTE', fecha_vencimiento: hoy(), ...MARCA, ...extra,
  });
  assert.equal(error, null, error?.message);
  return id;
}

async function leer(id: string) {
  const { data } = await admin.from('recibos')
    .select('estado, tras_cancelar_cuota, cobro_off_session_clave, cobro_off_session_desde').eq('id', id).maybeSingle();
  return data as {
    estado: string; tras_cancelar_cuota: string | null; cobro_off_session_clave: string | null; cobro_off_session_desde: string | null;
  } | null;
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

test('eliminar_recibo no borra un recibo con un cobro en marcha (PENDIENTE, ni FALLIDO reintentándose)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const pendiente = await reciboMarcado(studio.studioId);
    // Un FALLIDO con un PaymentIntent viejo se podía borrar («ya no puede completarse»); con la marca
    // puesta es un reintento en vuelo y el dinero puede entrar en cualquier momento.
    const fallido = await reciboMarcado(studio.studioId, { estado: 'FALLIDO', stripe_payment_intent_id: 'pi_intento_anterior' });
    for (const id of [pendiente, fallido]) {
      const { error } = await studio.comoPropietaria.rpc('eliminar_recibo', { p_studio_id: studio.studioId, p_recibo_id: id, p_motivo: 'DUPLICADO' });
      assert.ok(error, 'se borró un recibo con un cobro de tarjeta guardada en marcha');
      assert.match(error.message, /\bPAGO_ASOCIADO\b/, `bloqueó otra cosa: ${error.message}`);
      assert.ok(await leer(id), 'el recibo desapareció a pesar del error');
    }
    // Control positivo: sin la marca, el mismo FALLIDO sí se borra (si no, el «no» de arriba no prueba nada).
    const sinMarca = await reciboMarcado(studio.studioId, {
      estado: 'FALLIDO', stripe_payment_intent_id: 'pi_intento_anterior', cobro_off_session_clave: null, cobro_off_session_desde: null,
    });
    const { error } = await studio.comoPropietaria.rpc('eliminar_recibo', { p_studio_id: studio.studioId, p_recibo_id: sinMarca, p_motivo: 'DUPLICADO' });
    assert.equal(error, null, error?.message);
    assert.equal(await leer(sinMarca), null);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('cancelar una cuota con ANULAR no anula el recibo con un cobro en marcha, ni desde el panel ni desde el servidor', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await admin.from('studios').update({ recibos_al_cancelar_cuota: 'ANULAR' }).eq('id', studio.studioId);
    const socioId = await crearSocia(admin, studio.studioId);
    // Desde el panel (la propietaria) y desde el servidor (service-role): antes, el panel fallaba
    // entero (el trigger del navegador no deja cambiar de estado un recibo con la marca) y el
    // servidor lo anulaba y soltaba la marca con el cargo en vuelo.
    const quienes: Array<[string, typeof admin]> = [['panel', studio.comoPropietaria], ['servidor', admin]];
    for (const [quien, cliente] of quienes) {
      const susId = await crearSuscripcion(admin, studio.studioId, socioId);
      const enMarcha = await reciboMarcado(studio.studioId, { socio_id: socioId, suscripcion_id: susId });
      const libre = await reciboMarcado(studio.studioId, {
        socio_id: socioId, suscripcion_id: susId, cobro_off_session_clave: null, cobro_off_session_desde: null,
      });

      const { error } = await cliente.from('suscripciones').update({ estado: 'CANCELADA' }).eq('id', susId);
      assert.equal(error, null, `${quien}: no pudo cancelar la cuota: ${error?.message}`);

      const marcado = await leer(enMarcha);
      assert.equal(marcado?.estado, 'PENDIENTE', `${quien}: anuló un recibo con un cobro de tarjeta guardada en marcha`);
      assert.equal(marcado?.cobro_off_session_clave, MARCA.cobro_off_session_clave, `${quien}: la marca se soltó`);
      assert.equal(marcado?.tras_cancelar_cuota, 'SIN_REINTENTOS', `${quien}: el que no se anula queda marcado sin reintentos`);
      // Control positivo: el pendiente sin marca de la misma cuota sí se anula.
      assert.equal((await leer(libre))?.estado, 'ANULADO', `${quien}: la política ANULAR dejó de anular`);
    }
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
