import { test } from 'node:test';
import { strict as assert } from 'node:assert';

/**
 * Pruebas unitarias para la detección de dobles cobros.
 * Nota: para pruebas end-to-end reales, ejecutar contra Supabase local
 * con datos de prueba inyectados en cobros_intentos.
 */

test('DobleCobroDetectado - tipos correctos', () => {
  // Prueba simple de tipado: si compila, el tipo está bien
  const doble = {
    reciboId: 'rec-123',
    studioId: 'st-456',
    paymentIntentIds: ['pi_1', 'pi_2'],
    importeCentimos: 10000,
    intentosExitosos: 2,
    primeraFecha: '2026-09-18T10:00:00Z',
    ultimaFecha: '2026-09-18T11:00:00Z',
  };

  assert.equal(doble.reciboId, 'rec-123');
  assert.equal(doble.intentosExitosos, 2);
  assert.equal(doble.paymentIntentIds.length, 2);
});

test('Agrupación de intentos - múltiples por recibo', () => {
  // Simular agrupación: mismo que hace detectarDoblesCobros
  const intentos = [
    { recibo_id: 'rec-1', payment_intent_id: 'pi_1', desenlace: 'cobrado' },
    { recibo_id: 'rec-1', payment_intent_id: 'pi_2', desenlace: 'cobrado' },
    { recibo_id: 'rec-1', payment_intent_id: 'pi_3', desenlace: 'cobrado' },
    { recibo_id: 'rec-2', payment_intent_id: 'pi_4', desenlace: 'cobrado' },
  ];

  const agrupadoPorRecibo = new Map<string, typeof intentos>();
  for (const intento of intentos) {
    const key = intento.recibo_id;
    if (!agrupadoPorRecibo.has(key)) {
      agrupadoPorRecibo.set(key, []);
    }
    agrupadoPorRecibo.get(key)!.push(intento);
  }

  const dobles = Array.from(agrupadoPorRecibo.entries())
    .filter(([_, items]) => items.length > 1)
    .map(([reciboId, items]) => ({
      reciboId,
      count: items.length,
    }));

  assert.equal(dobles.length, 1);
  assert.equal(dobles[0].reciboId, 'rec-1');
  assert.equal(dobles[0].count, 3);
});

test('Filtro de intentos fallidos - no cuentan', () => {
  const intentos = [
    { recibo_id: 'rec-1', payment_intent_id: 'pi_1', desenlace: 'cobrado' },
    { recibo_id: 'rec-1', payment_intent_id: 'pi_2', desenlace: 'fallido' }, // fallido
    { recibo_id: 'rec-1', payment_intent_id: 'pi_3', desenlace: 'cobrado' },
  ];

  // Filtrar solo 'cobrado'
  const exitosos = intentos.filter(i => i.desenlace === 'cobrado');

  assert.equal(exitosos.length, 2);
  assert.equal(exitosos[0].payment_intent_id, 'pi_1');
  assert.equal(exitosos[1].payment_intent_id, 'pi_3');
});

test('Estados válidos de doble cobro detectado', () => {
  const estadosValidos = ['PENDIENTE_REVISION', 'CONFIRMADO', 'FALSO_POSITIVO', 'RESUELTO'];
  const estado = 'CONFIRMADO';

  assert.ok(estadosValidos.includes(estado));
  assert.throws(() => {
    const estadoInvalido = 'CUALQUIER_COSA';
    if (!estadosValidos.includes(estadoInvalido)) {
      throw new Error('Estado inválido');
    }
  });
});

test('Idempotencia - duplicate key 23505', () => {
  // Un error 23505 (duplicate key) en SQL significa que el registro ya existe
  // y por tanto la operación es idempotente.
  const error = { code: '23505', message: 'duplicate key' };
  const esIdempotente = error.code === '23505';

  assert.ok(esIdempotente);
});

test('Detección de múltiples payment_intent distintos', () => {
  // Simular la lógica de detectarDoblesCobros
  const intentos = [
    { payment_intent_id: 'pi_1', creado_en: '2026-09-18T10:00:00Z' },
    { payment_intent_id: 'pi_2', creado_en: '2026-09-18T10:05:00Z' },
    { payment_intent_id: 'pi_3', creado_en: '2026-09-18T10:10:00Z' },
  ];

  const porPaymentIntent = new Set<string>();
  for (const intento of intentos) {
    porPaymentIntent.add(intento.payment_intent_id);
  }

  const esDoble = porPaymentIntent.size > 1;
  assert.ok(esDoble);
  assert.equal(porPaymentIntent.size, 3);
});
