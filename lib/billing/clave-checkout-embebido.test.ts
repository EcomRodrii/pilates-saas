import test from 'node:test';
import assert from 'node:assert/strict';
import { claveCheckoutEmbebido } from './clave-checkout-embebido.ts';

// Estos tests fijan los dos fallos OPUESTOS que tenía la clave anterior
// (`…-${socioId ?? 'guest'}-${ventanaMinuto()}`), encontrados en la auditoría
// del 19-ago-2026. Es la tabla de verdad de "¿son el mismo intento de pago?".

const BASE = {
  studioId: 'studio-1',
  planId: 'plan-puntual',
  socioId: null,
  socioEmail: 'maria@example.com',
  sesionId: 'ses-lunes-10h',
};

test('⚠️ el caso del doble cobro: dos pestañas a caballo del minuto', () => {
  // Este era EL bug. Dos pestañas del mismo intento separadas por 90 s daban
  // claves distintas → dos PaymentIntents cobrables de la misma clase.
  const t0 = Date.parse('2026-08-19T10:00:59.000Z');
  const t1 = Date.parse('2026-08-19T10:02:29.000Z');
  assert.equal(
    claveCheckoutEmbebido(BASE, t0),
    claveCheckoutEmbebido(BASE, t1),
    'pagar la misma clase con el mismo plan es SIEMPRE el mismo intento, pase el tiempo que pase',
  );
});

test('⚠️ el caso de la colisión: dos invitadas distintas en el mismo minuto', () => {
  // La clave era literalmente `…-guest-<minuto>` para todas: Stripe rechazaba
  // la segunda por parámetros distintos y esa persona no podía pagar.
  const ahora = Date.parse('2026-08-19T10:00:00.000Z');
  const maria = claveCheckoutEmbebido({ ...BASE, socioEmail: 'maria@example.com' }, ahora);
  const ana = claveCheckoutEmbebido({ ...BASE, socioEmail: 'ana@example.com' }, ahora);
  assert.notEqual(maria, ana, 'dos personas distintas nunca comparten clave');
});

test('la misma socia comprando el mismo plan para DOS clases distintas', () => {
  const ahora = Date.parse('2026-08-19T10:00:00.000Z');
  const lunes = claveCheckoutEmbebido({ ...BASE, sesionId: 'ses-lunes-10h' }, ahora);
  const martes = claveCheckoutEmbebido({ ...BASE, sesionId: 'ses-martes-19h' }, ahora);
  assert.notEqual(lunes, martes, 'son dos compras legítimas distintas, no un duplicado');
});

test('el email nunca viaja en claro dentro de la clave', () => {
  // La clave acaba en los logs de Stripe; un email es un dato personal.
  const clave = claveCheckoutEmbebido(BASE, Date.now());
  assert.ok(!clave.includes('maria@example.com'), 'el email va hasheado');
  assert.ok(!clave.includes('maria'), 'ni siquiera la parte local');
});

test('el email se normaliza: mayúsculas y espacios son la misma persona', () => {
  const ahora = Date.parse('2026-08-19T10:00:00.000Z');
  assert.equal(
    claveCheckoutEmbebido({ ...BASE, socioEmail: '  Maria@Example.COM ' }, ahora),
    claveCheckoutEmbebido({ ...BASE, socioEmail: 'maria@example.com' }, ahora),
  );
});

test('socia con sesión: manda el socioId, no el email', () => {
  const ahora = Date.parse('2026-08-19T10:00:00.000Z');
  const conId = claveCheckoutEmbebido({ ...BASE, socioId: 'socio-7', socioEmail: 'otra@example.com' }, ahora);
  assert.ok(conId.includes('socio-7'));
});

test('dos estudios distintos nunca comparten clave', () => {
  const ahora = Date.parse('2026-08-19T10:00:00.000Z');
  assert.notEqual(
    claveCheckoutEmbebido({ ...BASE, studioId: 'studio-1' }, ahora),
    claveCheckoutEmbebido({ ...BASE, studioId: 'studio-2' }, ahora),
  );
});

test('compra suelta de bono (sin clase): conserva la ventana de un minuto', () => {
  // Sin `sesionId` repetir la compra SÍ puede ser legítimo (comprar dos bonos),
  // así que aquí la ventana se mantiene a propósito.
  const sinClase = { ...BASE, sesionId: null };
  const t0 = Date.parse('2026-08-19T10:00:10.000Z');
  const mismoMinuto = Date.parse('2026-08-19T10:00:50.000Z');
  const otroMinuto = Date.parse('2026-08-19T10:01:10.000Z');
  assert.equal(claveCheckoutEmbebido(sinClase, t0), claveCheckoutEmbebido(sinClase, mismoMinuto));
  assert.notEqual(claveCheckoutEmbebido(sinClase, t0), claveCheckoutEmbebido(sinClase, otroMinuto));
});

test('invitada sin email y sin clase: sigue habiendo clave, no revienta', () => {
  const clave = claveCheckoutEmbebido(
    { studioId: 's1', planId: 'p1', socioId: null, socioEmail: null, sesionId: null },
    Date.parse('2026-08-19T10:00:00.000Z'),
  );
  assert.ok(clave.startsWith('checkout-embebido-s1-p1-guest-'));
});
