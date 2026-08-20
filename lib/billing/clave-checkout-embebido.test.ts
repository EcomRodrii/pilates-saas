import test from 'node:test';
import assert from 'node:assert/strict';
import { claveCheckoutEmbebido, claveCheckoutPlanModoA } from './clave-checkout-embebido.ts';

// Estos tests fijan los dos fallos OPUESTOS que tenía la clave anterior
// (`…-${socioId ?? 'guest'}-${ventanaMinuto()}`), encontrados en la auditoría
// del 19-ago-2026. Es la tabla de verdad de "¿son el mismo intento de pago?".

const BASE = {
  studioId: 'studio-1',
  planId: 'plan-puntual',
  socioId: null,
  socioEmail: 'maria@example.com',
  sesionId: 'ses-lunes-10h',
  codigoDescuentoId: null,
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
    { studioId: 's1', planId: 'p1', socioId: null, socioEmail: null, sesionId: null, codigoDescuentoId: null },
    Date.parse('2026-08-19T10:00:00.000Z'),
  );
  assert.ok(clave.startsWith('checkout-embebido-s1-p1-guest-'));
});

// Regresión (diseño #canje-codigos-descuento-checkout): sin el código de
// descuento en la clave, un reintento con un código distinto reutilizaría el
// PaymentIntent del primer intento con el importe viejo.
test('⚠️ mismo intento con y sin código de descuento NO comparten clave', () => {
  const ahora = Date.parse('2026-08-19T10:00:00.000Z');
  const sinCodigo = claveCheckoutEmbebido({ ...BASE, codigoDescuentoId: null }, ahora);
  const conCodigo = claveCheckoutEmbebido({ ...BASE, codigoDescuentoId: 'c-verano10' }, ahora);
  assert.notEqual(sinCodigo, conCodigo, 'aplicar o quitar un código cambia el importe, así que es un intento distinto');
});

test('dos códigos de descuento distintos tampoco comparten clave', () => {
  const ahora = Date.parse('2026-08-19T10:00:00.000Z');
  const a = claveCheckoutEmbebido({ ...BASE, codigoDescuentoId: 'c-a' }, ahora);
  const b = claveCheckoutEmbebido({ ...BASE, codigoDescuentoId: 'c-b' }, ahora);
  assert.notEqual(a, b);
});

// ── D-3: la misma regla para la compra de plan del Modo A ───────────────────

const PLAN_A = {
  studioId: 'studio-1',
  planId: 'plan-puntual',
  socioId: null,
  socioEmail: 'maria@example.com',
  codigoDescuentoId: null,
  metodos: ['card'],
};

test('⚠️ el caso D-3: dos pestañas del mismo intento comparten clave', () => {
  const t0 = Date.parse('2026-08-20T10:00:10.000Z');
  const mismoMinuto = Date.parse('2026-08-20T10:00:50.000Z');
  assert.equal(
    claveCheckoutPlanModoA(PLAN_A, t0),
    claveCheckoutPlanModoA(PLAN_A, mismoMinuto),
    'dos pestañas en el mismo minuto son el mismo intento: una sola sesión pagable',
  );
});

test('⚠️ nunca comparte espacio de claves con el Modo B', () => {
  // El fallback de Bizum del widget llama al endpoint de Modo A DESPUÉS de un
  // intento embebido: la misma clave en dos llamadas distintas de la API sería
  // idempotency_error y esa persona no podría pagar.
  const ahora = Date.parse('2026-08-20T10:00:00.000Z');
  const modoA = claveCheckoutPlanModoA(PLAN_A, ahora);
  const modoB = claveCheckoutEmbebido({ ...BASE, sesionId: null }, ahora);
  assert.ok(modoA !== null && !modoB.startsWith('checkout-plan'), 'prefijos disjuntos');
  assert.ok(modoA.startsWith('checkout-plan-') && modoB.startsWith('checkout-embebido-'));
});

test('cambiar de método de pago es una sesión distinta, no un duplicado', () => {
  // Mismo criterio que la clave de recibos del propio endpoint: con la misma
  // clave y parámetros distintos, Stripe rechazaría el intento con Bizum.
  const ahora = Date.parse('2026-08-20T10:00:00.000Z');
  const tarjeta = claveCheckoutPlanModoA({ ...PLAN_A, metodos: ['card'] }, ahora);
  const conBizum = claveCheckoutPlanModoA({ ...PLAN_A, metodos: ['card', 'bizum'] }, ahora);
  assert.notEqual(tarjeta, conBizum);
});

test('el orden de los métodos no cambia la clave', () => {
  const ahora = Date.parse('2026-08-20T10:00:00.000Z');
  assert.equal(
    claveCheckoutPlanModoA({ ...PLAN_A, metodos: ['card', 'bizum'] }, ahora),
    claveCheckoutPlanModoA({ ...PLAN_A, metodos: ['bizum', 'card'] }, ahora),
  );
});

test('⚠️ sin identidad no hay clave: mejor el statu quo que bloquear una venta', () => {
  // El endpoint es semipúblico y el email no está garantizado. Un 'guest' a
  // secas colisionaría entre dos personas distintas comprando el mismo plan en
  // el mismo minuto — la que llega segunda no podría pagar.
  assert.equal(
    claveCheckoutPlanModoA({ ...PLAN_A, socioId: null, socioEmail: null }, Date.now()),
    null,
  );
});

test('el email tampoco viaja en claro en la clave de Modo A', () => {
  const clave = claveCheckoutPlanModoA(PLAN_A, Date.now());
  assert.ok(clave !== null && !clave.includes('maria'), 'el email va hasheado');
});

test('dos compradoras distintas del mismo plan nunca comparten clave (Modo A)', () => {
  const ahora = Date.parse('2026-08-20T10:00:00.000Z');
  assert.notEqual(
    claveCheckoutPlanModoA({ ...PLAN_A, socioEmail: 'maria@example.com' }, ahora),
    claveCheckoutPlanModoA({ ...PLAN_A, socioEmail: 'ana@example.com' }, ahora),
  );
});

test('quitar o cambiar el código de descuento es un intento distinto (Modo A)', () => {
  const ahora = Date.parse('2026-08-20T10:00:00.000Z');
  const sin = claveCheckoutPlanModoA({ ...PLAN_A, codigoDescuentoId: null }, ahora);
  const con = claveCheckoutPlanModoA({ ...PLAN_A, codigoDescuentoId: 'c-verano10' }, ahora);
  assert.notEqual(sin, con, 'el importe cambia, así que no puede reutilizarse la sesión del primer intento');
});

test('compra suelta: la ventana de un minuto se conserva (Modo A)', () => {
  // Comprar dos bonos seguidos ES legítimo — pasado el minuto, clave nueva.
  const t0 = Date.parse('2026-08-20T10:00:10.000Z');
  const otroMinuto = Date.parse('2026-08-20T10:01:10.000Z');
  assert.notEqual(claveCheckoutPlanModoA(PLAN_A, t0), claveCheckoutPlanModoA(PLAN_A, otroMinuto));
});
