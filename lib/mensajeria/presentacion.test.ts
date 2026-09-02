import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarSinLeer, tieneSinLeer, type ConversacionConResumen } from './presentacion.ts';

function conversacion(overrides: Partial<ConversacionConResumen>): ConversacionConResumen {
  return {
    id: 'c1', studio_id: 's1', tipo: 'ALUMNA_INSTRUCTORA', titulo: null,
    ancla_sesion_id: null, ancla_reserva_id: null,
    creado_en: '2026-08-01T00:00:00Z', ultimo_mensaje_en: '2026-08-02T00:00:00Z',
    leido_hasta: null, leido_hasta_otros: null,
    ultimo_cuerpo: 'hola', ultimo_remitente_auth_user_id: 'otro',
    ...overrides,
  };
}

test('tieneSinLeer: true si el último mensaje llegó después de mi lectura', () => {
  const c = conversacion({ leido_hasta: '2026-08-01T00:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo'), true);
});

test('tieneSinLeer: false si el último mensaje es mío', () => {
  const c = conversacion({ leido_hasta: '2026-08-01T00:00:00Z', ultimo_remitente_auth_user_id: 'yo' });
  assert.equal(tieneSinLeer(c, 'yo'), false);
});

test('contarSinLeer: cuenta solo las conversaciones con algo sin leer', () => {
  const lista = [
    conversacion({ leido_hasta: '2026-08-01T00:00:00Z' }), // sin leer
    conversacion({ leido_hasta: '2026-08-03T00:00:00Z' }), // ya leída
  ];
  assert.equal(contarSinLeer(lista, 'yo'), 1);
});

// Regresión: una respuesta que promete `conversaciones` en el tipo pero llega
// sin ella en tiempo real (mock de test, API malformada) no debe reventar el
// `.filter()` — mismo bug que lanzó un unhandled rejection en
// useMensajesSinLeer.
test('contarSinLeer: 0 si no hay lista (undefined), sin lanzar', () => {
  assert.equal(contarSinLeer(undefined, 'yo'), 0);
});

test('contarSinLeer: 0 con lista vacía', () => {
  assert.equal(contarSinLeer([], 'yo'), 0);
});
