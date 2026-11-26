import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidirReactivacion, rutaReactivar, RUTA_TODOS_LOS_PLANES, type EstadoParaReactivar } from './reactivar.ts';

const BLOQUEADA: EstadoParaReactivar = { estudioId: 'studio-a', esPropietaria: true, bloqueado: true, plan: 'BASE', gratis: null };

test('la dirección es la pedida: /studio/<estudio>/access_account/reactivate', () => {
  assert.equal(rutaReactivar('studio-a'), '/studio/studio-a/access_account/reactivate');
});

test('con el plazo pasado, la propietaria paga ahí', () => {
  assert.deepEqual(decidirReactivacion(BLOQUEADA, 'studio-a'), { accion: 'pagar', plan: 'BASE' });
  assert.deepEqual(decidirReactivacion({ ...BLOQUEADA, plan: 'ESTUDIO' }, null), { accion: 'pagar', plan: 'ESTUDIO' });
  // Desde el plan gratis se pasa a Founding Studio, diga lo que diga la columna.
  assert.deepEqual(decidirReactivacion({ ...BLOQUEADA, plan: 'ESTUDIO', gratis: {} }, null), { accion: 'pagar', plan: 'BASE' });
});

test('quien no está bloqueado no ve la pantalla', () => {
  assert.deepEqual(decidirReactivacion({ ...BLOQUEADA, bloqueado: false }, 'studio-a'), { accion: 'ir', a: '/dashboard' });
  assert.deepEqual(decidirReactivacion(null, 'studio-a'), { accion: 'ir', a: '/dashboard' });
});

test('⚠️ el estudio de la URL no manda: se corrige al de la sesión', () => {
  assert.deepEqual(decidirReactivacion(BLOQUEADA, 'studio-otro'), { accion: 'ir', a: rutaReactivar('studio-a') });
});

test('a /suscripcion: quien no es propietaria, Cadena y la sede que solo puede contratar Cadena', () => {
  for (const estado of [
    { ...BLOQUEADA, esPropietaria: false },
    { ...BLOQUEADA, estudioId: undefined },
    { ...BLOQUEADA, plan: 'CADENA' },
    { ...BLOQUEADA, opcionesDePlan: { soloCadena: true } },
  ]) assert.deepEqual(decidirReactivacion(estado, null), { accion: 'ir', a: RUTA_TODOS_LOS_PLANES });
});

test('RUTA_TODOS_LOS_PLANES lleva ancla: si no, /suscripcion devolvería aquí y sería un bucle', () => {
  assert.match(RUTA_TODOS_LOS_PLANES, /^\/suscripcion#/);
});

test('sin la autorización dentro del formulario de Stripe, va junto al botón', () => {
  const pago = readFileSync(new URL('../../components/billing/reactivar/pago-reactivar.tsx', import.meta.url), 'utf8');
  assert.match(pago, /terms: \{ card: 'never' \}/);
  assert.match(pago, /autorizas a Tentare a cobrarlo de tu tarjeta cada mes hasta que canceles/);
});

test('el pago incrustado no gasta un descuento al abrir la pantalla, ni vale para Cadena', () => {
  const ruta = readFileSync(new URL('../../app/api/billing/checkout/route.ts', import.meta.url), 'utf8');
  const pos = (t: string) => { const i = ruta.indexOf(t); assert.ok(i >= 0, `falta «${t}»`); return i; };
  const sale = pos('if (incrustado && recompensa) return NextResponse.json({ alojado: true });');
  assert.ok(sale < pos('async function checkoutPrevio('), 'antes de tocar Stripe');
  assert.ok(sale < pos('canjearRecompensa(admin, recompensa)'));
  assert.ok(pos("if (incrustado && plan === 'CADENA') {") < pos("if (plan === 'CADENA') {\n      let cadenaId"));
  assert.ok(pos("if (sesion.rol !== 'PROPIETARIO') {") < sale, 'el secreto del pago solo llega a la propietaria');
  assert.ok(ruta.includes('-dentro-${caducadas[0] ?? \'\'}'), 'la clave de idempotencia distingue el pago incrustado');
  assert.ok(ruta.includes("payment_method_types: ['card' as const]"), 'dentro de la pantalla, solo tarjeta (con Apple Pay y Google Pay)');
});
