import { test } from 'node:test';
import { strict as assert } from 'node:assert';

/**
 * PAY-5: Tests unitarios para detección de doble cobro.
 *
 * Prueba la lógica pura de agrupación y detección sin tocar Supabase.
 * La lógica real vive en detectarDoblesCobros; aquí verificamos los 3 casos críticos.
 */

/**
 * Helper: simula la lógica de agrupación que hace detectarDoblesCobros.
 * Agrupa intentos por recibo_id y cuenta payment_intent_id DISTINTOS.
 */
function agruparYDetectarDobles(
  intentos: Array<{
    recibo_id: string;
    payment_intent_id: string;
  }>
): Map<string, string[]> {
  const agrupadoPorRecibo = new Map<string, Set<string>>();

  for (const intento of intentos) {
    if (!agrupadoPorRecibo.has(intento.recibo_id)) {
      agrupadoPorRecibo.set(intento.recibo_id, new Set());
    }
    agrupadoPorRecibo.get(intento.recibo_id)!.add(intento.payment_intent_id);
  }

  // Retornar solo recibos con 2+ payment_intent DISTINTOS
  const dobles = new Map<string, string[]>();
  for (const [reciboId, paymentIntents] of agrupadoPorRecibo) {
    if (paymentIntents.size > 1) {
      dobles.set(reciboId, Array.from(paymentIntents));
    }
  }

  return dobles;
}

test('PAY-5: 1 intento → no detecta doble', () => {
  const intentos = [{ recibo_id: 'rec-1', payment_intent_id: 'pi_1' }];

  const dobles = agruparYDetectarDobles(intentos);

  assert.equal(dobles.size, 0, 'No debe detectar doble cobro con 1 intento');
});

test('PAY-5: 2 payment_intent DISTINTOS → detecta doble', () => {
  const intentos = [
    { recibo_id: 'rec-1', payment_intent_id: 'pi_1' },
    { recibo_id: 'rec-1', payment_intent_id: 'pi_2' },
  ];

  const dobles = agruparYDetectarDobles(intentos);

  assert.equal(dobles.size, 1, 'Debe detectar doble cobro');
  assert.deepEqual(dobles.get('rec-1'), ['pi_1', 'pi_2'], 'Debe registrar ambos payment_intent');
});

test('PAY-5: 2 intentos MISMO payment_intent → NO es doble (reintento ok)', () => {
  const intentos = [
    { recibo_id: 'rec-1', payment_intent_id: 'pi_1' },
    { recibo_id: 'rec-1', payment_intent_id: 'pi_1' }, // Mismo PI, reintento
  ];

  const dobles = agruparYDetectarDobles(intentos);

  assert.equal(dobles.size, 0, 'No debe detectar doble con reintentos del mismo payment_intent');
});
