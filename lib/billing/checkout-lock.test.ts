import test from 'node:test';
import assert from 'node:assert/strict';
import { claveCheckoutLock, reclamarCheckoutLock, liberarCheckoutLock } from './checkout-lock.ts';

// Fake admin que reproduce la semántica SQL exacta de reclamar_checkout_lock/
// liberar_checkout_lock (migr. pay3_billing_checkout_lock): mismo patrón que
// el fake de lib/webhook-idempotencia.test.ts.
function fakeAdmin(nowMs: () => number) {
  const filas = new Map<string, { enCurso: boolean; iniciadoEnMs: number }>();
  return {
    async rpc(nombre: string, params: Record<string, unknown>) {
      if (nombre === 'reclamar_checkout_lock') {
        const clave = params.p_clave as string;
        const expiraMs = (params.p_expira_segundos as number) * 1000;
        const fila = filas.get(clave);
        if (!fila) {
          filas.set(clave, { enCurso: true, iniciadoEnMs: nowMs() });
          return { data: true, error: null };
        }
        const puedeReclamar = !fila.enCurso || fila.iniciadoEnMs < nowMs() - expiraMs;
        if (!puedeReclamar) return { data: false, error: null };
        fila.enCurso = true;
        fila.iniciadoEnMs = nowMs();
        return { data: true, error: null };
      }
      if (nombre === 'liberar_checkout_lock') {
        const fila = filas.get(params.p_clave as string);
        if (fila) fila.enCurso = false;
        return { data: null, error: null };
      }
      throw new Error(`rpc no soportada en el fake: ${nombre}`);
    },
  };
}

test('claveCheckoutLock: prefija por tipo, para no colisionar id de estudio con id de cadena', () => {
  assert.equal(claveCheckoutLock('studio', 'x1'), 'studio:x1');
  assert.equal(claveCheckoutLock('cadena', 'x1'), 'cadena:x1');
});

test('el primer intento reclama; uno en vuelo no puede reclamar de nuevo', async () => {
  const admin = fakeAdmin(() => 1_000_000);
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s1'), true);
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s1'), false);
});

test('liberar deja reclamar de nuevo al instante', async () => {
  const admin = fakeAdmin(() => 2_000_000);
  await reclamarCheckoutLock(admin as any, 'studio:s1');
  await liberarCheckoutLock(admin as any, 'studio:s1');
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s1'), true);
});

test('un cerrojo huérfano expira solo pasado el plazo', async () => {
  let ahora = 3_000_000;
  const admin = fakeAdmin(() => ahora);
  await reclamarCheckoutLock(admin as any, 'studio:s1', 30);
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s1', 30), false);
  ahora += 31_000;
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s1', 30), true);
});

test('claves distintas no se pisan entre sí', async () => {
  const admin = fakeAdmin(() => 4_000_000);
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s1'), true);
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s2'), true);
});

test('un fallo de RPC al reclamar cuenta como NO reclamado (fail-closed, al revés que el de webhooks)', async () => {
  const admin = { rpc: async () => { throw new Error('red caída'); } };
  assert.equal(await reclamarCheckoutLock(admin as any, 'studio:s1'), false);
});

test('un fallo de RPC al liberar no lanza (best-effort: el cerrojo expira solo)', async () => {
  const admin = { rpc: async () => { throw new Error('red caída'); } };
  await assert.doesNotReject(liberarCheckoutLock(admin as any, 'studio:s1'));
});
