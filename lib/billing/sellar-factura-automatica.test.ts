import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sellarFacturaDeRecibo } from './sellar-factura-server.ts';

// Cliente falso mínimo: ninguna factura existente, y el estudio dice lo que se le pide.
function falso(opts: { facturarAutomatico?: boolean | null; errorAjuste?: boolean; nif?: string }) {
  const lecturas: string[] = [];
  const admin = {
    rpc: async () => { throw new Error('no debería reservar número'); },
    from(tabla: string) {
      let columnas = '';
      const q = {
        select(c: string) { columnas = c; return q; },
        eq() { return q; }, limit() { return q; },
        maybeSingle: async () => {
          if (tabla === 'facturas') return { data: null, error: null };
          lecturas.push(columnas);
          if (columnas === 'facturar_automatico') {
            return opts.errorAjuste
              ? { data: null, error: { message: 'column studios.facturar_automatico does not exist' } }
              : { data: { facturar_automatico: opts.facturarAutomatico ?? true }, error: null };
          }
          return { data: { nif: opts.nif ?? '', modo_facturacion: 'facturas' }, error: null };
        },
      };
      return q;
    },
  };
  return { admin: admin as unknown as SupabaseClient, lecturas };
}

const P = { studioId: 'e1', reciboId: 'rec-1', facturaId: 'fac-1' };

test('automática con el ajuste apagado: no emite, y se lee como «desactivada» para que nadie la marque pendiente', async () => {
  const { admin } = falso({ facturarAutomatico: false });
  const r = await sellarFacturaDeRecibo(admin, { ...P, origen: 'automatica' });
  assert.deepEqual([r.ok, r.desactivada, r.omitida], [false, true, true]);
});

test('manual con el ajuste apagado: sale (llega a la guarda del NIF, no se frena antes)', async () => {
  const { admin, lecturas } = falso({ facturarAutomatico: false });
  const r = await sellarFacturaDeRecibo(admin, { ...P, origen: 'manual' });
  assert.equal(r.omitida, undefined);
  assert.equal(r.faltaNif, true);
  assert.ok(!lecturas.includes('facturar_automatico'), 'la manual ni mira el ajuste');
  const sinOrigen = await sellarFacturaDeRecibo(admin, P);
  assert.equal(sinOrigen.faltaNif, true, 'sin origen = manual');
});

test('automática con el ajuste encendido, o con la columna aún sin migrar: sigue como siempre', async () => {
  for (const o of [{ facturarAutomatico: true }, { errorAjuste: true }, { facturarAutomatico: null }]) {
    const { admin } = falso(o);
    const r = await sellarFacturaDeRecibo(admin, { ...P, origen: 'automatica' });
    assert.equal(r.omitida, undefined, JSON.stringify(o));
    assert.equal(r.faltaNif, true, JSON.stringify(o));
  }
});
