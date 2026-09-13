import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esErrorTransitorioDeInfra, conReintentoTransitorio } from './reintento-transitorio.ts';

// M-11 (59ª auditoría / Sentry JAVASCRIPT-NEXTJS-1G): fetchAllRows
// (lib/supabase-data.ts) se rendía a la primera ante un Gateway Timeout. El
// cron global de recordatorios (cada 15 min) es el que más lo sufre solo por
// volumen: 124 apariciones en 27 días es la misma tasa de fallo ambiental que
// en cualquier otro sitio, vista muchas más veces.

test('reconoce los mensajes de infraestructura transitoria', () => {
  for (const msg of ['Gateway Timeout', 'Service Unavailable', 'Too Many Connections', 'connection reset by peer', 'Connection terminated unexpectedly']) {
    assert.equal(esErrorTransitorioDeInfra({ message: msg }), true, `"${msg}" debería ser transitorio`);
  }
});

test('un error de negocio/permisos no se confunde con uno transitorio', () => {
  for (const msg of ['permission denied for table tipos_clase', 'CONDICION_NO_CUMPLIDA', 'duplicate key value violates unique constraint']) {
    assert.equal(esErrorTransitorioDeInfra({ message: msg }), false, `"${msg}" no debería ser transitorio`);
  }
});

test('un fallo transitorio puntual se recupera solo', async () => {
  let llamadas = 0;
  const intentar = async () => {
    llamadas++;
    if (llamadas === 1) return { data: null, error: { message: 'Gateway Timeout' } };
    return { data: [{ id: 1 }], error: null };
  };
  const { resultado, reintentos } = await conReintentoTransitorio(intentar);
  assert.equal(resultado.error, null);
  assert.deepEqual(resultado.data, [{ id: 1 }]);
  assert.equal(reintentos, 1);
});

test('agota los reintentos y devuelve el último error si el fallo persiste', async () => {
  let llamadas = 0;
  const intentar = async () => {
    llamadas++;
    return { data: null, error: { message: 'Gateway Timeout' } };
  };
  const { resultado, reintentos } = await conReintentoTransitorio(intentar);
  assert.equal(resultado.error?.message, 'Gateway Timeout');
  assert.equal(llamadas, reintentos + 1, 'un intento inicial más los reintentos, ni uno más');
  assert.ok(reintentos >= 1, 'tiene que haber reintentado al menos una vez');
});

test('un error que NO es transitorio no se reintenta ni una vez', async () => {
  let llamadas = 0;
  const intentar = async () => {
    llamadas++;
    return { data: null, error: { message: 'permission denied for table tipos_clase' } };
  };
  const { resultado, reintentos } = await conReintentoTransitorio(intentar);
  assert.equal(llamadas, 1);
  assert.equal(reintentos, 0);
  assert.equal(resultado.error?.message, 'permission denied for table tipos_clase');
});

test('un éxito a la primera no reintenta', async () => {
  let llamadas = 0;
  const intentar = async () => {
    llamadas++;
    return { data: [{ id: 1 }], error: null };
  };
  const { reintentos } = await conReintentoTransitorio(intentar);
  assert.equal(llamadas, 1);
  assert.equal(reintentos, 0);
});
