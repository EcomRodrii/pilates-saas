import test from 'node:test';
import assert from 'node:assert/strict';
import { verificarCaptcha } from './captcha-servidor.ts';

// Un `fetch` de mentira que registra con qué se le llamó.
function fetchQueDevuelve(cuerpo: unknown, ok = true, status = 200) {
  const llamadas: { url: string; body: string }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), body: String(init?.body ?? '') });
    return { ok, status, json: async () => cuerpo } as Response;
  }) as unknown as typeof fetch;
  return { impl, llamadas };
}

test('sin secreto configurado no llama a nadie y deja pasar', async () => {
  const { impl, llamadas } = fetchQueDevuelve({ success: true });
  const r = await verificarCaptcha('lo-que-sea', { fetchImpl: impl, secreto: undefined });
  assert.equal(r, 'ok');
  assert.equal(llamadas.length, 0, 'no debe salir ninguna petición sin secreto');
});

test('con secreto y sin token, no pasa', async () => {
  const { impl, llamadas } = fetchQueDevuelve({ success: true });
  const r = await verificarCaptcha(undefined, { fetchImpl: impl, secreto: 'sec' });
  assert.equal(r, 'sin-token');
  assert.equal(llamadas.length, 0);
});

test('token válido → ok, y el secreto viaja en el cuerpo, nunca en la URL', async () => {
  const { impl, llamadas } = fetchQueDevuelve({ success: true });
  const r = await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec', ip: '1.2.3.4' });
  assert.equal(r, 'ok');
  assert.equal(llamadas.length, 1);
  // Un secreto en la query string acaba en logs de acceso y en el historial de
  // cualquier proxy por el que pase.
  assert.ok(!llamadas[0].url.includes('sec'), 'el secreto no puede ir en la URL');
  assert.ok(llamadas[0].body.includes('secret=sec'));
  assert.ok(llamadas[0].body.includes('response=tok'));
  assert.ok(llamadas[0].body.includes('remoteip=1.2.3.4'));
});

test('sin ip, no se manda `remoteip` vacío', async () => {
  const { impl, llamadas } = fetchQueDevuelve({ success: true });
  await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec' });
  assert.ok(!llamadas[0].body.includes('remoteip'));
});

test('Cloudflare dice que no → invalido (fail-CLOSED en el veredicto)', async () => {
  const { impl } = fetchQueDevuelve({ success: false, 'error-codes': ['invalid-input-response'] });
  assert.equal(await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec' }), 'invalido');
});

test('un token repetido es un veredicto negativo, no un fallo de red', async () => {
  const { impl } = fetchQueDevuelve({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  assert.equal(await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec' }), 'invalido');
});

test('la red se cae → ok (fail-OPEN en el transporte)', async () => {
  const impl = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
  assert.equal(await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec' }), 'ok');
});

test('un 5xx de Cloudflare NO es un veredicto: se deja pasar', async () => {
  const { impl } = fetchQueDevuelve({}, false, 503);
  assert.equal(await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec' }), 'ok');
});

test('una respuesta sin `success` no se toma por buena', async () => {
  const { impl } = fetchQueDevuelve({ mensaje: 'hola' });
  assert.equal(await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec' }), 'invalido');
});

test('`success` verdadero pero como texto NO cuela', async () => {
  // `datos.success === true`, no `if (datos.success)`: un `"false"` en texto es
  // truthy en JS y habría dado por bueno un token rechazado.
  const { impl } = fetchQueDevuelve({ success: 'false' });
  assert.equal(await verificarCaptcha('tok', { fetchImpl: impl, secreto: 'sec' }), 'invalido');
});
