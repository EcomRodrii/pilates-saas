import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorDeRetornoOAuth } from './oauth-retorno.ts';

test('una URL sin error no inventa ninguno', () => {
  assert.equal(errorDeRetornoOAuth('/portal/x/acceso/verificar'), null);
  assert.equal(errorDeRetornoOAuth('/portal/x/acceso/verificar?email=a%40b.com'), null);
});

test('la vuelta CON sesión no es un error', () => {
  // Es la forma real del retorno bueno del flujo implícito.
  assert.equal(
    errorDeRetornoOAuth('/portal/x/acceso/verificar#access_token=eyJ&expires_in=3600&token_type=bearer'),
    null,
  );
});

test('cancelar en Google se reconoce y NO se lee como avería', () => {
  const e = errorDeRetornoOAuth('/portal/x/acceso/verificar#error=access_denied&error_description=User+denied');
  assert.ok(e);
  assert.equal(e.codigo, 'access_denied');
  assert.equal(e.reintentable, true);
  assert.match(e.mensaje, /otra vez|intentarlo/i);
});

test('el texto de la URL NUNCA llega a la pantalla', () => {
  // `error_description` lo redacta un tercero y viaja en la URL: quien mande el
  // enlace elige ese texto. Se traduce por código, nunca se pinta.
  const e = errorDeRetornoOAuth(
    '/portal/x/acceso/verificar#error=access_denied&error_description=' +
    encodeURIComponent('Llama al 900 123 456 para desbloquear tu cuenta'),
  );
  assert.ok(e);
  assert.doesNotMatch(e.mensaje, /900 123 456/);
});

test('el fragmento manda sobre la query', () => {
  const e = errorDeRetornoOAuth('/x?error=server_error#error=access_denied');
  assert.equal(e?.codigo, 'access_denied');
});

test('también se lee de la query, por si algún día se pasa a PKCE', () => {
  const e = errorDeRetornoOAuth('/x?error=access_denied&error_description=nope');
  assert.equal(e?.codigo, 'access_denied');
});

test('error_code gana a error cuando vienen los dos', () => {
  // gotrue manda el genérico en `error` y el concreto en `error_code`.
  const e = errorDeRetornoOAuth('/x#error=server_error&error_code=provider_email_needs_verification');
  assert.equal(e?.codigo, 'provider_email_needs_verification');
  assert.equal(e?.reintentable, false);
});

test('un código desconocido no enmudece: cae en un texto honesto', () => {
  const e = errorDeRetornoOAuth('/x#error=algo_que_no_existe_todavia');
  assert.ok(e);
  assert.ok(e.mensaje.length > 0);
  assert.equal(e.reintentable, true);
});

test('una URL basura no revienta', () => {
  assert.doesNotThrow(() => errorDeRetornoOAuth('%%%'));
});
