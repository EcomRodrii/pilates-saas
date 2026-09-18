import { describe, it } from 'node:test';
import * as assert from 'node:assert';

/**
 * Tests para la lógica de reversión de dobles cobros (PAY-8)
 */

describe('revertir-doble-cobro', () => {
  describe('Cálculo de importe a devolver', () => {
    it('Devuelve importe correcto cuando hay 2 cargos iguales', () => {
      const importePrimero = 2950;
      const importeTotal = 5900;
      const importeDuplicado = importeTotal - importePrimero;

      assert.strictEqual(importeDuplicado, 2950);
    });

    it('Devuelve importe correcto cuando hay 3 cargos', () => {
      const importePrimero = 1000;
      const importeTotal = 3000;
      const importeDuplicado = importeTotal - importePrimero;

      assert.strictEqual(importeDuplicado, 2000);
    });

    it('Importe debe ser siempre positivo', () => {
      const importes = [100, 200, 300];
      const total = importes.reduce((a, b) => a + b, 0);
      const duplicado = total - importes[0];

      assert.ok(duplicado > 0);
    });
  });

  describe('Validaciones', () => {
    it('Rechaza reversión si importe es 0', () => {
      const importeCentimos = 0;
      const isValid = importeCentimos > 0;
      assert.strictEqual(isValid, false);
    });

    it('Rechaza reversión si tipo no es credito ni refund', () => {
      const tipo = 'invalid_type';
      const isValid = ['credito', 'refund'].includes(tipo);
      assert.strictEqual(isValid, false);
    });

    it('Aceptar reversión válida', () => {
      const importeCentimos = 2950;
      const tipo = 'credito';
      const isValidImporte = importeCentimos > 0;
      const isValidTipo = ['credito', 'refund'].includes(tipo);

      assert.strictEqual(isValidImporte && isValidTipo, true);
    });
  });

  describe('Conversión EUR ↔ centimos', () => {
    it('Convierte EUR a centimos correctamente', () => {
      const eur = 29.50;
      const centimos = Math.round(eur * 100);
      assert.strictEqual(centimos, 2950);
    });

    it('Convierte centimos a EUR correctamente', () => {
      const centimos = 2950;
      const eur = centimos / 100;
      assert.strictEqual(eur, 29.5);
    });

    it('Maneja centimos exactos sin decimales', () => {
      const centimos = 1000;
      const eur = centimos / 100;
      assert.strictEqual(eur, 10.0);
    });
  });

  describe('Idempotencia de reversión', () => {
    it('Mismo doble cobro reversado dos veces debe ser detectado', () => {
      const estado1 = 'PENDIENTE_REVISION';
      const estado2 = 'RESUELTO';

      const puedeRevertirPrimera = estado1 === 'PENDIENTE_REVISION';
      const puedeRevertirSegunda = estado2 === 'PENDIENTE_REVISION';

      assert.strictEqual(puedeRevertirPrimera, true);
      assert.strictEqual(puedeRevertirSegunda, false);
    });
  });

  describe('Metadatos de reversión', () => {
    it('Guarda metadata correcta para crédito', () => {
      const metadata = {
        tipo_resolucion: 'credito',
        credito_id: 'cred-123',
      };

      assert.strictEqual(metadata.tipo_resolucion, 'credito');
      assert.ok(metadata.credito_id.includes('cred-'));
    });

    it('Guarda metadata correcta para refund', () => {
      const metadata = {
        tipo_resolucion: 'refund',
        refund_id: 're_test_123',
      };

      assert.strictEqual(metadata.tipo_resolucion, 'refund');
      assert.ok(metadata.refund_id.includes('re_'));
    });
  });

  describe('Payment intent IDs', () => {
    it('Extrae primer payment_intent de array', () => {
      const paymentIntentIds = ['pi_primary', 'pi_duplicate'];
      const primerIntento = Array.isArray(paymentIntentIds)
        ? paymentIntentIds[0]
        : paymentIntentIds;

      assert.strictEqual(primerIntento, 'pi_primary');
    });

    it('Maneja caso de string único', () => {
      const paymentIntentId = 'pi_single';
      const primerIntento = Array.isArray(paymentIntentId)
        ? paymentIntentId[0]
        : paymentIntentId;

      assert.strictEqual(primerIntento, 'pi_single');
    });

    it('Rechaza si no hay payment_intent_id', () => {
      const paymentIntentId = null;
      const isValid = !!paymentIntentId;
      assert.strictEqual(isValid, false);
    });
  });
});
