import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TTL_MS, firmarSesionDemo, nuevoSid, verificarSesionDemo, type DatosSesionDemo } from './sesion.ts';

const secreto = 'secreto-de-prueba-que-no-es-real';
const datos: DatosSesionDemo = { sid: 'sid1', leadId: 'lead-1', nuevo: true, tipoCentro: 'yoga' };
const AHORA = 1_800_000_000_000;

test('un token firmado se verifica y devuelve lo que se firmó', () => {
  const t = firmarSesionDemo(datos, { ahora: AHORA, secreto });
  assert.deepEqual(verificarSesionDemo(t, { ahora: AHORA + 1000, secreto }), datos);
});

test('caduca a las 24 h', () => {
  const s = firmarSesionDemo(datos, { ahora: AHORA, secreto });
  assert.ok(verificarSesionDemo(s, { ahora: AHORA + TTL_MS - 1, secreto }));
  assert.equal(verificarSesionDemo(s, { ahora: AHORA + TTL_MS + 1, secreto }), null);
});

test('un token de otro sitio del producto, firmado con la misma clave, no vale', async () => {
  const { createHmac } = await import('node:crypto');
  const payload = Buffer.from(JSON.stringify({ v: 'demo', s: 's', l: 'l', n: true, t: 'yoga', exp: AHORA + 1000 })).toString('base64url');
  const ajeno = createHmac('sha256', secreto).update(`descargas.${payload}`).digest('base64url');
  assert.equal(verificarSesionDemo(`${payload}.${ajeno}`, { ahora: AHORA, secreto }), null);
});

test('manipulado, con otro secreto o basura: null, nunca excepción', () => {
  const t = firmarSesionDemo(datos, { ahora: AHORA, secreto });
  const [p, f] = t.split('.');
  const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), l: 'lead-de-otra-persona' })).toString('base64url');
  assert.equal(verificarSesionDemo(`${otro}.${f}`, { ahora: AHORA, secreto }), null);
  assert.equal(verificarSesionDemo(t, { ahora: AHORA, secreto: 'otro-secreto' }), null);
  for (const x of [undefined, null, 7, '', 'a.b.c', 'sin-punto', 'x'.repeat(5000), `${p}.`, '.'])
    assert.equal(verificarSesionDemo(x, { ahora: AHORA, secreto }), null);
});

test('sin secreto configurado no se acepta nada (y no lanza)', () => {
  const previo = { a: process.env.SUSTITUCION_TOKEN_SECRET, b: process.env.OAUTH_STATE_SECRET };
  delete process.env.SUSTITUCION_TOKEN_SECRET; delete process.env.OAUTH_STATE_SECRET;
  try {
    assert.equal(verificarSesionDemo('a.b'), null);
    assert.throws(() => firmarSesionDemo(datos), /Falta/);
  } finally {
    if (previo.a !== undefined) process.env.SUSTITUCION_TOKEN_SECRET = previo.a;
    if (previo.b !== undefined) process.env.OAUTH_STATE_SECRET = previo.b;
  }
});

test('cada sesión tiene un id distinto', () => {
  assert.notEqual(nuevoSid(), nuevoSid());
});
