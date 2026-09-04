import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modoDeClave, entornoDespliegue, comprobarModoStripe, esClavePublicable } from './modo-stripe.ts';

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

// ── Qué modo es cada clave ──────────────────────────────────────────────────

test('modoDeClave: distingue live, test y sin configurar', () => {
  assert.equal(modoDeClave('sk_live_51abc'), 'live');
  assert.equal(modoDeClave('sk_test_51abc'), 'test');
  assert.equal(modoDeClave('rk_live_51abc'), 'live');
  assert.equal(modoDeClave('rk_test_51abc'), 'test');
});

test('modoDeClave: el centinela `sk_test_XXXX` es SIN CONFIGURAR, no modo test', () => {
  // Es el placeholder que ya usan los endpoints para decir "no hay Stripe".
  // Confundirlo con una clave de test haría que un entorno sin configurar
  // pareciera listo para cobrar.
  assert.equal(modoDeClave('sk_test_XXXX'), 'sin-configurar');
  assert.equal(modoDeClave('sk_test_XXXXXXXX'), 'sin-configurar');
  assert.equal(modoDeClave(undefined), 'sin-configurar');
  assert.equal(modoDeClave(''), 'sin-configurar');
});

test('modoDeClave: una clave con forma desconocida NO se asume segura', () => {
  assert.equal(modoDeClave('pk_live_51abc'), 'sin-configurar');
  assert.equal(modoDeClave('vete-a-saber'), 'sin-configurar');
});

// ── Dónde estamos ───────────────────────────────────────────────────────────

test('entornoDespliegue: sale de VERCEL_ENV, y sin él es local', () => {
  assert.equal(entornoDespliegue(env({ VERCEL_ENV: 'production' })), 'produccion');
  assert.equal(entornoDespliegue(env({ VERCEL_ENV: 'preview' })), 'preview');
  assert.equal(entornoDespliegue(env({ VERCEL_ENV: 'development' })), 'local');
  assert.equal(entornoDespliegue(env({})), 'local');
});

// ── Las dos mezclas que hay que impedir ─────────────────────────────────────

test('clave LIVE fuera de producción → BLOQUEADO (movería dinero real desde una máquina)', () => {
  const local = comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_live_51abc' }));
  assert.equal(local.puedeCobrar, false);
  assert.match(local.motivo!, /dinero real/);

  const preview = comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_live_51abc', VERCEL_ENV: 'preview' }));
  assert.equal(preview.puedeCobrar, false);
});

test('clave TEST en producción → BLOQUEADO (los cobros parecerían entrar y no entraría nada)', () => {
  const r = comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_test_51abc', VERCEL_ENV: 'production' }));
  assert.equal(r.puedeCobrar, false);
  assert.match(r.motivo!, /no entraría un euro/);
});

// ── Las combinaciones buenas ────────────────────────────────────────────────

test('producción con clave live, y local/preview con clave test: adelante', () => {
  assert.equal(comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_live_1', VERCEL_ENV: 'production' })).puedeCobrar, true);
  assert.equal(comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_test_1' })).puedeCobrar, true);
  assert.equal(comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_test_1', VERCEL_ENV: 'preview' })).puedeCobrar, true);
});

test('sin configurar nunca bloquea: ese caso ya lo corta cada endpoint con su mensaje', () => {
  const r = comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_test_XXXX', VERCEL_ENV: 'production' }));
  assert.equal(r.puedeCobrar, true);
  assert.equal(r.modo, 'sin-configurar');
});

test('la escotilla deja pasar la mezcla, pero hay que ponerla a mano', () => {
  const sin = comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_live_1', VERCEL_ENV: 'preview' }));
  assert.equal(sin.puedeCobrar, false);
  const con = comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_live_1', VERCEL_ENV: 'preview', STRIPE_PERMITIR_MODO_CRUZADO: '1' }));
  assert.equal(con.puedeCobrar, true);
  // Cualquier otro valor NO abre la puerta: nada de "true"/"si"/"0".
  for (const v of ['true', 'si', '0', '']) {
    assert.equal(comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_live_1', VERCEL_ENV: 'preview', STRIPE_PERMITIR_MODO_CRUZADO: v })).puedeCobrar, false);
  }
});

test('el veredicto siempre dice modo y entorno, para que el error sea diagnosticable', () => {
  const r = comprobarModoStripe(env({ STRIPE_SECRET_KEY: 'sk_live_1' }));
  assert.equal(r.modo, 'live');
  assert.equal(r.entorno, 'local');
});

// ── Qué clave puede llegar al navegador ─────────────────────────────────────
//
// El bundle del cliente lo descarga cualquier visitante, así que aquí no se
// prueba una preferencia de estilo: se prueba que una credencial secreta no
// pueda colarse en él por una variable de entorno mal puesta.

test('esClavePublicable: acepta las que SÍ pueden ir al navegador', () => {
  assert.equal(esClavePublicable('pk_live_51abc'), true);
  assert.equal(esClavePublicable('pk_test_51abc'), true);
  // Una `rk_` NO va aquí: es una clave secreta restringida, de servidor
  // (auditoría 22ª pasada, S-2). Se comprueba en el test de rechazo de abajo.
});

test('esClavePublicable: rechaza una clave SECRETA', () => {
  assert.equal(esClavePublicable('sk_live_51abc'), false);
  assert.equal(esClavePublicable('sk_test_51abc'), false);
  // Restringida = secreta con permisos recortados. Tampoco puede ir al
  // navegador, y `modoDeClave` ya la trata como clave de servidor.
  assert.equal(esClavePublicable('rk_live_51abc'), false);
  assert.equal(esClavePublicable('rk_test_51abc'), false);
});

test('esClavePublicable: rechaza vacío, nulo y forma desconocida', () => {
  assert.equal(esClavePublicable(''), false);
  assert.equal(esClavePublicable(undefined), false);
  assert.equal(esClavePublicable(null), false);
  assert.equal(esClavePublicable('51abc'), false);
});

test('esClavePublicable: no confunde el centinela de "sin configurar"', () => {
  // `sk_test_XXXX` significa "sin configurar" (ver cabecera de este módulo), y
  // sigue siendo secreta: al navegador no va.
  assert.equal(esClavePublicable('sk_test_XXXX'), false);
});
