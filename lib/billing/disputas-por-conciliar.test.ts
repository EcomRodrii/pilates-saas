import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ESTADOS_DISPUTA_CERRADA, ESTADOS_DISPUTA_SIN_RESCATE, VENTANA_RESCATE_DEVUELTO_DIAS,
  clasificarReciboConDisputa, referenciasChargebackPorComprobar, type ReciboConDisputa,
} from './disputas-por-conciliar.ts';
import { referenciaDevolucion } from './registrar-devolucion.ts';

// Una disputa perdida puede quedarse a medio aplicar: `procesarDisputeClosed`
// sella `disputa_estado = 'lost'` y DESPUÉS pasa el recibo a DEVUELTO y anota
// la devolución. Si el proceso muere entre medias, solo el barrido de disputas
// abiertas puede rescatarla — y no debe confundirla con un recibo que la
// propietaria cobró a mano después de un chargeback ya aplicado.

const AHORA = new Date('2026-09-15T10:00:00Z');
// `recibos.fecha_devolucion` es `date`: PostgREST la devuelve como `YYYY-MM-DD`.
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const recibo = (cambios: Partial<ReciboConDisputa> = {}): ReciboConDisputa => ({
  id: 'rec-1', disputa_stripe_id: 'du_1', disputa_estado: 'lost', estado: 'COBRADO', fecha_devolucion: null,
  ...cambios,
});
const REFERENCIA = referenciaDevolucion({ tipo: 'chargeback', disputeId: 'du_1' });
const SIN_ANOTAR = new Set<string>();
const ANOTADA = new Set([REFERENCIA]);

test('disputa abierta: se sigue consultando a Stripe como siempre, se sepa o no qué hay anotado', () => {
  for (const estado of ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review']) {
    assert.equal(clasificarReciboConDisputa(recibo({ disputa_estado: estado }), SIN_ANOTAR, AHORA), 'consultar', estado);
    assert.equal(clasificarReciboConDisputa(recibo({ disputa_estado: estado }), null, AHORA), 'consultar', estado);
  }
});

test('perdida a medio aplicar (murió entre sellar lost y pasar a DEVUELTO): se rescata', () => {
  // EN_CURSO/PENDIENTE también: una disputa SEPA puede llegar ya `lost` al crearse.
  for (const estado of ['COBRADO', 'EN_CURSO', 'PENDIENTE', 'FALLIDO']) {
    assert.equal(clasificarReciboConDisputa(recibo({ estado }), SIN_ANOTAR, AHORA), 'rescatar', estado);
  }
});

test('chargeback ya aplicado y luego cobrado a mano: NO se vuelve a pasar a DEVUELTO', () => {
  // `dbMarcarCobrado` admite DEVUELTO → COBRADO y no borra `fecha_devolucion`.
  // Guardián por mutación: si la clasificación se queda en «lost + estado ≠
  // DEVUELTO», este test falla.
  const cobradoAMano = recibo({ estado: 'COBRADO', fecha_devolucion: haceDias(20) });
  assert.equal(clasificarReciboConDisputa(cobradoAMano, ANOTADA, AHORA), 'ignorar');
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'COBRADO' }), ANOTADA, AHORA), 'ignorar',
    'con la devolución anotada, el cierre ya se aplicó entero: no hay nada que rescatar');
});

test('perdida sin anotar sobre un recibo que ya pasó por DEVUELTO y alguien cambió: solo se avisa, y no para siempre', () => {
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'COBRADO', fecha_devolucion: haceDias(2) }), SIN_ANOTAR, AHORA), 'dudosa');
  // Sin la ventana, el mismo aviso saldría a Sentry cada 2 h indefinidamente.
  assert.equal(
    clasificarReciboConDisputa(recibo({ estado: 'COBRADO', fecha_devolucion: haceDias(VENTANA_RESCATE_DEVUELTO_DIAS + 1) }), SIN_ANOTAR, AHORA),
    'ignorar',
  );
});

test('la ventana cuenta días naturales sobre la fecha, no milisegundos desde la hora del cron', () => {
  const tarde = new Date('2026-09-15T23:30:00Z');
  const hace7 = recibo({ estado: 'DEVUELTO', fecha_devolucion: '2026-09-08' });
  assert.equal(clasificarReciboConDisputa(hace7, SIN_ANOTAR, tarde), 'rescatar', 'a última hora del día sigue dentro');
  // También si alguna vez llega con hora (timestamp en vez de date).
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: '2026-09-08T00:00:00+00:00' }), SIN_ANOTAR, tarde), 'rescatar');
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: '2026-09-07' }), SIN_ANOTAR, tarde), 'ignorar');
});

test('ya DEVUELTO pero sin anotar (murió antes de registrar la devolución): se rescata dentro de la ventana', () => {
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: haceDias(1) }), SIN_ANOTAR, AHORA), 'rescatar');
  assert.equal(
    clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: haceDias(VENTANA_RESCATE_DEVUELTO_DIAS) }), SIN_ANOTAR, AHORA),
    'rescatar', 'el borde de la ventana cuenta',
  );
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: haceDias(1) }), ANOTADA, AHORA), 'ignorar');
});

test('ya DEVUELTO fuera de la ventana: no se fabrican tarjetas ni avisos de disputas antiguas', () => {
  assert.equal(
    clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: haceDias(VENTANA_RESCATE_DEVUELTO_DIAS + 1) }), SIN_ANOTAR, AHORA),
    'ignorar',
  );
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: null }), SIN_ANOTAR, AHORA), 'ignorar');
});

test('si no se pudo leer qué hay anotado, ninguna perdida se toca (fail-closed)', () => {
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'COBRADO' }), null, AHORA), 'ignorar');
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'DEVUELTO', fecha_devolucion: haceDias(1) }), null, AHORA), 'ignorar');
  assert.equal(clasificarReciboConDisputa(recibo({ estado: 'COBRADO', fecha_devolucion: haceDias(1) }), null, AHORA), 'ignorar');
});

test('cerradas sin dinero en juego (ganada, consulta cerrada, prevenida): nada que hacer', () => {
  for (const estado of ['won', 'warning_closed', 'prevented']) {
    assert.equal(clasificarReciboConDisputa(recibo({ disputa_estado: estado }), SIN_ANOTAR, AHORA), 'ignorar', estado);
  }
});

test('`prevented` es un estado cerrado: si no, se preguntaría a Stripe cada 2 h para siempre', () => {
  assert.ok(ESTADOS_DISPUTA_CERRADA.includes('prevented'));
  assert.ok(ESTADOS_DISPUTA_SIN_RESCATE.includes('prevented'));
  assert.ok(ESTADOS_DISPUTA_SIN_RESCATE.includes('won'));
  assert.ok(ESTADOS_DISPUTA_SIN_RESCATE.includes('warning_closed'));
  assert.equal(ESTADOS_DISPUTA_SIN_RESCATE.includes('lost'), false, 'la consulta tiene que seguir trayendo las perdidas');
});

test('solo se consulta `devoluciones` por las perdidas que quedan por decidir, con la referencia real del chargeback', () => {
  const regimenNormal = [
    recibo({ id: 'r-abierta', disputa_estado: 'needs_response', disputa_stripe_id: 'du_a' }),
    recibo({ id: 'r-vieja', estado: 'DEVUELTO', fecha_devolucion: haceDias(40), disputa_stripe_id: 'du_v' }),
    // Cobrado a mano tras un chargeback ya aplicado: pasada la ventana deja de
    // consultarse, o la lista (y la URL de la consulta) crecería sin fin.
    recibo({ id: 'r-cobrada-a-mano', estado: 'COBRADO', fecha_devolucion: haceDias(40), disputa_stripe_id: 'du_c' }),
  ];
  assert.deepEqual(referenciasChargebackPorComprobar(regimenNormal, AHORA), [], 'sin nada pendiente, ni una consulta extra');

  const conPendientes = [
    ...regimenNormal,
    recibo({ id: 'r-medio', estado: 'COBRADO', disputa_stripe_id: 'du_m' }),
    recibo({ id: 'r-reciente', estado: 'DEVUELTO', fecha_devolucion: haceDias(1), disputa_stripe_id: 'du_r' }),
  ];
  assert.deepEqual(referenciasChargebackPorComprobar(conPendientes, AHORA), [
    referenciaDevolucion({ tipo: 'chargeback', disputeId: 'du_m' }),
    referenciaDevolucion({ tipo: 'chargeback', disputeId: 'du_r' }),
  ]);
});

// ── El cron usa esta clasificación, en este orden ────────────────────────────

const fuente = readFileSync(join(import.meta.dirname, '../inngest/conciliar-reembolsos.ts'), 'utf8');
const cuerpo = fuente.slice(fuente.indexOf('async function conciliarDisputasAbiertasEstudio'));

test('el barrido de disputas abiertas trae también las perdidas y las clasifica antes de llamar a Stripe', () => {
  assert.ok(cuerpo.includes('ESTADOS_DISPUTA_SIN_RESCATE.join'), 'la consulta excluye solo las cerradas sin rescate');
  assert.ok(cuerpo.includes("select('id, disputa_stripe_id, disputa_estado, estado, fecha_devolucion')"));
  const iAnotadas = cuerpo.indexOf(".from('devoluciones')");
  const iClasifica = cuerpo.indexOf('clasificarReciboConDisputa(');
  const iStripe = cuerpo.indexOf('stripe.disputes.retrieve');
  assert.ok(iAnotadas > 0 && iClasifica > iAnotadas && iStripe > iClasifica,
    'anotaciones → clasificación → Stripe: las perdidas ya aplicadas no gastan llamadas a Stripe');
  assert.ok(cuerpo.includes("dispute.status !== 'lost'"), 'un rescate exige que Stripe siga dando la disputa por perdida');
  assert.ok(cuerpo.includes('procesarDisputeClosed('), 'el rescate reutiliza la función compartida, no la reimplementa');
});

test('el barrido de 24 h usa la misma lista de estados cerrados (con `prevented`)', () => {
  assert.ok(fuente.includes('const cerrada = ESTADOS_DISPUTA_CERRADA.includes(dispute.status)'));
  assert.equal(fuente.includes("dispute.status === 'warning_closed'"), false, 'nada de listas a mano que se desincronicen');
});
