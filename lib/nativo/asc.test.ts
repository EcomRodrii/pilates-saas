import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import {
  CAPACIDADES, bundleDeCupo, credencialesDe, cuerpoBundleId, cuerpoCapacidad, cuerpoNombre, errorAsc, tokenAsc,
} from './asc.ts';
import { esBundleDeEstudio } from '../app-nativa/app-estudio.ts';

// Una clave de pruebas generada aquí: nunca la de verdad.
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const P8 = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const CRED = { keyId: 'ABCDE12345', issuerId: '69a6de7e-0000-47e3-e053-5b8c7c11a4d1', p8: P8 };

test('las credenciales dicen qué falta, sin enseñar el valor', () => {
  assert.deepEqual(credencialesDe({ ASC_KEY_ID: 'ABCDE12345', ASC_ISSUER_ID: CRED.issuerId, ASC_KEY_P8: P8 }), { ...CRED, p8: P8.trim() });
  const r = credencialesDe({ ASC_KEY_ID: 'malo', ASC_KEY_P8: 'sin cabecera' });
  assert.deepEqual(r, { falta: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8'] });
  assert.doesNotMatch(JSON.stringify(r), /sin cabecera|malo/);
});

test('el token es un ES256 que Apple acepta: cabecera, cuerpo y firma verificable', () => {
  const ahora = new Date('2026-10-15T10:00:00Z');
  const token = tokenAsc(CRED, ahora);
  const [c, cuerpo, firma] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url').toString()), { alg: 'ES256', kid: 'ABCDE12345', typ: 'JWT' });
  const p = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  assert.equal(p.iss, CRED.issuerId);
  assert.equal(p.aud, 'appstoreconnect-v1');
  assert.equal(p.iat, ahora.getTime() / 1000);
  // Apple rechaza tokens de más de 20 minutos.
  assert.ok(p.exp - p.iat <= 20 * 60);
  const ok = verify('sha256', Buffer.from(`${c}.${cuerpo}`), { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url'));
  assert.equal(ok, true);
});

test('los cuerpos de las peticiones tienen la forma JSON:API de Apple', () => {
  assert.deepEqual(cuerpoBundleId('app.tentare.cupo-001', 'Tentare cupo 001'), {
    data: { type: 'bundleIds', attributes: { identifier: 'app.tentare.cupo-001', name: 'Tentare cupo 001', platform: 'IOS' } },
  });
  const siwa = cuerpoCapacidad('B1', 'APPLE_ID_AUTH');
  assert.equal(siwa.data.relationships.bundleId.data.id, 'B1');
  assert.equal((siwa.data.attributes as { settings?: unknown[] }).settings?.length, 1);
  assert.equal('settings' in cuerpoCapacidad('B1', 'PUSH_NOTIFICATIONS').data.attributes, false);
  assert.deepEqual(cuerpoNombre('L1', 'Luz Pilates'), { data: { type: 'appInfoLocalizations', id: 'L1', attributes: { name: 'Luz Pilates' } } });
  assert.deepEqual([...CAPACIDADES], ['PUSH_NOTIFICATIONS', 'ASSOCIATED_DOMAINS', 'APPLE_ID_AUTH']);
});

test('los huecos del lote son identificadores de app de estudio válidos', () => {
  assert.equal(bundleDeCupo(7), 'app.tentare.cupo-007');
  assert.equal(esBundleDeEstudio(bundleDeCupo(1)), true);
  assert.equal(esBundleDeEstudio(bundleDeCupo(999)), true);
  for (const malo of [0, 1000, 1.5, -3]) assert.throws(() => bundleDeCupo(malo));
});

test('el error de Apple se lee sin cabeceras', () => {
  assert.equal(errorAsc(403, { errors: [{ title: 'Forbidden', detail: "The resource 'apps' does not allow 'CREATE'." }] }),
    "Apple contestó 403: Forbidden: The resource 'apps' does not allow 'CREATE'.");
  assert.equal(errorAsc(500, null), 'Apple contestó 500');
});
