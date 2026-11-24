import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asuntoPeticion, esProximamente, plataformaDePeticion, textoPeticion, tipoDePeticion, CORREO_PETICIONES_PLATAFORMA,
} from './pedir-acceso.ts';

test('ClassPass y Wellhub son «Próximamente»; Urban Sports Club no (tiene beta)', () => {
  assert.equal(esProximamente('CLASSPASS'), true);
  assert.equal(esProximamente('WELLHUB'), true);
  assert.equal(esProximamente('URBAN_SPORTS_CLUB'), false);
  assert.equal(tipoDePeticion('CLASSPASS'), 'ACCESO');
  assert.equal(tipoDePeticion('URBAN_SPORTS_CLUB'), 'BETA');
});

test('solo se acepta una plataforma conocida', () => {
  assert.equal(plataformaDePeticion('WELLHUB'), 'WELLHUB');
  assert.equal(plataformaDePeticion('OTRA'), null);
  assert.equal(plataformaDePeticion(undefined), null);
});

test('el asunto dice qué se pide y de qué estudio, sin saltos de línea', () => {
  assert.equal(asuntoPeticion('CLASSPASS', 'Pilates Boutique'), '[Plataformas] Acceso a ClassPass · Pilates Boutique');
  assert.equal(asuntoPeticion('URBAN_SPORTS_CLUB', 'Estudio\nX'), '[Plataformas] Beta de Urban Sports Club · Estudio X');
});

test('el texto lleva estudio, a dónde contestar y el siguiente paso; la petición va a la dirección de empresa', () => {
  const t = textoPeticion('WELLHUB', { estudio: 'Alya', estudioId: 'studio-1', correo: 'dueña@example.com' });
  assert.match(t, /Wellhub/);
  assert.match(t, /Alya \(studio-1\)/);
  assert.match(t, /dueña@example\.com/);
  assert.match(t, /avisarle cuando esté lista/);
  assert.equal(CORREO_PETICIONES_PLATAFORMA, 'soporte@tentare.app');
  assert.match(textoPeticion('URBAN_SPORTS_CLUB', { estudio: 'A', estudioId: 'b', correo: null }), /sin correo en la cuenta/);
});
