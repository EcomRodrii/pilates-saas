import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirConversaciones } from './resumen.ts';

const conv = (id: string, tipo: string) => ({ id, tipo, ultimo_mensaje_en: '2026-09-14T10:00:00Z' });

test('un hilo instructora–alumna en el que no participo es de solo lectura; el mío y el mostrador, no', () => {
  const r = resumirConversaciones(
    [conv('ajeno', 'ALUMNA_INSTRUCTORA'), conv('mio', 'ALUMNA_INSTRUCTORA'), conv('mostrador', 'ALUMNA_MOSTRADOR')],
    [],
    [
      { conversacion_id: 'ajeno', auth_user_id: 'instructora', leido_hasta: '2026-09-14T09:00:00Z' },
      { conversacion_id: 'ajeno', auth_user_id: 'socia', leido_hasta: '2026-09-14T09:00:00Z' },
      { conversacion_id: 'mio', auth_user_id: 'yo', leido_hasta: '2026-09-14T09:00:00Z' },
    ],
    'yo',
  );
  assert.deepEqual(r.map((c) => [c.id, c.solo_lectura]), [['ajeno', true], ['mio', false], ['mostrador', false]]);
  // Sin fila propia no hay «leído por mí»: nunca cuenta como sin leer.
  assert.equal(r[0].leido_hasta, null);
});
