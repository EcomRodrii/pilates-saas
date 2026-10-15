import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverDuena } from './app-de-cadena.ts';

const sedes = [{ id: 'principal', nombre: 'Luz Norte' }, { id: 'sur', nombre: 'Luz Sur' }, { id: 'piloto', nombre: 'Luz Este' }];

test('estudio suelto: la app es suya, sin más sedes', () => {
  assert.deepEqual(resolverDuena('solo', false, null), { studioId: 'solo', esSedeSecundaria: false, nombrePrincipal: null, sedes: ['solo'] });
});

test('la principal de una cadena es la dueña de la app, con todas las sedes dentro', () => {
  assert.deepEqual(resolverDuena('principal', false, sedes), { studioId: 'principal', esSedeSecundaria: false, nombrePrincipal: null, sedes: ['principal', 'sur', 'piloto'] });
});

test('una sede secundaria ve la app de la principal y no la pide', () => {
  assert.deepEqual(resolverDuena('sur', false, sedes), { studioId: 'principal', esSedeSecundaria: true, nombrePrincipal: 'Luz Norte', sedes: ['principal', 'sur', 'piloto'] });
});

test('una sede secundaria que YA tiene su propia app (el piloto) la conserva, sola', () => {
  assert.deepEqual(resolverDuena('piloto', true, sedes), { studioId: 'piloto', esSedeSecundaria: false, nombrePrincipal: null, sedes: ['piloto'] });
});
