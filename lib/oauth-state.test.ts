import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  borrarCookieOAuth, crearCookieOAuth, firmarEstadoOAuth, nombreCookieOAuth,
  opcionesCookieOAuth, RUTA_CALLBACK_OAUTH, verificarEstadoOAuth,
} from './oauth-state.ts';

process.env.OAUTH_STATE_SECRET = 'test-secret-123';
const NOW = 1_700_000_000_000;

function decodificarPayload(state: string): string {
  return Buffer.from(state.slice(0, state.indexOf('.')), 'base64url').toString();
}

test('round-trip: con la cookie del mismo flujo devuelve el studioId', () => {
  const cookie = crearCookieOAuth();
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW, cookie);
  assert.deepEqual(verificarEstadoOAuth(s, 'stripe', NOW + 1000, cookie), { studioId: 'studio-A' });
});

test('H-1: sin cookie (enlace abierto en OTRO navegador) → rechazado', () => {
  const cookie = crearCookieOAuth();
  const s = firmarEstadoOAuth('studio-atacante', 'gmail', NOW, cookie);
  assert.equal(verificarEstadoOAuth(s, 'gmail', NOW + 1000, undefined), null);
  assert.equal(verificarEstadoOAuth(s, 'gmail', NOW + 1000, null), null);
  assert.equal(verificarEstadoOAuth(s, 'gmail', NOW + 1000, ''), null);
});

test('H-1: cookie de OTRO flujo (la víctima tiene la suya propia) → rechazado', () => {
  const cookieAtacante = crearCookieOAuth();
  const cookieVictima = crearCookieOAuth();
  const s = firmarEstadoOAuth('studio-atacante', 'zoom', NOW, cookieAtacante);
  assert.equal(verificarEstadoOAuth(s, 'zoom', NOW + 1000, cookieVictima), null);
});

test('rechaza firma manipulada', () => {
  const cookie = crearCookieOAuth();
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW, cookie);
  const ult = s[s.length - 1];
  const tampered = s.slice(0, -1) + (ult === 'A' ? 'B' : 'A');
  assert.equal(verificarEstadoOAuth(tampered, 'stripe', NOW + 1000, cookie), null);
});

test('ATAQUE C-8: payload con otro studioId + firma original → rechazado', () => {
  const cookie = crearCookieOAuth();
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW, cookie);
  const sig = s.slice(s.indexOf('.') + 1);
  const original = JSON.parse(decodificarPayload(s)) as Record<string, unknown>;
  const fakePayload = Buffer.from(
    JSON.stringify({ ...original, studioId: 'studio-VICTIMA' }),
  ).toString('base64url');
  assert.equal(verificarEstadoOAuth(`${fakePayload}.${sig}`, 'stripe', NOW + 1000, cookie), null);
});

test('rechaza proveedor cruzado (state de stripe usado en el callback de google)', () => {
  const cookie = crearCookieOAuth();
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW, cookie);
  assert.equal(verificarEstadoOAuth(s, 'google', NOW + 1000, cookie), null);
});

test('rechaza estado caducado (>10 min)', () => {
  const cookie = crearCookieOAuth();
  const s = firmarEstadoOAuth('studio-A', 'stripe', NOW, cookie);
  assert.equal(verificarEstadoOAuth(s, 'stripe', NOW + 11 * 60 * 1000, cookie), null);
});

test('rechaza null / vacío / sin separador', () => {
  const cookie = crearCookieOAuth();
  assert.equal(verificarEstadoOAuth(null, 'stripe', NOW, cookie), null);
  assert.equal(verificarEstadoOAuth('', 'stripe', NOW, cookie), null);
  assert.equal(verificarEstadoOAuth('sinpunto', 'stripe', NOW, cookie), null);
});

test('no se puede firmar un state sin cookie', () => {
  assert.throws(() => firmarEstadoOAuth('studio-A', 'stripe', NOW, ''));
});

test('Klaviyo: el code_verifier sale de la cookie y NO viaja en el state', () => {
  const verifier = 'v'.repeat(60) + '_-AbC123';
  const cookie = crearCookieOAuth(verifier);
  const s = firmarEstadoOAuth('studio-A', 'klaviyo', NOW, cookie);

  const payload = decodificarPayload(s);
  const nonce = cookie.slice(0, cookie.indexOf('.'));
  assert.ok(!payload.includes(verifier), 'el payload lleva el code_verifier en claro');
  assert.ok(!payload.includes(nonce), 'el payload lleva el nonce en claro');
  assert.ok(!s.includes(verifier) && !s.includes(nonce));

  assert.deepEqual(
    verificarEstadoOAuth(s, 'klaviyo', NOW + 1000, cookie),
    { studioId: 'studio-A', codeVerifier: verifier },
  );
});

test('Klaviyo: cambiar el code_verifier de la cookie invalida el flujo', () => {
  const cookie = crearCookieOAuth('verifier-original');
  const s = firmarEstadoOAuth('studio-A', 'klaviyo', NOW, cookie);
  const nonce = cookie.slice(0, cookie.indexOf('.'));
  assert.equal(verificarEstadoOAuth(s, 'klaviyo', NOW + 1000, `${nonce}.otro-verifier`), null);
});

test('el nonce es aleatorio y de al menos 32 bytes', () => {
  const a = crearCookieOAuth();
  const b = crearCookieOAuth();
  assert.notEqual(a, b);
  assert.ok(Buffer.from(a, 'base64url').length >= 32);
  assert.ok(!decodificarPayload(firmarEstadoOAuth('s', 'gmail', NOW, a)).includes(a));
});

test('cookie: HttpOnly, SameSite=Lax, acotada al callback de su proveedor y con TTL del state', () => {
  for (const p of ['stripe', 'google', 'gmail', 'zoom', 'klaviyo'] as const) {
    const o = opcionesCookieOAuth(p, true);
    assert.deepEqual(o, { httpOnly: true, secure: true, sameSite: 'lax', path: RUTA_CALLBACK_OAUTH[p], maxAge: 600 });
  }
  assert.equal(RUTA_CALLBACK_OAUTH.stripe, '/api/stripe/connect/callback');
  assert.notEqual(nombreCookieOAuth('gmail'), nombreCookieOAuth('google'));
});

test('borrarCookieOAuth vacía la cookie con la MISMA ruta y Max-Age 0', () => {
  const llamadas: Array<[string, string, Record<string, unknown>]> = [];
  borrarCookieOAuth({ cookies: { set: (n, v, o) => { llamadas.push([n, v, { ...o }]); } } }, 'zoom');
  assert.equal(llamadas.length, 1);
  const [nombre, valor, opciones] = llamadas[0];
  assert.equal(nombre, nombreCookieOAuth('zoom'));
  assert.equal(valor, '');
  assert.equal(opciones.path, '/api/integrations/zoom/callback');
  assert.equal(opciones.maxAge, 0);
  assert.equal(opciones.httpOnly, true);
});
