import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantAutorizado, cuentaFirmante } from './webhook-tenant.ts';

// El bug era una condición que cortocircuitaba cuando el estudio VÍCTIMA no
// tenía Stripe conectado — 7 de los 9 estudios de producción. Estos casos son
// la tabla de verdad que no se puede volver a torcer.

test('la cuenta que firma y la metadata coinciden: autorizado', () => {
  assert.equal(tenantAutorizado('studio-a', 'studio-a'), true);
});

test('⚠️ el caso del bug: la cuenta dice A y la metadata dice B', () => {
  // Estudio A crea el checkout en SU cuenta con el recibo de B y paga a su
  // propia cuenta. Antes esto marcaba el recibo de B COBRADO.
  assert.equal(tenantAutorizado('studio-a', 'studio-b'), false);
});

test('⚠️ el caso del bug, versión que se colaba: víctima SIN Stripe conectado', () => {
  // `studioDeCuenta` null = la cuenta que firma no resuelve a ningún estudio, o
  // el estudio de la metadata no tiene cuenta. La condición vieja
  // (`&& studioRow?.stripe_account_id && …`) se saltaba entera justo aquí.
  assert.equal(tenantAutorizado(null, 'studio-b'), false, 'sin cuenta reconocida NO se autoriza');
});

test('sin cuenta en el evento no se autoriza nada', () => {
  // Un evento de pago sin `event.account` no puede venir de un direct charge:
  // el checkout se crea SIEMPRE con `{ stripeAccount }`.
  assert.equal(tenantAutorizado(null, null), false);
  assert.equal(tenantAutorizado(null, undefined), false);
});

test('cuenta reconocida y metadata ausente: se autoriza al estudio de la cuenta', () => {
  // La cuenta es la autoridad; la metadata solo confirma. Si no viene, no hay
  // nada que contradecir.
  assert.equal(tenantAutorizado('studio-a', null), true);
  assert.equal(tenantAutorizado('studio-a', undefined), true);
  assert.equal(tenantAutorizado('studio-a', ''), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// `cuentaFirmante` — la otra mitad del cobro perdido del 8-ago-2026.
//
// El estudio que cobró tiene como `stripe_account_id` la PROPIA cuenta de la
// plataforma. Stripe trata ese cargo como "de tu cuenta" y entrega el evento
// sin `account`, así que no resolvía ningún estudio y `tenantAutorizado` lo
// rechazaba. El comentario del handler afirmaba que `event.account` "siempre
// viene informado": no era cierto.
// ─────────────────────────────────────────────────────────────────────────────

test('un direct charge sobre una cuenta conectada manda su propia cuenta', () => {
  assert.equal(cuentaFirmante('acct_conectada', 'acct_plataforma'), 'acct_conectada');
});

test('⚠️ el caso del bug: evento SIN cuenta = cargo en la cuenta de la plataforma', () => {
  assert.equal(cuentaFirmante(undefined, 'acct_plataforma'), 'acct_plataforma');
  assert.equal(cuentaFirmante(null, 'acct_plataforma'), 'acct_plataforma');
});

test('sin cuenta en el evento y sin poder averiguar la de la plataforma: nada', () => {
  // Si la llamada a Stripe falla, se prefiere no resolver tenant (403) antes
  // que adivinarlo: el lado seguro.
  assert.equal(cuentaFirmante(undefined, null), null);
});

test('la cuenta de la plataforma NUNCA pisa la del evento', () => {
  // Que exista este respaldo no puede convertir el cargo de un estudio en el de
  // otro: si Stripe informa la cuenta, manda ella y solo ella.
  assert.equal(cuentaFirmante('acct_estudio_a', 'acct_plataforma'), 'acct_estudio_a');
});

test('la cuenta de plataforma resuelta sigue pasando por tenantAutorizado', () => {
  // El respaldo resuelve QUÉ cuenta, no salta la autorización: si la metadata
  // nombra a otro estudio, se sigue rechazando.
  const studioDeLaPlataforma = 'studio-1';
  assert.equal(tenantAutorizado(studioDeLaPlataforma, 'studio-1'), true);
  assert.equal(tenantAutorizado(studioDeLaPlataforma, 'studio-otro'), false);
});
