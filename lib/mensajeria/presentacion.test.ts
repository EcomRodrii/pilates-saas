import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previsualizacionParaAviso, tieneSinLeer, tituloConversacionAlumna, type ConversacionConResumen } from './presentacion.ts';

function base(overrides: Partial<ConversacionConResumen>): ConversacionConResumen {
  return {
    id: 'conv-1', studio_id: 'studio-1', tipo: 'ALUMNA_INSTRUCTORA', titulo: null,
    ancla_sesion_id: null, ancla_reserva_id: null, creado_en: '2026-01-01T00:00:00Z',
    ultimo_mensaje_en: '2026-01-02T00:00:00Z', mostrador_leido_hasta: null,
    leido_hasta: null, leido_hasta_otros: null, ultimo_cuerpo: null,
    ultimo_remitente_auth_user_id: null,
    ...overrides,
  } as ConversacionConResumen;
}

test('personal: leido_hasta anterior al último mensaje → sin leer', () => {
  const c = base({ leido_hasta: '2026-01-01T12:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo'), true);
});

test('personal: leido_hasta posterior al último mensaje → leído', () => {
  const c = base({ leido_hasta: '2026-01-03T00:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo'), false);
});

test('personal: sin fila propia (leido_hasta null) → false, no ALUMNA_MOSTRADOR', () => {
  const c = base({ leido_hasta: null });
  assert.equal(tieneSinLeer(c, 'yo'), false);
});

// F-15 (auditoría 20ª pasada): el mostrador no tiene fila STAFF individual —
// leido_hasta es SIEMPRE null ahí. Antes eso devolvía false sin más, así que
// el badge no se encendía JAMÁS para nadie, aunque el mensaje llevara sin
// contestar días.
test('ALUMNA_MOSTRADOR: nunca marcado como leído (null) → sin leer', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: null, mostrador_leido_hasta: null });
  assert.equal(tieneSinLeer(c, 'yo'), true);
});

test('ALUMNA_MOSTRADOR: mostrador_leido_hasta anterior al último mensaje → sin leer', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: null, mostrador_leido_hasta: '2026-01-01T12:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo'), true);
});

test('ALUMNA_MOSTRADOR: mostrador_leido_hasta posterior al último mensaje → leído', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: null, mostrador_leido_hasta: '2026-01-03T00:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo'), false);
});

test('nunca marca como sin leer el propio mensaje, ni en el mostrador', () => {
  const c = base({
    tipo: 'ALUMNA_MOSTRADOR', mostrador_leido_hasta: null,
    ultimo_remitente_auth_user_id: 'yo',
  });
  assert.equal(tieneSinLeer(c, 'yo'), false);
});

test('el push de una conversación con la instructora no lleva el texto; el resto, los primeros 80 caracteres', () => {
  const largo = 'Me duele la rodilla desde la última clase y no sé si venir mañana, ¿qué me recomiendas hacer?';
  assert.equal(previsualizacionParaAviso('ALUMNA_INSTRUCTORA', largo), null);
  assert.equal(previsualizacionParaAviso('ALUMNA_MOSTRADOR', largo), largo.slice(0, 80));
  assert.equal(previsualizacionParaAviso('EQUIPO', 'Hola'), 'Hola');
});

test('la alumna ve el nombre de su instructora; «Tu instructora» solo si no llega', () => {
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_MOSTRADOR' }, 'Estudio Norte'), 'Estudio Norte');
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_INSTRUCTORA', interlocutor: { nombre: 'Laura' } }, 'Estudio Norte'), 'Laura');
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_INSTRUCTORA', interlocutor: null }, 'Estudio Norte'), 'Tu instructora');
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_INSTRUCTORA', interlocutor: { nombre: '  ' } }, 'Estudio Norte'), 'Tu instructora');
});
