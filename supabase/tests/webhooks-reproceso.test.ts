// H1 · un webhook Connect envejecido se puede reclamar una sola vez, reintentar
// con contador acotado y dejar de nuevo reclamable tras fallar.
// La recuperación contra Stripe y el mismo procesador se cubren en
// lib/stripe/webhook-reproceso.test.ts (Stripe no está disponible en Postgres).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = () => `connect:evt_reproceso_${process.pid}_${Date.now()}_${contador++}`;

test('H1: un evento Connect antiguo solo se reclama una vez y el intento queda contabilizado', async () => {
  const id = idUnico();
  const recibido = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const reclamado = new Date(Date.now() - 20 * 60_000).toISOString();
  try {
    const { error: insertar } = await admin.from('webhook_events').insert({
      id, tipo: 'checkout.session.completed', estado: 'procesando', recibido_en: recibido, reclamado_en: reclamado,
    });
    assert.ok(!insertar, `fixture de webhook: ${insertar?.message}`);

    const primera = await admin.rpc('reclamar_webhook_event', {
      p_event_id: id, p_tipo: 'checkout.session.completed', p_expira_segundos: 900,
    });
    assert.ok(!primera.error, primera.error?.message);
    assert.equal(primera.data, true, 'un evento en vuelo desde hace más de 15 min se reclama');

    const reclamosConcurrentes = await Promise.all([
      admin.rpc('reclamar_webhook_event', { p_event_id: id, p_tipo: 'checkout.session.completed', p_expira_segundos: 900 }),
      admin.rpc('reclamar_webhook_event', { p_event_id: id, p_tipo: 'checkout.session.completed', p_expira_segundos: 900 }),
    ]);
    assert.ok(reclamosConcurrentes.every(r => !r.error));
    assert.deepEqual(reclamosConcurrentes.map(r => r.data).sort(), [false, false], 'nadie duplica el reproceso mientras la primera ejecución sigue viva');

    const intento = await admin.rpc('incrementar_reprocesos_webhook', { p_event_id: id });
    assert.ok(!intento.error, intento.error?.message);
    assert.equal(intento.data, 1);

    await admin.rpc('fallar_webhook_event', { p_event_id: id });
    const { data: fallido, error: leer } = await admin.from('webhook_events')
      .select('estado, reprocesos, reclamado_en').eq('id', id).single();
    assert.ok(!leer, leer?.message);
    assert.equal(fallido.estado, 'fallido');
    assert.equal(fallido.reprocesos, 1);
    assert.ok(Date.parse(fallido.reclamado_en) > Date.now() - 60_000, 'fallido espera la ventana de 15 min antes del siguiente pase');

    const siguiente = await admin.rpc('reclamar_webhook_event', {
      p_event_id: id, p_tipo: 'checkout.session.completed', p_expira_segundos: 900,
    });
    assert.ok(!siguiente.error, siguiente.error?.message);
    assert.equal(siguiente.data, true, 'el siguiente intento puede volver a reclamar el fallo');
    await admin.rpc('completar_webhook_event', { p_event_id: id });
    const repetido = await admin.rpc('reclamar_webhook_event', {
      p_event_id: id, p_tipo: 'checkout.session.completed', p_expira_segundos: 900,
    });
    assert.ok(!repetido.error, repetido.error?.message);
    assert.equal(repetido.data, false, 'un evento completado nunca se vuelve a reclamar');
  } finally {
    await admin.from('webhook_events').delete().eq('id', id);
  }
});
