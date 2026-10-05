// La reserva que se hace DESPUÉS de cobrar una clase (`reservarPlazaTrasPagoPublico`,
// lib/db/supabase-data-admin.ts) contra la base de datos real: qué quiere decir
// YA_RESERVADA y qué rastro queda.
//
// El fallo que fija (5-oct-2026): YA_RESERVADA salía siempre como «CONFIRMADA»
// (`?? 'CONFIRMADA'`), también cuando la socia ya tenía OTRA reserva en la clase y
// este pago no reservaba nada. Aquí se comprueba, con `reservar_plaza` de verdad,
// que en ese caso no existe la reserva del pago (`res-web-<pi>`) —así que la regla
// pura `estadoDeReservaDelPago` dice «ya tenía»— y que en el reintento del mismo
// pago sí existe —y dice su estado—. Y que el aviso al mostrador por pago no se
// traga el de otro pago de la misma clase.
//
// `reservarPlazaTrasPagoPublico` no se puede cargar aquí (alias `@/` y su
// cliente de servidor): se ejercita la RPC con los mismos parámetros que manda.
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué esto vive aquí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';
import { estadoDeReservaDelPago } from '../../lib/billing/reserva-tras-pago-reglas.ts';
import { dedupKeyPagadaSinPlaza } from '../../lib/notifications/pagada-sin-plaza.ts';

const admin = clienteAdminLocal();
let n = 0;
const unico = (prefijo: string) => `${prefijo}-${process.pid}-${Date.now()}-${n++}`;

async function sesionFutura(studioId: string): Promise<string> {
  const id = unico('sesion-pago');
  const inicio = new Date(Date.now() + 3 * 86_400_000);
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, aforo_maximo: 5,
    inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(),
  });
  assert.equal(error, null, error?.message);
  return id;
}

// Los mismos parámetros que `reservarPlazaTrasPagoPublico`: el pago ya es la prueba.
function reservarTrasPago(studioId: string, sesionId: string, socioId: string, reservaId: string) {
  return admin.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: true, p_requiere_aprobacion: false, p_spot_id: null,
    p_saltar_gate_impago: true, p_exigir_entitlement: false, p_suscripcion_id: null,
  });
}

async function leerReserva(id: string) {
  const { data, error } = await admin.from('reservas').select('estado, socio_id, sesion_id').eq('id', id).maybeSingle();
  assert.equal(error, null, error?.message);
  return data as { estado: string | null; socio_id: string | null; sesion_id: string | null } | null;
}

test('con OTRA reserva suya en la clase, el pago da YA_RESERVADA y no deja reserva propia: «ya tenía»', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socioId = await crearSocia(admin, studio.studioId);
    const sesionId = await sesionFutura(studio.studioId);
    // La reserva que ya tenía (con su bono, desde la app).
    const previa = await reservarTrasPago(studio.studioId, sesionId, socioId, unico('res-app'));
    assert.equal(previa.error, null, previa.error?.message);

    const reservaDelPago = unico('res-web-pago');
    const r = await reservarTrasPago(studio.studioId, sesionId, socioId, reservaDelPago);
    assert.ok(r.error, 'reservar_plaza tenía que rechazar la segunda reserva de la misma socia');
    assert.match(r.error.message, /YA_RESERVADA/);

    const fila = await leerReserva(reservaDelPago);
    assert.equal(fila, null, 'el pago no ha creado ninguna reserva');
    assert.equal(estadoDeReservaDelPago(fila, { socioId, sesionId }), null, 'esto NO es una plaza confirmada: es un pago sin usar');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el reintento del MISMO pago da YA_RESERVADA y su reserva sí existe: es la de antes, con su estado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socioId = await crearSocia(admin, studio.studioId);
    const sesionId = await sesionFutura(studio.studioId);
    const reservaDelPago = unico('res-web-pago');

    const primera = await reservarTrasPago(studio.studioId, sesionId, socioId, reservaDelPago);
    assert.equal(primera.error, null, primera.error?.message);
    const repetida = await reservarTrasPago(studio.studioId, sesionId, socioId, reservaDelPago);
    assert.ok(repetida.error);
    assert.match(repetida.error.message, /YA_RESERVADA/);

    const fila = await leerReserva(reservaDelPago);
    assert.equal(estadoDeReservaDelPago(fila, { socioId, sesionId }), 'CONFIRMADA');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el aviso de un pago sin usar no se traga el de OTRO pago de la misma clase y socia', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const p = { sesionId: unico('ses'), socioId: unico('soc') };
    const aviso = (dedup: string) => admin.from('notification').insert({
      id: unico('not'), studio_id: studio.studioId, recipient_role: 'PROPIETARIO', recipient_user_id: studio.authUserId,
      event_type: 'reserva.pagada_sin_plaza', category: 'reservas', title: 'test', body: 'test',
      // El motor añade la identidad del destinatario a la clave (`claveDedup`).
      dedup_key: `${dedup}:${studio.authUserId}`,
    });
    const deA = await aviso(dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...p, paymentIntentId: 'pi_A' }));
    const deB = await aviso(dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...p, paymentIntentId: 'pi_B' }));
    assert.equal(deA.error, null, deA.error?.message);
    assert.equal(deB.error, null, `el segundo pago a devolver se perdía: ${deB.error?.message}`);

    const repetido = await aviso(dedupKeyPagadaSinPlaza('ya-tenia-reserva', { ...p, paymentIntentId: 'pi_A' }));
    assert.ok(repetido.error, 'el mismo pago avisado dos veces tiene que chocar con el dedup');
    assert.equal(repetido.error.code, '23505');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
