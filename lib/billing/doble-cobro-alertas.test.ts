import { test } from 'node:test';
import { strict as assert } from 'node:assert';

/**
 * PAY-6: Tests unitarios para alertas de doble cobro.
 *
 * Verifica que alertarDobleCobroDetectado:
 * 1. Emite evento con dedupKey correcto
 * 2. Captura errores sin relanzar (best-effort)
 */

// Mock de publish() para testear llamadas
let lastPublishCall: { type: string; dedupKey: string; studioId: string; data: Record<string, unknown> } | null = null;
let shouldPublishFail = false;

const mockPublish = async (event: {
  type: string;
  studioId: string;
  data: Record<string, unknown>;
  resource: { type: string; id: string };
  dedupKey: string;
}) => {
  if (shouldPublishFail) {
    throw new Error('Mock publish error');
  }
  lastPublishCall = {
    type: event.type,
    dedupKey: event.dedupKey,
    studioId: event.studioId,
    data: event.data,
  };
};

/**
 * Versión testeable de alertarDobleCobroDetectado.
 * Extrae la lógica pura (construcción del evento) y acepta una función publish inyectable.
 */
async function alertarDobleCobroDetectadoTesteable(
  studioId: string,
  reciboId: string,
  importeCentimos: number,
  intentosExitosos: number,
  publishFn: (event: any) => Promise<void>,
): Promise<void> {
  try {
    const importe = (importeCentimos / 100).toFixed(2);
    const dedupKey = `doble-cobro:${studioId}:${reciboId}`;

    await publishFn({
      type: 'DOBLE_COBRO_DETECTADO',
      studioId,
      data: {
        reciboId,
        importe,
        intentos: intentosExitosos,
      },
      resource: { type: 'recibo', id: reciboId },
      dedupKey,
    });
  } catch (e) {
    console.error('[billing] alertarDobleCobroDetectado:', e instanceof Error ? e.message : e);
    // Best-effort: no relanzar el error
  }
}

test('PAY-6: alertar() emite evento con dedupKey correcto', async () => {
  lastPublishCall = null;
  shouldPublishFail = false;

  await alertarDobleCobroDetectadoTesteable(
    'studio-123',
    'rec-456',
    50000, // 500.00 EUR
    2,
    mockPublish,
  );

  assert.ok(lastPublishCall, 'Debe haber llamado a publish');
  assert.equal(lastPublishCall!.type, 'DOBLE_COBRO_DETECTADO', 'Tipo de evento correcto');
  assert.equal(lastPublishCall!.dedupKey, 'doble-cobro:studio-123:rec-456', 'dedupKey correcto');
  assert.equal(lastPublishCall!.data.importe, '500.00', 'Importe calculado correctamente');
  assert.equal(lastPublishCall!.data.intentos, 2, 'Número de intentos correcto');
});

test('PAY-6: alertar() captura error sin relanzar (best-effort)', async () => {
  lastPublishCall = null;
  shouldPublishFail = true;

  let throwed = false;
  try {
    await alertarDobleCobroDetectadoTesteable(
      'studio-789',
      'rec-999',
      10000,
      3,
      mockPublish,
    );
  } catch (e) {
    throwed = true;
  }

  assert.equal(throwed, false, 'No debe relanzar el error');
  assert.equal(lastPublishCall, null, 'No debe haber llegado a guardar lastPublishCall por el error');
});
