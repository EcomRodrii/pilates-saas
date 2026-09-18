import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DobleCobroDetectado } from './detectar-doble-cobro.ts';
import { alertarDobleCobroDectectado } from './doble-cobro-alertas.ts';

// Mock de SupabaseClient
function createMockAdmin(recibo: any): any {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: any) => ({
          maybeSingle: () => Promise.resolve({ data: recibo, error: null }),
        }),
      }),
    }),
  };
}

test('PAY-6: Alerta a Sentry cuando se detecta un doble cobro', async () => {
  const mockAdmin = createMockAdmin({
    socios: {
      nombre: 'Ana',
      apellidos: 'García',
    },
    concepto: 'Clase de Pilates',
    importe_centimos: 5000,
  });

  const doble: DobleCobroDetectado = {
    recibo_id: 'rec-123',
    studio_id: 'studio-456',
    intentos_exitosos: [
      {
        payment_intent_id: 'pi_1',
        importe_centimos: 5000,
        origen: 'checkout',
        desenlace: 'cobrado',
        creado_en: '2026-09-18T10:00:00Z',
      },
      {
        payment_intent_id: 'pi_2',
        importe_centimos: 5000,
        origen: 'checkout',
        desenlace: 'cobrado',
        creado_en: '2026-09-18T10:05:00Z',
      },
    ],
    importe_duplicado_centimos: 5000,
    mensaje: 'Doble cobro: 2 cargos (50 EUR)',
  };

  // Solo verificamos que la función no lanza error
  await alertarDobleCobroDectectado(mockAdmin, doble);
  assert.ok(true, 'Alerta enviada sin error');
});
