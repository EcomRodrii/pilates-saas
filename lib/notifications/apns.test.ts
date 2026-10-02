import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import {
  configApns, endpointApns, esEndpointApns, jwtApns, leerEndpointApns, payloadApns, prioridadApns,
} from './apns.ts';

const TOKEN = 'a'.repeat(64);

test('endpoint APNs: se construye y se lee de vuelta; lo raro, no', () => {
  const e = endpointApns('app.tentare', TOKEN.toUpperCase());
  assert.equal(e, `apns://app.tentare/${TOKEN}`);
  assert.ok(esEndpointApns(e!));
  assert.deepEqual(leerEndpointApns(e!), { bundleId: 'app.tentare', token: TOKEN });
  assert.equal(endpointApns('sin-punto', TOKEN), null);
  assert.equal(endpointApns('app.tentare', 'no-hex'), null);
  assert.equal(leerEndpointApns(`apns://app.tentare/${TOKEN}/extra`), null);
  assert.equal(leerEndpointApns('https://fcm.googleapis.com/x'), null);
});

test('configuración: sin las tres variables no hay APNs; producción por defecto', () => {
  assert.equal(configApns({}), null);
  assert.equal(configApns({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' }), null);
  const c = configApns({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: 'a\\nb' });
  assert.equal(c?.clavePrivada, 'a\nb', 'los \\n escritos en Vercel se convierten en saltos de línea');
  assert.equal(c?.produccion, true);
  assert.equal(configApns({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: 'x', APNS_ENTORNO: 'sandbox' })?.produccion, false);
});

test('el JWT es ES256 en formato JWS (r‖s de 64 bytes) y lo verifica la clave pública', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwt = jwtApns({ keyId: 'ABC123', teamId: 'TEAM42', clavePrivada: pem }, 1_700_000_000);
  const [cab, cuerpo, firma] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(cab, 'base64url').toString()), { alg: 'ES256', kid: 'ABC123' });
  assert.deepEqual(JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), { iss: 'TEAM42', iat: 1_700_000_000 });
  const bytes = Buffer.from(firma, 'base64url');
  assert.equal(bytes.length, 64);
  assert.ok(verify('sha256', Buffer.from(`${cab}.${cuerpo}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, bytes));
});

test('el aviso de iOS dice lo mismo que el web: título, texto, enlace y recibo', () => {
  const p = JSON.parse(payloadApns(JSON.stringify({ title: 'Clase cancelada', body: 'Reformer 18:00', url: '/portal/x/reservas', tag: 'n1', nid: 'n1' })));
  assert.deepEqual(p, {
    aps: { alert: { title: 'Clase cancelada', body: 'Reformer 18:00' }, sound: 'default', 'thread-id': 'n1' },
    url: '/portal/x/reservas', nid: 'n1',
  });
  assert.deepEqual(JSON.parse(payloadApns('no es json')).aps.alert, { title: '', body: '' });
});

test('prioridad: lo urgente y lo normal, ya; lo de baja, cuando convenga', () => {
  assert.equal(prioridadApns('high'), '10');
  assert.equal(prioridadApns('normal'), '10');
  assert.equal(prioridadApns('low'), '5');
});
