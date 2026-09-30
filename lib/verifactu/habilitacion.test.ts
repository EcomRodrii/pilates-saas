// Bloqueo duro contra la base: sin alta y sin poder verificado, el estudio no
// transmite. (Las reglas finas, en apoderamiento.test.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { estudioHabilitado } from './habilitacion.ts';

/** Un cliente falso que devuelve estas filas por tabla (null = no hay). */
function adminFalso(filas: Record<string, Record<string, unknown> | null>): SupabaseClient {
  const consulta = (tabla: string) => {
    const q = {
      select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: filas[tabla] ?? null, error: null }),
    };
    return q;
  };
  return { from: consulta } as unknown as SupabaseClient;
}

const ENV = { VERIFACTU_PRODUCTOR_NOMBRE: 'P', VERIFACTU_PRODUCTOR_NIF: '00000000T' };
const HOY = new Date('2026-09-30T10:00:00Z');

test('estudio sin alta ni poder → no habilitado', async () => {
  const h = await estudioHabilitado(adminFalso({ studios: { nif: '99999999R', es_demo: false } }), 'studio-x', ENV, HOY);
  assert.deepEqual(h, { habilitado: false, motivo: 'SIN_AUTORIZACION_VERIFICADA' });
});

test('en producción con poder verificado y vigente → habilitado', async () => {
  const h = await estudioHabilitado(adminFalso({
    studios: { nif: '99999999R', es_demo: false },
    verifactu_estudios: { estado: 'PRODUCCION', nif: '99999999R' },
    verifactu_representaciones: { estado: 'VERIFICADA', vigente_hasta: '2031-09-29', nif_representado: '99999999R', apoderado_nif: '00000000T' },
  }), 'studio-x', ENV, HOY);
  assert.deepEqual(h, { habilitado: true });
});

test('sin apoderado configurado en el servidor → no habilitado', async () => {
  const h = await estudioHabilitado(adminFalso({
    studios: { nif: '99999999R', es_demo: false },
    verifactu_estudios: { estado: 'PRODUCCION', nif: '99999999R' },
    verifactu_representaciones: { estado: 'VERIFICADA', vigente_hasta: '2031-09-29', nif_representado: '99999999R', apoderado_nif: '00000000T' },
  }), 'studio-x', {}, HOY);
  assert.equal(h.habilitado, false);
});
