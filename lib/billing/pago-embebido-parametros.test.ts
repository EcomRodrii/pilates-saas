import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_VALOR_METADATA, metadataCompraEmbebida, metadataEstableEmbebida, metadataVolatilEmbebida, parametrosClienteInvitada,
  parametrosPaymentIntentEmbebido, recortarMetadata, type DatosCompraEmbebida,
} from './pago-embebido-parametros.ts';

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
  assert.match(s, /const parametros = parametrosPaymentIntentEmbebido\(datosCompra\);/);
  assert.match(s, /stripe\.paymentIntents\.create\(parametros, \{ stripeAccount, idempotencyKey: clave \}\)/);
  const desde = s.indexOf('const datosCompra: DatosCompraEmbebida = {');
  assert.ok(desde > 0);
  const bloque = s.slice(desde, s.indexOf('};', desde));
  assert.doesNotMatch(bloque, /new Date\(|Date\.now\(|randomUUID|Math\.random/, 'un parámetro del reloj o del azar rompe la idempotencia');
  assert.doesNotMatch(s, /terminosAceptadosEn|aceptadoEn/);
});

// ─────────────────────────────────────────────────────────────────────────────
// El INTENTO, no el formulario (5-oct-2026): lo que la persona puede corregir sin
// ser otro intento no va en la creación del cobro, sino después (`update`).
// ─────────────────────────────────────────────────────────────────────────────

test('dos peticiones del mismo intento que solo cambian el formulario crean el cobro con los MISMOS parámetros', () => {
  const a = datos({
    socioNombre: 'Nombre Uno', socioTelefono: '600000001', spotId: 'spot-1', widgetSesion: 'ws-pestana-a',
    origenLead: 'lead-a', genero: 'mujer', comoConociste: 'instagram', codigoPostal: '28001', fechaNacimiento: '1990-01-01',
    plazaEtapaId: null,
  });
  const b = datos({
    socioNombre: 'Nombre Corregido', socioTelefono: '600000002', spotId: 'spot-7', widgetSesion: 'ws-pestana-b',
    origenLead: 'lead-b', genero: null, comoConociste: 'amiga', codigoPostal: '29005', fechaNacimiento: null,
    plazaEtapaId: 'plaza-de-una-etapa-que-acaba-de-empezar',
  });
  assert.deepEqual(parametrosPaymentIntentEmbebido(b), parametrosPaymentIntentEmbebido(a),
    'con la misma clave, Stripe exige parámetros idénticos: si no, `idempotency_error` y 24 h sin poder pagar');
  // Y lo del formulario sí viaja, pero en la otra mitad.
  assert.equal(metadataVolatilEmbebida(b).socioTelefono, '600000002');
  assert.equal(metadataVolatilEmbebida(b).spotId, 'spot-7');
  assert.equal(metadataVolatilEmbebida(b).plazaEtapaId, 'plaza-de-una-etapa-que-acaba-de-empezar');
});

test('lo que SÍ es otro intento o cambia el cargo no se esconde en la mitad volátil', () => {
  const v = metadataVolatilEmbebida(datos({ socioId: 'soc-1', codigoDescuentoId: 'cod-1', matriculaCentimos: 2500, cupoMatriculaReservado: true }));
  for (const k of ['studioId', 'planId', 'origen', 'terminosHash', 'socioId', 'socioEmail', 'sesionId', 'codigoDescuentoId', 'matriculaCentimos', 'cupoMatriculaReservado']) {
    assert.equal(k in v, false, `${k} decide el intento o el cargo: va en la creación`);
  }
  const e = metadataEstableEmbebida(datos({ socioId: 'soc-1', codigoDescuentoId: 'cod-1', matriculaCentimos: 2500, cupoMatriculaReservado: true }));
  assert.deepEqual(Object.keys(e).sort(), ['codigoDescuentoId', 'cupoMatriculaReservado', 'matriculaCentimos', 'origen', 'planId', 'sesionId', 'socioEmail', 'socioId', 'studioId', 'terminosHash']);
  // El importe sí distingue: otra matrícula es otro cobro.
  assert.notDeepEqual(parametrosPaymentIntentEmbebido(datos({ amountCentimos: 1800 })), parametrosPaymentIntentEmbebido(datos({ amountCentimos: 4800, matriculaCentimos: 3000 })));
});

test('el Customer de una invitada se crea con lo que identifica el intento; el nombre y el teléfono van después', () => {
  assert.deepEqual(parametrosClienteInvitada({ socioEmail: 'alguien@example.com', studioId: 'studio-1' }), {
    email: 'alguien@example.com', metadata: { socioEmail: 'alguien@example.com', studioId: 'studio-1' },
  });
});

test('la ruta escribe lo volátil DESPUÉS de crear y ANTES de devolver el client_secret', () => {
  const s = sinComentarios(leer('app/api/public/checkout-embebido/route.ts'));
  const crea = s.indexOf('= await crearCobro(clave);');
  const repetido = s.indexOf('queHacerConCobroRepetido(actual?.status, {', crea);
  const datosDespues = s.indexOf('await stripe.paymentIntents.update(paymentIntent.id, { metadata: volatil }, { stripeAccount });', repetido);
  const responde = s.indexOf('clientSecret: paymentIntent.client_secret', datosDespues);
  assert.ok(crea > 0 && repetido > crea && datosDespues > repetido && responde > datosDespues,
    'crear → mirar la repetición → escribir lo volátil → responder');
  // Del Customer de la invitada, lo mismo.
  assert.match(s, /stripe\.customers\.create\(\s*parametrosClienteInvitada\(/);
  assert.match(s, /await stripe\.customers\.update\(customer\.id, datosCliente, \{ stripeAccount \}\)/);
});

test('Modo A (Checkout hospedado): lo del formulario tampoco va al crear la sesión', () => {
  const s = sinComentarios(leer('app/api/stripe/checkout/route.ts'));
  for (const campo of ['origenLead', 'widgetSesion', 'spotId', 'socioTelefono', 'genero', 'comoConociste', 'codigoPostal', 'fechaNacimiento', 'plazaEtapaId']) {
    assert.doesNotMatch(s, new RegExp(`[^l]metadata\\.${campo} =`), `${campo} va en metadataVolatil`);
    assert.match(s, new RegExp(`metadataVolatil\\.${campo} =`), campo);
  }
  const crea = s.indexOf('= await crearSesion(claveSesion);');
  const update = s.indexOf('await stripe.checkout.sessions.update(session.id, { metadata: recortarMetadata(metadataVolatil) }', crea);
  const responde = s.lastIndexOf('NextResponse.json({ url: session.url })');
  assert.ok(crea > 0 && update > crea && responde > update);
  // La descripción de una compra de plan no lleva el nombre del formulario.
  assert.match(s, /description: body\.reciboId && body\.socioNombre \? `Tentare · \$\{body\.socioNombre\}` : 'Tentare'/);
});


// Revisión del 5-oct (#6): un valor de más de 500 caracteres hacía fallar el `update`
// DESPUÉS de crear el cobro (con la matrícula gratis ya gastada). Se recorta.
test('lo volátil nunca pasa de lo que Stripe admite por valor', () => {
  const largo = 'x'.repeat(MAX_VALOR_METADATA + 50);
  const m = metadataVolatilEmbebida(datos({ origenLead: largo, socioNombre: largo, codigoPostal: '28001' }));
  assert.equal(m.origenLead.length, MAX_VALOR_METADATA);
  assert.equal(m.socioNombre.length, MAX_VALOR_METADATA);
  assert.equal(m.codigoPostal, '28001');
  assert.deepEqual(recortarMetadata({ a: largo }), { a: largo.slice(0, MAX_VALOR_METADATA) });
});

// Revisión del 5-oct (#1): la clave normalizaba el email y los parámetros no.
test('el email se normaliza UNA vez en las dos rutas y es el mismo en la clave y en los parámetros', () => {
  for (const ruta of ['app/api/public/checkout-embebido/route.ts', 'app/api/stripe/checkout/route.ts']) {
    const s = sinComentarios(leer(ruta));
    assert.match(s, /const socioEmail = typeof body\.socioEmail === 'string' && body\.socioEmail\.trim\(\)\s*\? body\.socioEmail\.trim\(\)\.toLowerCase\(\)\s*: null;/, ruta);
    // Fuera de la validación y de la normalización, nadie vuelve a leer el email crudo.
    const resto = s.replace(/const socioEmail = typeof body\.socioEmail[\s\S]*?: null;/, '')
      .replace(/if \(body\.socioEmail != null && !EMAIL_RE\.test\(body\.socioEmail\.trim\(\)\)\)/, '');
    assert.doesNotMatch(resto, /body\.socioEmail/, ruta);
  }
});

test('ninguna puerta de pago vuelve a meter la fecha de aceptación en la metadata', () => {
  for (const ruta of ['app/api/public/checkout-embebido/route.ts', 'app/api/stripe/checkout/route.ts']) {
    assert.doesNotMatch(sinComentarios(leer(ruta)), /metadata\.terminosAceptadosEn|aceptadoEn/, ruta);
  }
  // El sello en sí ya no tiene reloj.
  const sello = sinComentarios(leer('lib/legal-sellado.ts'));
  assert.doesNotMatch(sello, /aceptadoEn|new Date\(|Date\.now\(/);
});
