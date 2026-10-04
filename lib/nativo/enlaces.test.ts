import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esUrlAbrible, esVueltaDeOAuth, resultadoDeVuelta, rutaDeAviso, rutaInternaDeEnlace } from './enlaces.ts';

test('rutaInternaDeEnlace: un Universal Link de Tentare da su ruta y su query', () => {
  assert.equal(rutaInternaDeEnlace('https://www.tentare.app/portal/mi-estudio/reservas?d=2'), '/portal/mi-estudio/reservas?d=2');
  assert.equal(rutaInternaDeEnlace('https://tentare.app/app'), '/app');
  assert.equal(rutaInternaDeEnlace('https://www.tentare.app'), '/');
  assert.equal(rutaInternaDeEnlace('https://WWW.TENTARE.APP/app'), '/app');
});

test('rutaInternaDeEnlace: el fragmento nunca pasa (ahí viajarían tokens de un flujo implícito)', () => {
  assert.equal(rutaInternaDeEnlace('https://www.tentare.app/app?x=1#access_token=abc'), '/app?x=1');
});

test('rutaInternaDeEnlace: otro host, aunque se le parezca, no es Tentare', () => {
  for (const url of [
    'https://evil.example/app',
    'https://tentare.app.evil.example/app',
    'https://evil-tentare.app/app',
    'https://sub.tentare.app/app',
    'https://www.tentare.app.example/app',
  ]) {
    assert.equal(rutaInternaDeEnlace(url), null, url);
  }
});

test('rutaInternaDeEnlace: solo https, sin puerto y sin credenciales en la URL', () => {
  assert.equal(rutaInternaDeEnlace('http://www.tentare.app/app'), null);
  assert.equal(rutaInternaDeEnlace('https://www.tentare.app:8443/app'), null);
  assert.equal(rutaInternaDeEnlace('https://usuario:clave@www.tentare.app/app'), null);
  assert.equal(rutaInternaDeEnlace('https://tentare.app@evil.example/app'), null);
  assert.equal(rutaInternaDeEnlace('javascript:alert(1)'), null);
  assert.equal(rutaInternaDeEnlace('data:text/html,hola'), null);
  assert.equal(rutaInternaDeEnlace('no es una url'), null);
  assert.equal(rutaInternaDeEnlace(''), null);
});

test('rutaInternaDeEnlace: `//otro-host` en la ruta no se convierte en una URL de otro sitio', () => {
  // `router.push('//evil.example/x')` navegaría FUERA de Tentare.
  assert.equal(rutaInternaDeEnlace('https://www.tentare.app//evil.example/x'), '/evil.example/x');
  assert.equal(rutaInternaDeEnlace('https://www.tentare.app/\\evil.example/x'), '/evil.example/x');
  const r = rutaInternaDeEnlace('https://www.tentare.app///evil.example');
  assert.ok(r && !r.startsWith('//'));
});

test('rutaInternaDeEnlace: el esquema propio de la app solo vale si es el SUYO', () => {
  const propios = ['app.tentare'];
  assert.equal(rutaInternaDeEnlace('app.tentare://auth/vuelta?code=abc', propios), '/auth/vuelta?code=abc');
  assert.equal(rutaInternaDeEnlace('APP.TENTARE://auth/vuelta?code=abc', propios), '/auth/vuelta?code=abc');
  assert.equal(rutaInternaDeEnlace('app.tentare:/auth/vuelta', propios), '/auth/vuelta');
  assert.equal(rutaInternaDeEnlace('app.tentare://', propios), '/');
  // La app de un estudio no acepta el esquema de la de Tentare, ni al revés.
  assert.equal(rutaInternaDeEnlace('app.tentare://auth/vuelta?code=abc', ['app.tentare.estudio']), null);
  // Sin esquemas declarados, solo https.
  assert.equal(rutaInternaDeEnlace('app.tentare://auth/vuelta?code=abc'), null);
  assert.equal(rutaInternaDeEnlace('app.tentare://auth:99/x', propios), null);
  assert.equal(rutaInternaDeEnlace('app.tentare://usuario@auth/x', propios), null);
});

test('rutaDeAviso: la `url` del aviso, relativa o absoluta, siempre dentro de Tentare', () => {
  assert.equal(rutaDeAviso({ url: '/portal/mi-estudio' }), '/portal/mi-estudio');
  assert.equal(rutaDeAviso({ url: 'https://www.tentare.app/portal/x?y=1' }), '/portal/x?y=1');
  assert.equal(rutaDeAviso({ ruta: '/app' }), '/app');
  assert.equal(rutaDeAviso({ url: 'https://evil.example/x' }), null);
  assert.equal(rutaDeAviso({ url: '//evil.example/x' }), null);
  assert.equal(rutaDeAviso({ url: 'javascript:alert(1)' }), null);
  assert.equal(rutaDeAviso({ url: 42 }), null);
  assert.equal(rutaDeAviso({}), null);
  assert.equal(rutaDeAviso(null), null);
  assert.equal(rutaDeAviso('texto'), null);
});

test('esVueltaDeOAuth: trae `code` o `error`, y respeta el prefijo si se pide', () => {
  assert.equal(esVueltaDeOAuth('/auth/vuelta?code=abc'), true);
  assert.equal(esVueltaDeOAuth('/auth/vuelta?error=access_denied'), true);
  assert.equal(esVueltaDeOAuth('/auth/vuelta'), false);
  assert.equal(esVueltaDeOAuth('/portal/x?codigo=1'), false);
  assert.equal(esVueltaDeOAuth('/auth/vuelta?code=abc', '/auth/'), true);
  assert.equal(esVueltaDeOAuth('/portal/x?code=abc', '/auth/'), false);
});

test('esUrlAbrible: solo http(s)', () => {
  assert.equal(esUrlAbrible('https://maps.apple.com/?q=x'), true);
  assert.equal(esUrlAbrible('http://example.com'), true);
  assert.equal(esUrlAbrible('javascript:alert(1)'), false);
  assert.equal(esUrlAbrible('file:///etc/passwd'), false);
  assert.equal(esUrlAbrible('/relativa'), false);
});

test('resultadoDeVuelta: el código para canjear, o el error del proveedor', () => {
  assert.deepEqual(resultadoDeVuelta('/auth/vuelta?code=abc'), { codigo: 'abc' });
  assert.deepEqual(resultadoDeVuelta('/auth/vuelta?error=access_denied&error_description=Dijo+que+no'), { error: 'Dijo que no' });
  assert.deepEqual(resultadoDeVuelta('/auth/vuelta?error=access_denied'), { error: 'access_denied' });
  assert.equal(resultadoDeVuelta('/auth/vuelta'), null);
  assert.equal(resultadoDeVuelta('/auth/vuelta?otra=1'), null);
});
