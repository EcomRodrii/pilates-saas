import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configWallet, paseJson, rgbDeHex } from './pase.ts';

const pem = (tipo: string) => Buffer.from(`-----BEGIN ${tipo}-----\nAAAA\n-----END ${tipo}-----\n`).toString('base64');
const COMPLETO = {
  APPLE_WALLET_PASS_TYPE_ID: 'pass.example.acceso',
  APPLE_WALLET_TEAM_ID: 'ABCDE12345',
  APPLE_WALLET_WWDR_PEM_B64: pem('CERTIFICATE'),
  APPLE_WALLET_CERT_PEM_B64: pem('CERTIFICATE'),
  APPLE_WALLET_KEY_PEM_B64: pem('PRIVATE KEY'),
};

test('configWallet: sin ninguna variable, inerte', () => {
  assert.equal(configWallet({}), null);
});

test('configWallet: basta con que falte una', () => {
  for (const k of Object.keys(COMPLETO)) {
    assert.equal(configWallet({ ...COMPLETO, [k]: '' }), null, k);
  }
});

test('configWallet: un PEM que no es un PEM no cuenta como configurado', () => {
  assert.equal(configWallet({ ...COMPLETO, APPLE_WALLET_KEY_PEM_B64: Buffer.from('hola').toString('base64') }), null);
});

test('configWallet: completa, decodifica los PEM; la frase de paso es opcional', () => {
  const c = configWallet(COMPLETO);
  assert.ok(c);
  assert.match(c.signerKey, /BEGIN PRIVATE KEY/);
  assert.equal(c.signerKeyPassphrase, undefined);
  assert.equal(configWallet({ ...COMPLETO, APPLE_WALLET_KEY_PASSPHRASE: 'x' })?.signerKeyPassphrase, 'x');
});

test('rgbDeHex', () => {
  assert.equal(rgbDeHex('#3E6B4A'), 'rgb(62, 107, 74)');
  assert.equal(rgbDeHex('nada'), 'rgb(26, 26, 26)');
  assert.equal(rgbDeHex(null), 'rgb(26, 26, 26)');
});

test('paseJson: el código es el token del QR y no lleva más dato personal que el nombre', () => {
  const p = paseJson({
    config: { passTypeIdentifier: 'pass.example.acceso', teamIdentifier: 'ABCDE12345' },
    serial: 'est-1:soc-1',
    estudio: { nombre: 'Estudio de prueba', colorPrimario: '#3E6B4A', direccion: 'Calle Falsa 1' },
    alumna: { nombre: 'Ana' },
    qr: 'tok-123',
  });
  assert.deepEqual(p.barcodes, [{ format: 'PKBarcodeFormatQR', message: 'tok-123', messageEncoding: 'iso-8859-1' }]);
  assert.equal(p.serialNumber, 'est-1:soc-1');
  assert.equal(p.sharingProhibited, true);
  const texto = JSON.stringify(p);
  assert.ok(!/@|telefono|email/i.test(texto));
});
