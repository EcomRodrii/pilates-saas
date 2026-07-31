import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveBienvenida, yaVioBienvenida, marcarBienvenidaVista } from './portal-bienvenida.ts';

// Este módulo corre en Node (sin DOM): `typeof window === 'undefined'` es el
// camino real que se ejercita aquí — confirma el fail-safe del lado servidor.
// El camino con localStorage real se cubre en el E2E de portal (navegador).

test('claveBienvenida: una clave por estudio (slug), no global', () => {
  assert.equal(claveBienvenida('tentare'), 'pilates:portal-bienvenida-vista:tentare');
  assert.notEqual(claveBienvenida('otro-estudio'), claveBienvenida('tentare'));
});

test('yaVioBienvenida: sin `window` (SSR/Node) → true, fail-safe (no bloquear el login)', () => {
  assert.equal(yaVioBienvenida('tentare'), true);
});

test('marcarBienvenidaVista: sin `window` no lanza', () => {
  assert.doesNotThrow(() => marcarBienvenidaVista('tentare'));
});
