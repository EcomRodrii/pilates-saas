import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { claveDeRefPOS, esEtapaAgotada, EtapaAgotadaError, recuperarPlazasCaducadas, refPlazaPOS } from './cupo.ts';

test('la clave del TPV se recupera de su ref aunque lleve dos puntos', () => {
  const ref = refPlazaPOS('caja:1:abc', 'plan-x', 3);
  assert.equal(ref, 'pos:caja:1:abc:plan-x:3');
  assert.equal(claveDeRefPOS(ref), 'caja:1:abc');
});

test('reconoce la etapa agotada venga de la BD o del propio código', () => {
  assert.ok(esEtapaAgotada({ code: 'P0001', message: 'ETAPA_AGOTADA' }));
  assert.ok(esEtapaAgotada(new EtapaAgotadaError()));
  assert.ok(!esEtapaAgotada(new Error('otra cosa')));
});

// ── Fakes mínimos ─────────────────────────────────────────────────────────
function fakeAdmin(plazas: { id: string; stripe_ref: string | null }[], ventas: Record<string, string | null> = {}) {
  const liberadas: string[] = [];
  const consulta = (tabla: string) => {
    const filtros: Record<string, unknown> = {};
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros[c] = v; return q; },
      in: () => q, lt: () => q,
      limit: async () => ({ data: plazas, error: null }),
      maybeSingle: async () => {
        const estado = ventas[filtros.idempotencia_clave as string];
        return { data: estado === undefined || estado === null ? null : { estado }, error: null };
      },
      then: (ok: (r: unknown) => void) => ok({ data: tabla === 'launch_stages' ? [{ id: 'etapa-1' }] : [], error: null }),
    };
    return q;
  };
  const admin = {
    from: consulta,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'liberar_plaza_etapa') liberadas.push(args.p_plaza_id as string);
      return { data: true, error: null };
    },
  } as unknown as SupabaseClient;
  return { admin, liberadas };
}

function fakeStripe(estados: Record<string, string>, fallan: Set<string> = new Set()) {
  const acciones: string[] = [];
  const leer = async (id: string) => {
    if (fallan.has(id)) throw new Error('Stripe no contesta');
    return { id, status: estados[id] };
  };
  const stripe = {
    checkout: { sessions: {
      retrieve: leer,
      expire: async (id: string) => { acciones.push(`expire:${id}`); return { id, status: 'expired' }; },
    } },
    paymentIntents: {
      retrieve: leer,
      cancel: async (id: string) => { acciones.push(`cancel:${id}`); return { id, status: 'canceled' }; },
    },
  } as unknown as Stripe;
  return { stripe, acciones };
}

test('solo suelta la plaza cuando Stripe confirma que el cobro ya no puede ocurrir', async () => {
  const plazas = [
    { id: 'sin-ref', stripe_ref: null },
    { id: 'cs-caducada', stripe_ref: 'cs_1' },
    { id: 'cs-abierta', stripe_ref: 'cs_2' },
    { id: 'cs-pagada', stripe_ref: 'cs_3' },
    { id: 'pi-abandonado', stripe_ref: 'pi_1' },
    { id: 'pi-sepa-en-curso', stripe_ref: 'pi_2' },
    { id: 'pi-pagado', stripe_ref: 'pi_3' },
    { id: 'pi-cancelado', stripe_ref: 'pi_4' },
    { id: 'stripe-caido', stripe_ref: 'pi_5' },
    { id: 'pos-anulada', stripe_ref: 'pos:k1:plan-x:0' },
    { id: 'pos-pagada', stripe_ref: 'pos:k2:plan-x:0' },
    { id: 'pos-no-registrada', stripe_ref: 'pos:k3:plan-x:0' },
  ];
  const { admin, liberadas } = fakeAdmin(plazas, { k1: 'ANULADA', k2: 'PAGADA', k3: null });
  const { stripe, acciones } = fakeStripe({
    cs_1: 'expired', cs_2: 'open', cs_3: 'complete',
    pi_1: 'requires_payment_method', pi_2: 'processing', pi_3: 'succeeded', pi_4: 'canceled',
  }, new Set(['pi_5']));

  const n = await recuperarPlazasCaducadas(admin, stripe, 'plan-x', 'studio-1', 'acct_1');

  assert.deepEqual(liberadas.sort(), ['cs-abierta', 'cs-caducada', 'pi-abandonado', 'pi-cancelado', 'pos-anulada', 'pos-no-registrada', 'sin-ref'].sort());
  assert.equal(n, 7);
  // Lo abierto se cierra en Stripe ANTES de soltar la plaza.
  assert.deepEqual(acciones.sort(), ['cancel:pi_1', 'expire:cs_2']);
});
