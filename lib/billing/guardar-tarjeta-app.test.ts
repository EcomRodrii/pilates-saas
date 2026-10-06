import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  confirmacionTarjetaGuardada, debeSoltarTarjetaSustituida, filaTarjetaDeCobros, idDeSesionCheckoutValido,
  parametrosSesionGuardarTarjeta, type SesionDeTarjetaLeida,
} from './tarjetas-guardadas.ts';

// «Cambiar tarjeta» / «Añadir tarjeta» en la app de la alumna (6-oct-2026): un Checkout
// de Stripe INCRUSTADO en `mode: 'setup'`, y «Tarjeta guardada» solo cuando la FICHA
// tiene la tarjeta de esa sesión (la escribe el webhook).

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SESION: SesionDeTarjetaLeida = {
  mode: 'setup', status: 'complete',
  metadata: { purpose: 'tarjeta', socioId: 'socio-1', studioId: 'studio-1', origen: 'app' },
  setupIntent: { status: 'succeeded', paymentMethodId: 'pm_nueva' },
};
const YO = { socioId: 'socio-1', studioId: 'studio-1' };

test('«guardada» SOLO cuando la ficha apunta a la tarjeta de ESTA sesión', () => {
  assert.equal(confirmacionTarjetaGuardada(SESION, { ...YO, metodoDeLaFicha: 'pm_nueva' }), 'guardada');
});

test('⚠️ Stripe la autorizó pero la ficha sigue con la vieja (el webhook no ha llegado): «confirmando», nunca «guardada»', () => {
  assert.equal(confirmacionTarjetaGuardada(SESION, { ...YO, metodoDeLaFicha: 'pm_vieja' }), 'confirmando');
  assert.equal(confirmacionTarjetaGuardada(SESION, { ...YO, metodoDeLaFicha: null }), 'confirmando');
});

test('una sesión sin completar (abierta, caducada, SetupIntent sin éxito) no se da por guardada', () => {
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, status: 'open' }, { ...YO, metodoDeLaFicha: 'pm_nueva' }), 'sin_completar');
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, status: 'expired' }, { ...YO, metodoDeLaFicha: null }), 'sin_completar');
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, setupIntent: { status: 'requires_payment_method', paymentMethodId: null } }, { ...YO, metodoDeLaFicha: null }), 'sin_completar');
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, setupIntent: null }, { ...YO, metodoDeLaFicha: null }), 'sin_completar');
});

test('⚠️ la sesión de OTRA alumna, de otro estudio, o que no es de guardar tarjeta: «ajena» (el servidor contesta 404)', () => {
  const ficha = { ...YO, metodoDeLaFicha: 'pm_nueva' };
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, metadata: { ...SESION.metadata, socioId: 'socio-2' } }, ficha), 'ajena');
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, metadata: { ...SESION.metadata, studioId: 'studio-2' } }, ficha), 'ajena');
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, metadata: { ...SESION.metadata, purpose: 'sepa_mandate' } }, ficha), 'ajena');
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, mode: 'payment' }, ficha), 'ajena');
  assert.equal(confirmacionTarjetaGuardada({ ...SESION, metadata: null }, ficha), 'ajena');
});

test('ids de sesión: solo la forma de Stripe llega a Stripe', () => {
  assert.equal(idDeSesionCheckoutValido('cs_test_a1B2c3'), true);
  assert.equal(idDeSesionCheckoutValido('cs_live_a1B2c3'), true);
  for (const malo of ['', 'cs_', 'pi_test_1', 'cs_test_../x', 'cs_test_a?b=1', null, 42, undefined]) {
    assert.equal(idDeSesionCheckoutValido(malo), false, String(malo));
  }
});

test('la sesión: setup, INCRUSTADA (no sale de la app), solo tarjeta, con la metadata que lee el webhook', () => {
  const p = parametrosSesionGuardarTarjeta({
    customer: 'cus_1', studioId: 'studio-1', socioId: 'socio-1', returnUrl: 'https://x/portal/a/perfil/pago?tarjeta=vuelta&session_id={CHECKOUT_SESSION_ID}', expiresAt: 1_900_000_000,
  });
  assert.equal(p.mode, 'setup');
  assert.equal(p.ui_mode, 'embedded_page');
  assert.equal(p.redirect_on_completion, 'if_required');
  assert.deepEqual(p.payment_method_types, ['card']);
  assert.equal(p.customer, 'cus_1');
  assert.equal(p.metadata.purpose, 'tarjeta', 'sin esto el webhook no la escribe en la ficha');
  assert.deepEqual(p.setup_intent_data.metadata, p.metadata);
  assert.ok(!('success_url' in p) && !('cancel_url' in p), 'una página alojada se abriría en Safari en la app de iOS');
  assert.match(p.return_url, /\{CHECKOUT_SESSION_ID\}/);
});

test('la ficha: método y sus datos en UN update; sin datos, a null (nunca los cuatro dígitos de la tarjeta vieja)', () => {
  assert.deepEqual(filaTarjetaDeCobros('pm_n', { expMes: 9, expAnio: 2030, marca: 'mastercard', ultimos4: '4444' }, 'cus_1'), {
    stripe_payment_method_id: 'pm_n', stripe_customer_id: 'cus_1',
    tarjeta_marca: 'mastercard', tarjeta_ultimos4: '4444', tarjeta_exp_mes: 9, tarjeta_exp_anio: 2030,
  });
  assert.deepEqual(filaTarjetaDeCobros('pm_n', null, null), {
    stripe_payment_method_id: 'pm_n', tarjeta_marca: null, tarjeta_ultimos4: null, tarjeta_exp_mes: null, tarjeta_exp_anio: null,
  });
});

test('⚠️ al cambiar, solo se suelta la tarjeta sustituida si era solo de cobros, suya, y no la de sus domiciliaciones', () => {
  const base = {
    sustituida: 'pm_vieja', nueva: 'pm_nueva', sepaDeLaFicha: null, customerDeLaFicha: 'cus_1',
    pmSustituido: { type: 'card', allow_redisplay: 'limited', customer: 'cus_1' },
  };
  assert.equal(debeSoltarTarjetaSustituida(base), true);
  assert.equal(debeSoltarTarjetaSustituida({ ...base, pmSustituido: { ...base.pmSustituido, type: 'link' } }), true, 'un Link de cobros también');
  assert.equal(debeSoltarTarjetaSustituida({ ...base, sustituida: null }), false, 'añadir no suelta nada');
  assert.equal(debeSoltarTarjetaSustituida({ ...base, sustituida: 'pm_nueva' }), false, 'la misma (webhook repetido)');
  assert.equal(debeSoltarTarjetaSustituida({ ...base, sepaDeLaFicha: 'pm_vieja' }), false);
  assert.equal(debeSoltarTarjetaSustituida({ ...base, pmSustituido: { ...base.pmSustituido, allow_redisplay: 'always' } }), false,
    'la guardó para pagar en la app: sigue en su lista');
  assert.equal(debeSoltarTarjetaSustituida({ ...base, pmSustituido: { ...base.pmSustituido, type: 'sepa_debit' } }), false);
  assert.equal(debeSoltarTarjetaSustituida({ ...base, pmSustituido: { ...base.pmSustituido, customer: 'cus_otro' } }), false);
  assert.equal(debeSoltarTarjetaSustituida({ ...base, pmSustituido: null }), false, 'sin poder leerla, no se toca');
});

// ── Dónde se usa (los ficheros que `node --test` no puede cargar) ───────────

test('la ruta: identidad del JWT, Stripe del estudio en servidor, guardias de modo y el webhook con compare-and-set', () => {
  const r = sinComentarios(leer('app/api/public/tarjeta/route.ts'));
  const post = r.slice(r.indexOf('export async function POST'), r.indexOf('async function confirmarTarjetaGuardada'));
  assert.match(post, /verificarUsuarioSupabase\(req\)/);
  assert.match(post, /socioAutenticado\(user\.userId, studioId\)/, 'la alumna sale de SU sesión, nunca del body');
  assert.equal(/body\.(socioId|customer|stripeAccount|paymentMethod)/.test(post), false, 'ni la alumna, ni el Customer ni la cuenta vienen del body');
  assert.match(post, /comprobarModoStripe\(\)/, 'una clave live fuera de producción no guarda tarjetas');
  assert.match(post, /comprobarParDeClaves\(\)/, 'el incrustado se monta con la publicable: las dos del mismo modo');
  assert.match(post, /parametrosSesionGuardarTarjeta\(/);
  assert.match(post, /\{ stripeAccount \}/, 'la sesión vive en la cuenta del estudio (cargo directo)');

  const get = r.slice(r.indexOf('export async function GET'), r.indexOf('export async function DELETE'));
  assert.match(get, /idDeSesionCheckoutValido\(/);
  assert.match(get, /confirmacionTarjetaGuardada\(/);

  const w = sinComentarios(leer('app/api/stripe/webhook/route.ts'));
  const rama = w.slice(w.indexOf("session.metadata?.purpose === 'tarjeta'"), w.indexOf("session.metadata?.purpose === 'sepa_mandate'"));
  assert.match(rama, /filaTarjetaDeCobros\(/, 'método y datos de la tarjeta en el mismo update');
  assert.match(rama, /\.eq\('stripe_payment_method_id', anterior\)/, 'compare-and-set: solo se suelta la que de verdad se sustituyó');
  assert.match(rama, /debeSoltarTarjetaSustituida\(/);
  const escritura = rama.indexOf('filaTarjetaDeCobros(');
  const suelta = rama.indexOf('paymentMethods.detach(');
  assert.ok(escritura > 0 && suelta > escritura, 'primero la ficha, después (y solo si se puede) soltar la vieja');
});
