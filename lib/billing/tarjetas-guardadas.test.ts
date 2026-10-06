import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  componentesSesionDeTarjetas, debeCrearSesionDeTarjetas, idDeTarjetaValido, puedeQuitarseDesdeLaApp, tarjetaEsSuya, tarjetasVisibles,
} from './tarjetas-guardadas.ts';

test('⚠️ quitar desde la app: solo una tarjeta «always»; nunca el SEPA de sus domiciliaciones ni una no aceptada', () => {
  assert.equal(puedeQuitarseDesdeLaApp({ id: 'pm_a', type: 'card', allow_redisplay: 'always' }, null), true);
  assert.equal(puedeQuitarseDesdeLaApp({ id: 'pm_s', type: 'sepa_debit', allow_redisplay: 'always' }, 'pm_s'), false);
  assert.equal(puedeQuitarseDesdeLaApp({ id: 'pm_s', type: 'card', allow_redisplay: 'always' }, 'pm_s'), false);
  assert.equal(puedeQuitarseDesdeLaApp({ id: 'pm_l', type: 'card', allow_redisplay: 'limited' }, null), false);
});
import { comprobarParDeClaves } from './modo-stripe.ts';
import { usoFuturoCheckoutHospedado } from './uso-futuro-tarjeta.ts';
import { metodoReutilizableDe } from './metodo-reutilizable.ts';

// P16 (6-oct-2026): tarjeta guardada SOLO con la casilla «Guárdala para la próxima», nunca por defecto.

const APP = 'https://app.tentare.example';

test('la sesión de tarjetas: solo socia del token, con Customer, y desde la app (nunca la web de un estudio)', () => {
  const base = { socioPorToken: true, customerId: 'cus_1', origin: null as string | null, appUrl: APP };
  assert.equal(debeCrearSesionDeTarjetas(base), true, 'sin Origin (misma navegación)');
  assert.equal(debeCrearSesionDeTarjetas({ ...base, origin: APP }), true, 'Origin de la app');
  assert.equal(debeCrearSesionDeTarjetas({ ...base, origin: 'https://estudio-de-pilates.example' }), false, 'web de un estudio (widget)');
  assert.equal(debeCrearSesionDeTarjetas({ ...base, socioPorToken: false }), false, 'invitada');
  assert.equal(debeCrearSesionDeTarjetas({ ...base, customerId: null }), false, 'sin Customer');
  assert.equal(debeCrearSesionDeTarjetas({ ...base, origin: APP, appUrl: undefined }), false, 'sin saber cuál es la app, con Origin no');
});

test('permisos: la cuota no ofrece la casilla; lo demás, casilla con uso on_session; solo se enseñan las «always», sin quitar desde el pago', () => {
  const cuota = componentesSesionDeTarjetas('off_session').payment_element.features;
  assert.equal(cuota.payment_method_save, 'disabled');
  assert.ok(!('payment_method_save_usage' in cuota));
  const bono = componentesSesionDeTarjetas(undefined).payment_element.features;
  assert.equal(bono.payment_method_save, 'enabled');
  assert.equal((bono as { payment_method_save_usage?: string }).payment_method_save_usage, 'on_session');
  assert.deepEqual(bono.payment_method_allow_redisplay_filters, ['always']);
  assert.equal(bono.payment_method_redisplay_limit, 3);
  assert.equal(bono.payment_method_remove, 'disabled');
});

test('⚠️ una tarjeta guardada con la casilla (on_session) NO entra en el hueco de cobros automáticos', () => {
  assert.equal(metodoReutilizableDe({
    payment_method: { id: 'pm_1', type: 'card' }, setup_future_usage: 'on_session', payment_method_types: ['card'],
  }), null);
});

test('la lista: las que aceptó guardar y la de cobros; ninguna más', () => {
  const pm = (id: string, allow: string, o: Record<string, unknown> = {}) => ({
    id, type: 'card', allow_redisplay: allow, card: { brand: 'visa', last4: '4242', exp_month: 9, exp_year: 2027 }, ...o,
  });
  const l = tarjetasVisibles([pm('pm_a', 'always'), pm('pm_b', 'limited'), pm('pm_c', 'unspecified'), pm('pm_d', 'always', { type: 'sepa_debit' })], 'pm_c');
  assert.deepEqual(l.map((t) => [t.id, t.paraCobros]), [['pm_a', false], ['pm_c', true]]);
  assert.equal(l[0].caducidad, '09/27');
});

test('quitar: solo un id con forma de Stripe, y solo si es de SU Customer', () => {
  assert.equal(idDeTarjetaValido('pm_1AbC'), true);
  for (const x of ['pm_', 'pm_1;drop', 'card_1', '', null, 3]) assert.equal(idDeTarjetaValido(x), false, String(x));
  assert.equal(tarjetaEsSuya('cus_1', 'cus_1'), true);
  assert.equal(tarjetaEsSuya({ id: 'cus_1' }, 'cus_1'), true);
  assert.equal(tarjetaEsSuya('cus_2', 'cus_1'), false, 'la de otra socia: 403');
  assert.equal(tarjetaEsSuya(null, 'cus_1'), false);
  assert.equal(tarjetaEsSuya('cus_1', null), false);
});

test('el par de claves: publicable y secreta del mismo modo, o no se monta ningún pago en el navegador', () => {
  const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;
  const casos: [string, string, boolean][] = [
    ['pk_live_x', 'sk_live_x', true], ['pk_test_x', 'sk_test_x', true],
    ['pk_live_x', 'sk_test_x', false], ['pk_test_x', 'sk_live_x', false],
    ['pk_test_x', 'rk_live_x', false], ['pk_live_x', 'rk_live_x', true],
  ];
  for (const [pk, sk, ok] of casos) {
    assert.equal(comprobarParDeClaves(env({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pk, STRIPE_SECRET_KEY: sk })).ok, ok, `${pk} + ${sk}`);
  }
  assert.equal(comprobarParDeClaves(env({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_x', STRIPE_SECRET_KEY: 'sk_test_XXXX' })).ok, true, 'sin configurar: lo cortan otros');
});

test('Checkout hospedado: guarda la tarjeta solo para la cuota (y una renovación de tipo desconocido, con aviso)', () => {
  assert.deepEqual(usoFuturoCheckoutHospedado({ tipoPlan: 'MENSUAL', esReciboDeRenovacion: false }), { usoFuturo: 'off_session', avisar: false });
  for (const tipoPlan of ['BONO', 'PUNTUAL', 'SIN_PLAN']) {
    assert.deepEqual(usoFuturoCheckoutHospedado({ tipoPlan, esReciboDeRenovacion: true }), { usoFuturo: undefined, avisar: false }, tipoPlan);
  }
  assert.deepEqual(usoFuturoCheckoutHospedado({ tipoPlan: null, esReciboDeRenovacion: true }), { usoFuturo: 'off_session', avisar: true });
  assert.deepEqual(usoFuturoCheckoutHospedado({ tipoPlan: null, esReciboDeRenovacion: false }), { usoFuturo: undefined, avisar: false }, 'penalización, cita o recibo suelto');
  // ⚠️ La lectura del tipo falló en un recibo con suscripción: puede ser una cuota, se guarda (con aviso).
  assert.deepEqual(usoFuturoCheckoutHospedado({ tipoPlan: null, esReciboDeRenovacion: false, tieneSuscripcion: true }), { usoFuturo: 'off_session', avisar: true });
  assert.deepEqual(usoFuturoCheckoutHospedado({ tipoPlan: 'BONO', esReciboDeRenovacion: false, tieneSuscripcion: true }), { usoFuturo: undefined, avisar: false });
});

test('la ruta de tarjetas: socia del token, y quitar una guardada mira que sea SUYA antes de soltarla en Stripe', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const f = readFileSync(join(import.meta.dirname, '..', '..', 'app/api/public/tarjeta/route.ts'), 'utf8');
  const i = (s: string) => {
    const n = f.indexOf(s);
    assert.ok(n >= 0, `falta ${s}`);
    return n;
  };
  assert.ok(i('tarjetaEsSuya(pm.customer') < i('stripe.paymentMethods.detach(pmPedido'));
  assert.ok(i('idDeTarjetaValido(body.paymentMethodId)') < i('verificarUsuarioSupabase(req);\n  if (!user) return NextResponse.json({ error: \'No autorizado\' }, { status: 401 });\n  const socioId = await socioAutenticado(user.userId, body.studioId)'));
  assert.doesNotMatch(f, /body\.socioId/);
});
