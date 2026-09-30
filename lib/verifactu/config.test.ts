import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entornoTransmision, destinoDeEntorno, certificadoDeEntorno, queFaltaParaTransmitir,
  transmisionConfigurada, qrEnProduccion,
} from './config.ts';
import { endpointVerifactu } from './endpoints.ts';

const COMPLETA = {
  VERIFACTU_ENVIRONMENT: 'production', VERIFACTU_ENTORNO: 'produccion',
  CERTIFICATE_PFX: Buffer.from('no-es-un-pfx-real').toString('base64'), CERTIFICATE_PASSWORD: 'x',
  VERIFACTU_PRODUCTOR_NIF: '00000000T', VERIFACTU_PRODUCTOR_NOMBRE: 'Productor de Ejemplo',
  VERIFACTU_PRODUCTOR_DIRECCION: 'Calle de Ejemplo 1, 00000 Localidad',
};

test('sin VERIFACTU_ENVIRONMENT no hay entorno: no se transmite nada', () => {
  assert.equal(entornoTransmision({}), null);
  assert.equal(destinoDeEntorno({}), null);
  assert.equal(transmisionConfigurada({}), false);
  assert.equal(entornoTransmision({ VERIFACTU_ENVIRONMENT: 'prod' }), null, 'un valor mal escrito no es producción');
});

test('persona física apoderada: SIEMPRE www1/prewww1, nunca www10 (sello)', () => {
  assert.equal(endpointVerifactu(destinoDeEntorno({ VERIFACTU_ENVIRONMENT: 'production' })!), 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP');
  assert.equal(endpointVerifactu(destinoDeEntorno({ VERIFACTU_ENVIRONMENT: 'preproduction' })!), 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP');
  // Aunque alguien deje la variable antigua puesta, no hay forma de elegir sello.
  assert.equal(destinoDeEntorno({ VERIFACTU_ENVIRONMENT: 'production', VERIFACTU_TIPO_CERTIFICADO: 'sello' })!.certificado, 'representante');
});

test('el certificado sale de CERTIFICATE_PFX (base64) + CERTIFICATE_PASSWORD, y de nada más', () => {
  assert.equal(certificadoDeEntorno({}), null);
  assert.equal(certificadoDeEntorno({ CERTIFICATE_PFX: 'eA==' }), null, 'sin contraseña no hay certificado');
  const c = certificadoDeEntorno({ CERTIFICATE_PFX: 'eA==', CERTIFICATE_PASSWORD: 'p' });
  assert.deepEqual(c?.pfx, Buffer.from('x'));
  // La variable antigua ya no vale.
  assert.equal(certificadoDeEntorno({ VERIFACTU_CERT_PFX_BASE64: 'eA==', VERIFACTU_CERT_PASSPHRASE: 'p' }), null);
});

test('con todo configurado y los dos entornos de acuerdo, se puede transmitir', () => {
  assert.deepEqual(queFaltaParaTransmitir(COMPLETA), []);
  assert.equal(transmisionConfigurada(COMPLETA), true);
});

test('si el QR del sellado y la transmisión no apuntan al mismo entorno, no se transmite', () => {
  const falta = queFaltaParaTransmitir({ ...COMPLETA, VERIFACTU_ENTORNO: '' });
  assert.equal(falta.length, 1);
  assert.match(falta[0], /VERIFACTU_ENTORNO/);
  assert.equal(qrEnProduccion({ VERIFACTU_ENTORNO: 'produccion' }), true);
  assert.equal(qrEnProduccion({}), false);
});

test('cada pieza que falta se nombra, en cristiano', () => {
  const falta = queFaltaParaTransmitir({});
  assert.ok(falta.some(f => f.includes('VERIFACTU_ENVIRONMENT')));
  assert.ok(falta.some(f => f.includes('CERTIFICATE_PFX')));
  assert.ok(falta.some(f => f.includes('CERTIFICATE_PASSWORD')));
  assert.ok(falta.some(f => f.includes('VERIFACTU_PRODUCTOR_NIF')));
  assert.ok(falta.some(f => f.includes('VERIFACTU_PRODUCTOR_NOMBRE')), 'sin «Tentare» por defecto: el productor es una persona');
  assert.ok(falta.some(f => f.includes('VERIFACTU_PRODUCTOR_DIRECCION')));
});
