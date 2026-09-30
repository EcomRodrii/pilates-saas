import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  guardarLeadConcierge, type CambiosLead, type ErrorDb, type FilaLead,
} from './guardar-lead-concierge.ts';

// Estos tests ejecutan EL MISMO código que corre en producción: la ruta solo lo
// conecta a Supabase. Lo que protegen es que volver a enviar el formulario no
// reescriba el `id` ni el `origen` de un lead que ya existía.

const ENTRADA = { id: 'lead-nuevo', email: 'a@ejemplo.com', software: 'Momence', ahora: '2026-09-30T10:00:00.000Z' };

function salidaFalsa(opciones: { alInsertar?: ErrorDb | null; alRefrescar?: ErrorDb | null } = {}) {
  const insertadas: FilaLead[] = [];
  const refrescadas: { email: string; cambios: CambiosLead }[] = [];
  return {
    insertadas,
    refrescadas,
    salida: {
      insertar: async (fila: FilaLead) => { insertadas.push(fila); return opciones.alInsertar ?? null; },
      refrescar: async (email: string, cambios: CambiosLead) => { refrescadas.push({ email, cambios }); return opciones.alRefrescar ?? null; },
    },
  };
}

test('un lead nuevo se inserta con su origen y no se refresca nada', async () => {
  const { insertadas, refrescadas, salida } = salidaFalsa();
  const r = await guardarLeadConcierge(ENTRADA, salida);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(insertadas, [{
    id: 'lead-nuevo', email: 'a@ejemplo.com', software_actual: 'Momence', origen: 'CONCIERGE', actualizado_en: ENTRADA.ahora,
  }]);
  assert.equal(refrescadas.length, 0);
});

test('si el email ya existe, solo se refresca el software y la fecha: ni id ni origen', async () => {
  const { refrescadas, salida } = salidaFalsa({ alInsertar: { code: '23505', message: 'duplicate key' } });
  const r = await guardarLeadConcierge(ENTRADA, salida);
  assert.deepEqual(r, { ok: true });
  assert.equal(refrescadas.length, 1);
  assert.equal(refrescadas[0].email, 'a@ejemplo.com');
  // Las ÚNICAS columnas que cambian. Si aparece `id` u `origen` aquí, se vuelve
  // al bug: choca con las tablas que referencian el lead y pisa la atribución.
  assert.deepEqual(Object.keys(refrescadas[0].cambios).sort(), ['actualizado_en', 'software_actual']);
});

test('un fallo que no es «ya existe» no se disfraza de éxito ni intenta refrescar', async () => {
  const error = { code: '08006', message: 'connection failure' };
  const { refrescadas, salida } = salidaFalsa({ alInsertar: error });
  const r = await guardarLeadConcierge(ENTRADA, salida);
  assert.deepEqual(r, { ok: false, error });
  assert.equal(refrescadas.length, 0);
});

test('si existe pero no se puede refrescar, se dice que no se guardó', async () => {
  const error = { code: '42501', message: 'permission denied' };
  const { salida } = salidaFalsa({ alInsertar: { code: '23505' }, alRefrescar: error });
  assert.deepEqual(await guardarLeadConcierge(ENTRADA, salida), { ok: false, error });
});

test('sin software se guarda null, no una cadena vacía', async () => {
  const { insertadas, salida } = salidaFalsa();
  await guardarLeadConcierge({ ...ENTRADA, software: '' }, salida);
  assert.equal(insertadas[0].software_actual, null);
});
