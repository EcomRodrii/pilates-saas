import test from 'node:test';
import assert from 'node:assert/strict';
import { retiroVigente, textoRetiro } from './consentimiento-retirado.ts';

const ev = (en: string, accion: 'DAR' | 'RETIRAR', origen = 'SOCIA') => ({ en, accion, origen });

test('sin historial no hay retiro', () => assert.equal(retiroVigente([]), null));

test('el último evento manda: dar tras retirar deja de estar retirado', () => {
  assert.equal(retiroVigente([ev('2026-01-01T00:00:00Z', 'DAR'), ev('2026-02-01T00:00:00Z', 'RETIRAR'), ev('2026-03-01T00:00:00Z', 'DAR', 'MOSTRADOR')]), null);
});

test('retirar tras dar es un retiro vigente, aunque lleguen desordenados', () => {
  const r = retiroVigente([ev('2026-02-01T00:00:00Z', 'RETIRAR', 'BAJA_EMAIL'), ev('2026-01-01T00:00:00Z', 'DAR')]);
  assert.deepEqual(r, { retiradoEn: '2026-02-01T00:00:00Z', origen: 'BAJA_EMAIL' });
});

test('el texto dice por dónde se dio de baja', () => {
  assert.match(textoRetiro({ retiradoEn: 'x', origen: 'BAJA_EMAIL' }, '3 feb 2026'), /enlace de un email/);
  assert.doesNotMatch(textoRetiro({ retiradoEn: 'x', origen: 'SOCIA' }, '3 feb 2026'), /enlace/);
});
