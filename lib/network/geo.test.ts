import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanciaKm } from './geo.ts';
import { coordsDeCiudad } from './ciudades-coords.ts';

test('distanciaKm: mismo punto es 0', () => {
  const p = { lat: 40.4168, lng: -3.7038 };
  assert.equal(distanciaKm(p, p), 0);
});

test('distanciaKm: Madrid-Barcelona ronda los 500 km', () => {
  const madrid = { lat: 40.4168, lng: -3.7038 };
  const barcelona = { lat: 41.3874, lng: 2.1686 };
  const km = distanciaKm(madrid, barcelona);
  assert.ok(km > 480 && km < 520, `esperaba ~500km, dio ${km}`);
});

test('distanciaKm es simétrica', () => {
  const a = { lat: 37.3891, lng: -5.9845 };
  const b = { lat: 43.263, lng: -2.935 };
  assert.equal(distanciaKm(a, b), distanciaKm(b, a));
});

test('coordsDeCiudad: reconoce mayúsculas, minúsculas y acentos', () => {
  assert.deepEqual(coordsDeCiudad('Madrid'), coordsDeCiudad('MADRID'));
  assert.deepEqual(coordsDeCiudad('Malaga'), coordsDeCiudad('Málaga'));
  assert.deepEqual(coordsDeCiudad(' Sevilla '), coordsDeCiudad('sevilla'));
});

test('coordsDeCiudad: null para ciudad desconocida o ausente', () => {
  assert.equal(coordsDeCiudad('Un Pueblo Que No Está En La Lista'), null);
  assert.equal(coordsDeCiudad(null), null);
});
