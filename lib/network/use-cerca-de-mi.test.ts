import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarPorCercania, distanciaDePerfil } from './use-cerca-de-mi.ts';

test('ordenarPorCercania: ordena ascendente por distancia', () => {
  const items = [{ id: 'lejos', km: 500 }, { id: 'cerca', km: 5 }, { id: 'media', km: 50 }];
  const resultado = ordenarPorCercania(items, i => i.km);
  assert.deepEqual(resultado.map(r => r.item.id), ['cerca', 'media', 'lejos']);
});

test('ordenarPorCercania: sin distancia conocida va al final, sin desaparecer', () => {
  const items = [{ id: 'desconocida', km: null }, { id: 'cerca', km: 5 }];
  const resultado = ordenarPorCercania(items, i => i.km);
  assert.deepEqual(resultado.map(r => r.item.id), ['cerca', 'desconocida']);
  assert.equal(resultado.length, 2);
});

test('distanciaDePerfil: null si la ciudad no resuelve coordenadas', () => {
  assert.equal(distanciaDePerfil('Un Pueblo Inventado', { lat: 40, lng: -3 }), null);
});

test('distanciaDePerfil: número redondeado si la ciudad sí resuelve', () => {
  const km = distanciaDePerfil('Madrid', { lat: 40.4168, lng: -3.7038 });
  assert.equal(km, 0);
});
