import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leerRecompensaPendiente, canjearRecompensa, devolverRecompensa } from './recompensa-review-boost.ts';

type Respuesta = { data: unknown; error: { message: string } | null };

// Graba cada cadena de llamadas (`from(...).update(...).eq(...)`) y responde
// según sea lectura o escritura.
function adminFalso(respuestas: { select?: Respuesta; update?: Respuesta; lanzaUpdate?: boolean }) {
  const llamadas: string[] = [];
  const admin = {
    from(tabla: string) {
      const pasos = [tabla];
      let tipo: 'select' | 'update' = 'select';
      const responder = () => {
        llamadas.push(pasos.join('.'));
        if (tipo === 'update' && respuestas.lanzaUpdate) return Promise.reject(new Error('red caída'));
        return Promise.resolve(respuestas[tipo] ?? { data: null, error: null });
      };
      const q = {
        select(c: string) { pasos.push(`select(${c})`); return q; },
        update(v: unknown) { tipo = 'update'; pasos.push(`update(${JSON.stringify(v)})`); return q; },
        eq(c: string, v: unknown) { pasos.push(`eq(${c},${v})`); return q; },
        is(c: string, v: unknown) { pasos.push(`is(${c},${v})`); return q; },
        maybeSingle: responder,
        then(ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) { return responder().then(ok, ko); },
      };
      return q;
    },
  };
  return { admin: admin as never, llamadas };
}

const RECOMPENSA = { id: 'rb-1', cupon: 'cupon_20' };

test('lee la recompensa sin canjear del estudio', async () => {
  const { admin, llamadas } = adminFalso({ select: { data: { id: 'rb-1', stripe_coupon_id: 'cupon_20' }, error: null } });
  assert.deepEqual(await leerRecompensaPendiente(admin, 'estudio-1'), RECOMPENSA);
  assert.deepEqual(llamadas, ['review_boost_recompensas.select(id, stripe_coupon_id).eq(studio_id,estudio-1).is(canjeada_en,null)']);
});

test('sin recompensa, sin cupón o con la lectura fallida: no hay descuento (no mueve dinero)', async () => {
  for (const r of [
    { data: null, error: null },
    { data: { id: 'rb-1', stripe_coupon_id: null }, error: null },
    { data: null, error: { message: 'timeout' } },
  ]) {
    const { admin } = adminFalso({ select: r });
    assert.equal(await leerRecompensaPendiente(admin, 'estudio-1'), null);
  }
});

test('canjear es compare-and-set sobre canjeada_en IS NULL y devuelve la marca si se la queda', async () => {
  const { admin, llamadas } = adminFalso({ update: { data: { id: 'rb-1' }, error: null } });
  const ahora = new Date('2026-10-04T10:00:00.123Z');
  assert.equal(await canjearRecompensa(admin, RECOMPENSA, ahora), '2026-10-04T10:00:00.123Z');
  assert.deepEqual(llamadas, [
    'review_boost_recompensas.update({"canjeada_en":"2026-10-04T10:00:00.123Z"}).eq(id,rb-1).is(canjeada_en,null).select(id)',
  ]);
});

test('si otra petición ya la canjeó, null: se sigue sin descuento', async () => {
  const { admin } = adminFalso({ update: { data: null, error: null } });
  assert.equal(await canjearRecompensa(admin, RECOMPENSA), null);
});

test('devolver deshace SOLO este canje (misma marca)', async () => {
  const { admin, llamadas } = adminFalso({});
  await devolverRecompensa(admin, RECOMPENSA, '2026-10-04T10:00:00.123Z');
  assert.deepEqual(llamadas, [
    'review_boost_recompensas.update({"canjeada_en":null}).eq(id,rb-1).eq(canjeada_en,2026-10-04T10:00:00.123Z)',
  ]);
});

test('devolver es best-effort: si la BD falla, no lanza (el error de Stripe es el que importa)', async () => {
  const { admin } = adminFalso({ lanzaUpdate: true });
  await assert.doesNotReject(devolverRecompensa(admin, RECOMPENSA, '2026-10-04T10:00:00.123Z'));
});

// ── La ruta canjea justo antes de crear la sesión, en las dos ramas ─────────

test('/api/billing/checkout: la recompensa se canjea solo al crear la sesión, y se devuelve si Stripe falla', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', '..', 'app', 'api', 'billing', 'checkout', 'route.ts'), 'utf8');
  assert.ok(!ruta.includes("from('review_boost_recompensas')"), 'la ruta no toca la tabla a mano: va por recompensa-review-boost.ts');
  assert.equal(ruta.split('canjearRecompensa(').length - 1, 1, 'un solo canje, dentro de crearConRecompensa');
  const sesiones = ruta.split('stripe.checkout.sessions.create(').length - 1;
  const envueltas = ruta.split('crearConRecompensa(discounts => stripe.checkout.sessions.create(').length - 1;
  assert.equal(sesiones, 2);
  assert.equal(envueltas, 2, 'las dos ramas crean la sesión a través de crearConRecompensa');
  const ayudante = ruta.slice(ruta.indexOf('const crearConRecompensa'), ruta.indexOf('async function checkoutPrevio'));
  assert.match(ayudante, /catch \(err\) \{\s*if \(recompensa && canjeadaEn\) await devolverRecompensa\(/);
});
