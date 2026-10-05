import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { metadataCompraEmbebida, parametrosPaymentIntentEmbebido, type DatosCompraEmbebida } from './pago-embebido-parametros.ts';

// Stripe devuelve el MISMO PaymentIntent a dos peticiones con la misma
// Idempotency-Key solo si los parámetros son idénticos. Con clase concreta la
// clave no lleva tiempo, así que un parámetro que dependa del reloj convierte el
// segundo intento del mismo pago en `idempotency_error` (el fallo del sello de
// condiciones, hasta el 5-oct-2026). Que dos claves coincidan no basta: lo que
// Stripe compara son los PARÁMETROS, y eso es lo que se fija aquí.

const datos = (extra: Partial<DatosCompraEmbebida> = {}): DatosCompraEmbebida => ({
  studioId: 'studio-1', planId: 'plan-suelta', planNombre: 'Clase suelta',
  terminosHash: 'a'.repeat(64), cupoMatriculaReservado: false, plazaEtapaId: null,
  socioId: null, socioEmail: 'alguien@example.com', socioNombre: 'Alguien', socioTelefono: null,
  origenLead: null, sesionId: 'ses-1', widgetSesion: null, spotId: null, codigoDescuentoId: null,
  matriculaCentimos: 0, genero: null, comoConociste: null, codigoPostal: null, fechaNacimiento: null,
  amountCentimos: 1800, usoFuturo: undefined, customerId: 'cus_1', fee: undefined,
  ...extra,
});

test('los parámetros del cobro no dependen del reloj: construidos 2 s y 25 h después, son IGUALES', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T10:00:00.000Z') });
  const primero = parametrosPaymentIntentEmbebido(datos());
  t.mock.timers.tick(2_000);
  const segundo = parametrosPaymentIntentEmbebido(datos());
  t.mock.timers.tick(25 * 3600_000);
  const tercero = parametrosPaymentIntentEmbebido(datos());
  assert.deepEqual(segundo, primero, 'el segundo intento del mismo pago recibiría idempotency_error');
  assert.deepEqual(tercero, primero);
});

test('la fecha de aceptar las condiciones ya no viaja en el cobro (es pi.created)', () => {
  const md = metadataCompraEmbebida(datos());
  assert.equal(md.terminosHash, 'a'.repeat(64));
  assert.equal('terminosAceptadosEn' in md, false);
  // Ningún valor de la metadata tiene forma de fecha.
  for (const [k, v] of Object.entries(md)) assert.doesNotMatch(v, /^\d{4}-\d{2}-\d{2}T/, `${k} parece un instante`);
});

test('sin sello, la compra sigue sin huella (best-effort)', () => {
  assert.equal('terminosHash' in metadataCompraEmbebida(datos({ terminosHash: null })), false);
});

test('la metadata es la de siempre: lo que el webhook lee para entregar y reservar', () => {
  const md = metadataCompraEmbebida(datos({
    socioId: 'soc-1', cupoMatriculaReservado: true, plazaEtapaId: 'plaza-1', spotId: 'spot-3',
    codigoDescuentoId: 'cod-1', matriculaCentimos: 2500, origenLead: 'lead-1', widgetSesion: 'ws-1',
    socioTelefono: '600000000', genero: 'mujer', comoConociste: 'instagram', codigoPostal: '28001', fechaNacimiento: '1990-01-01',
  }));
  assert.deepEqual(md, {
    studioId: 'studio-1', planId: 'plan-suelta', origen: 'plan_web_embebido', terminosHash: 'a'.repeat(64),
    cupoMatriculaReservado: '1', plazaEtapaId: 'plaza-1', socioId: 'soc-1', origenLead: 'lead-1',
    socioEmail: 'alguien@example.com', socioNombre: 'Alguien', socioTelefono: '600000000', sesionId: 'ses-1',
    widgetSesion: 'ws-1', spotId: 'spot-3', codigoDescuentoId: 'cod-1', matriculaCentimos: '2500',
    genero: 'mujer', comoConociste: 'instagram', codigoPostal: '28001', fechaNacimiento: '1990-01-01',
  });
  // El sitio solo con clase: sin clase no hay reserva a la que dárselo.
  assert.equal('spotId' in metadataCompraEmbebida(datos({ sesionId: null, spotId: 'spot-3' })), false);
  // Stripe no admite valores vacíos.
  assert.equal('matriculaCentimos' in metadataCompraEmbebida(datos({ matriculaCentimos: 0 })), false);
});

test('parámetros: cargo, cliente, uso futuro y comisión, como antes', () => {
  const p = parametrosPaymentIntentEmbebido(datos({ usoFuturo: 'off_session', fee: 50 }));
  assert.equal(p.amount, 1800);
  assert.equal(p.currency, 'eur');
  assert.deepEqual(p.automatic_payment_methods, { enabled: true, allow_redirects: 'never' });
  assert.equal(p.setup_future_usage, 'off_session');
  assert.equal(p.customer, 'cus_1');
  assert.equal(p.application_fee_amount, 50);
  assert.equal(p.receipt_email, 'alguien@example.com');
  assert.equal(p.description, 'Clase suelta');
  const sin = parametrosPaymentIntentEmbebido(datos({ customerId: null }));
  assert.equal('customer' in sin, false);
  assert.equal('setup_future_usage' in sin, false);
  assert.equal('application_fee_amount' in sin, false);
});

// ── Contrato con la ruta (alias `@/` y Stripe: `node --test` no la carga) ──

const raiz = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('checkout-embebido crea el cobro con los parámetros de este módulo, sin nada del reloj por en medio', () => {
  const s = sinComentarios(leer('app/api/public/checkout-embebido/route.ts'));
  assert.match(s, /await stripe\.paymentIntents\.create\(parametros, \{/);
  const desde = s.indexOf('const parametros = parametrosPaymentIntentEmbebido({');
  assert.ok(desde > 0);
  const bloque = s.slice(desde, s.indexOf('});', desde));
  assert.doesNotMatch(bloque, /new Date\(|Date\.now\(|randomUUID|Math\.random/, 'un parámetro del reloj o del azar rompe la idempotencia');
  assert.doesNotMatch(s, /terminosAceptadosEn|aceptadoEn/);
});

test('ninguna puerta de pago vuelve a meter la fecha de aceptación en la metadata', () => {
  for (const ruta of ['app/api/public/checkout-embebido/route.ts', 'app/api/stripe/checkout/route.ts']) {
    assert.doesNotMatch(sinComentarios(leer(ruta)), /metadata\.terminosAceptadosEn|aceptadoEn/, ruta);
  }
  // El sello en sí ya no tiene reloj.
  const sello = sinComentarios(leer('lib/legal-sellado.ts'));
  assert.doesNotMatch(sello, /aceptadoEn|new Date\(|Date\.now\(/);
});
