// Las dos escrituras de ia_packs contra un cliente falso que se porta como la
// tabla (UNIQUE por sesión de Checkout, FK a studios): la idempotencia del
// webhook y el reembolso. La misma aritmética contra Postgres de verdad está en
// supabase/tests/rls-ia-consumos.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acreditarPack, retirarPackPorPago } from './packs-libro.ts';

type Fila = Record<string, unknown>;

function tablaFalsa(o: { estudios?: string[]; fallo?: { code: string; message: string } } = {}) {
  const filas: Fila[] = [];
  const estudios = new Set(o.estudios ?? ['studio-x']);
  const admin = {
    from(tabla: string) {
      assert.equal(tabla, 'ia_packs');
      return {
        upsert(fila: Fila, opts: { onConflict: string; ignoreDuplicates: boolean }) {
          assert.deepEqual(opts, { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true });
          return {
            select: async () => {
              if (o.fallo) return { data: null, error: o.fallo };
              if (!estudios.has(fila.studio_id as string)) return { data: null, error: { code: '23503', message: 'fk' } };
              if (filas.some(f => f.stripe_checkout_session_id === fila.stripe_checkout_session_id)) return { data: [], error: null };
              filas.push({ id: `p${filas.length + 1}`, unidades_usadas: 0, ...fila });
              return { data: [{ id: `p${filas.length}` }], error: null };
            },
          };
        },
        update(cambio: Fila) {
          const filtros: [string, unknown][] = [];
          const q = {
            eq(c: string, v: unknown) { filtros.push([c, v]); return q; },
            select: async () => {
              const tocadas = filas.filter(f => filtros.every(([c, v]) => f[c] === v));
              for (const f of tocadas) Object.assign(f, cambio);
              return { data: tocadas.map(f => ({ id: f.id })), error: null };
            },
          };
          return q;
        },
        select() {
          const filtros: [string, unknown][] = [];
          const q = {
            eq(c: string, v: unknown) { filtros.push([c, v]); return q; },
            maybeSingle: async () => ({ data: filas.find(f => filtros.every(([c, v]) => f[c] === v)) ?? null, error: null }),
          };
          return q;
        },
      };
    },
  };
  return { admin: admin as unknown as Parameters<typeof acreditarPack>[0], filas };
}

const PACK = { studioId: 'studio-x', unidades: 300 as const, precioEur: 24, sessionId: 'cs_test_1', paymentIntentId: 'pi_1' };

test('idempotencia: el mismo pago entregado dos veces (reintento, completed + async) crea UN pack', async () => {
  const { admin, filas } = tablaFalsa();
  const ahora = new Date('2026-10-06T10:00:00Z');
  assert.equal(await acreditarPack(admin, PACK, ahora), 'creado');
  assert.equal(await acreditarPack(admin, PACK, ahora), 'ya_estaba');
  assert.equal(await acreditarPack(admin, PACK, new Date('2026-10-07T10:00:00Z')), 'ya_estaba');
  assert.equal(filas.length, 1);
  assert.equal(filas[0].estado, 'ACTIVO');
  assert.equal(filas[0].unidades, 300);
  assert.equal(filas[0].precio_eur, 24);
  assert.equal(filas[0].comprado_en, '2026-10-06T10:00:00.000Z');
  assert.equal(filas[0].caduca_en, '2027-10-06T10:00:00.000Z', 'caduca a los 12 meses');
  assert.equal(filas[0].stripe_payment_intent_id, 'pi_1');
  // Otra compra (otra sesión) sí es otro pack.
  assert.equal(await acreditarPack(admin, { ...PACK, sessionId: 'cs_test_2', paymentIntentId: 'pi_2' }, ahora), 'creado');
  assert.equal(filas.length, 2);
});

test('un estudio que ya no existe no se reintenta; cualquier otro fallo lanza para que Stripe reintente', async () => {
  assert.equal(await acreditarPack(tablaFalsa({ estudios: [] }).admin, PACK), 'estudio_inexistente');
  await assert.rejects(acreditarPack(tablaFalsa({ fallo: { code: '57014', message: 'timeout' } }).admin, PACK), /acreditar pack/);
});

test('reembolso: el pack pasa a REEMBOLSADO, lo gastado no vuelve, y repetirlo no hace nada', async () => {
  const { admin, filas } = tablaFalsa();
  await acreditarPack(admin, PACK);
  filas[0].unidades_usadas = 120;
  assert.equal(await retirarPackPorPago(admin, 'pi_1'), 'retirado');
  assert.equal(filas[0].estado, 'REEMBOLSADO');
  assert.equal(filas[0].unidades_usadas, 120, 'lo ya consumido se queda consumido');
  assert.equal(await retirarPackPorPago(admin, 'pi_1'), 'ya_retirado');
  assert.equal(await retirarPackPorPago(admin, 'pi_otro'), 'sin_pack');
});
