import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearPagina, esHostDeBaseDeDatos, globARegex } from './page-shim.ts';

// El aislamiento del panel de demostración, POR COMPORTAMIENTO: lo que el panel real pide a la
// base de datos real no puede salir nunca de la pestaña. Se prueba con un `window` mínimo.

const HOST = 'proyecto-real.supabase.co';
const llamadasReales: string[] = [];
const almacen = new Map<string, string>();

beforeEach(() => {
  llamadasReales.length = 0;
  almacen.clear();
  const g = globalThis as Record<string, unknown>;
  g.window = {
    location: { href: 'https://tentare.app/clientas', origin: 'https://tentare.app' },
    fetch: async (u: unknown) => { llamadasReales.push(String((u as Request).url ?? u)); return new Response('real', { status: 200 }); },
    WebSocket: class { url: string; constructor(url: string) { this.url = url; } },
  };
  const local = { setItem: (k: string, v: string) => almacen.set(k, v), getItem: (k: string) => almacen.get(k) ?? null };
  g.localStorage = local;
  (g.window as Record<string, unknown>).localStorage = local;
  g.Storage = function Storage() {};
  (g.Storage as { prototype: object }).prototype = Object.getPrototypeOf(local) === Object.prototype ? local : Object.getPrototypeOf(local);
});

const ventana = () => (globalThis as unknown as { window: { fetch: typeof fetch; WebSocket: new (u: string) => { readyState?: number; url: string } } }).window;
const nueva = () => crearPagina({ sesion: { access_token: 't' } });

test('lo que ninguna regla atiende y va a la base de datos real NO sale: lectura = [], escritura = {}', async () => {
  const pagina = nueva();
  const lee = await ventana().fetch(`https://${HOST}/rest/v1/socios?select=*`);
  assert.deepEqual(await lee.json(), []);
  for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const r = await ventana().fetch(`https://${HOST}/rest/v1/socios`, { method: metodo, body: '{"x":1}' });
    assert.equal(r.status, 200, metodo);
    assert.deepEqual(await r.json(), {});
  }
  const auth = await ventana().fetch(`https://${HOST}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', body: '{}' });
  assert.equal(auth.status, 200);
  assert.deepEqual(llamadasReales, [], 'ni una petición real');
  assert.ok(pagina.sinAtender().length >= 5);
});

test('lo mismo con las rutas /api/ y /rest/ del propio servidor: se contestan en memoria', async () => {
  nueva();
  const r = await ventana().fetch('https://tentare.app/api/clientas/borrar', { method: 'POST', body: '{}' });
  assert.deepEqual(await r.json(), {});
  assert.deepEqual(llamadasReales, []);
});

test('el resto del tráfico (páginas, fuentes, otros hosts) pasa a la red real', async () => {
  nueva();
  await ventana().fetch('https://tentare.app/clientas/soc-1?_rsc=abc');
  await ventana().fetch('https://fonts.gstatic.com/x.woff2');
  assert.equal(llamadasReales.length, 2);
});

test('una regla atiende, y fallback() baja a la anterior como en Playwright (la última registrada manda)', async () => {
  const pagina = nueva();
  await pagina.route('**/rest/v1/**', (r) => r.fulfill({ json: [{ de: 'comodin' }] }));
  await pagina.route('**/rest/v1/socios**', (r) => r.fulfill({ json: [{ de: 'socios' }] }));
  await pagina.route('**/rest/v1/planes**', (r) => r.fallback());
  assert.deepEqual(await (await ventana().fetch(`https://${HOST}/rest/v1/socios?x=1`)).json(), [{ de: 'socios' }]);
  assert.deepEqual(await (await ventana().fetch(`https://${HOST}/rest/v1/planes`)).json(), [{ de: 'comodin' }]);
  assert.deepEqual(llamadasReales, []);
});

test('la regla ve método y cuerpo, y una regla que revienta no deja pasar la petición a la red', async () => {
  const pagina = nueva();
  let visto: unknown = null;
  await pagina.route('**/api/ajustes', (r) => { visto = { m: r.request().method(), b: r.request().postDataJSON() }; return r.fulfill({ status: 201, json: { ok: true } }); });
  await pagina.route('**/api/roto', () => { throw new Error('boom'); });
  const r = await ventana().fetch('https://tentare.app/api/ajustes', { method: 'POST', body: JSON.stringify({ a: 1 }) });
  assert.equal(r.status, 201);
  assert.deepEqual(visto, { m: 'POST', b: { a: 1 } });
  const roto = await ventana().fetch('https://tentare.app/api/roto');
  assert.equal(roto.status, 200);
  assert.deepEqual(llamadasReales, []);
});

test('el tiempo real hacia la base de datos real es un falso que nunca conecta; otros WebSocket no se tocan', () => {
  nueva();
  const W = ventana().WebSocket;
  const falso = new W(`wss://${HOST}/realtime/v1/websocket`);
  assert.equal(falso.readyState, 3);
  const otro = new W('wss://otro-sitio.example/socket');
  assert.equal(otro.readyState, undefined);
  assert.equal(otro.url, 'wss://otro-sitio.example/socket');
});

test('la sesión de mentira se contesta para cualquier clave sb-…-auth-token que no exista, y solo para esas', () => {
  nueva();
  const local = (globalThis as unknown as { window: { localStorage: { getItem(k: string): string | null } } }).window.localStorage;
  assert.deepEqual(JSON.parse(local.getItem('sb-cualquierproyecto-auth-token')!), { access_token: 't' });
  assert.equal(local.getItem('otra-clave'), null);
});

test('qué hosts son «la base de datos»: cualquier supabase, y nada más', () => {
  for (const h of ['abc.supabase.co', 'proyecto-real.supabase.co', 'x.supabase.in', 'supabase.co']) assert.ok(esHostDeBaseDeDatos(h), h);
  for (const h of ['tentare.app', 'supabase.co.evil.com', 'notsupabase.co', 'fonts.gstatic.com', 'localhost:3000']) assert.ok(!esHostDeBaseDeDatos(h), h);
});

test('globARegex: ** cruza barras, * no, y lo demás es literal', () => {
  assert.ok(globARegex('**/rest/v1/**').test('https://a.co/rest/v1/socios?x=1'));
  assert.ok(globARegex('**/api/layout**').test('https://a.co/api/layout'));
  assert.ok(!globARegex('**/rest/v1/*').test('https://a.co/rest/v1/a/b'));
  assert.ok(!globARegex('**/a.b').test('https://x/aXb'));
});
