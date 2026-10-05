import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anadirMensaje, previsualizacionParaAviso, tieneSinLeer, tituloConversacionAlumna, type ConversacionConResumen } from './presentacion.ts';

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

// ── tieneSinLeer: desde el equipo (panel e instructora) ────────────────────

test('equipo: leido_hasta anterior al último mensaje → sin leer', () => {
  const c = base({ leido_hasta: '2026-01-01T12:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo', 'equipo'), true);
});

test('equipo: leido_hasta posterior al último mensaje → leído', () => {
  const c = base({ leido_hasta: '2026-01-03T00:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo', 'equipo'), false);
});

// La propietaria que supervisa un hilo instructora–alumna no tiene fila: ni
// puede marcarlo leído (la RLS de la marca exige que la fila sea suya). Si «sin
// fila» contara como «sin leer», la bandeja y el menú contarían para siempre
// todos los hilos de su equipo.
test('equipo: la propietaria supervisando sin fila (solo_lectura) → leído', () => {
  const c = base({ leido_hasta: null, solo_lectura: true, ultimo_remitente_auth_user_id: 'socia' });
  assert.equal(tieneSinLeer(c, 'propietaria', 'equipo'), false);
});

test('equipo: un canal EQUIPO no tiene filas → leído', () => {
  const c = base({ tipo: 'EQUIPO', leido_hasta: null, ultimo_remitente_auth_user_id: 'companera' });
  assert.equal(tieneSinLeer(c, 'yo', 'equipo'), false);
});

// '-infinity' es el valor por defecto de `leido_hasta`: «nunca lo he abierto».
// `new Date('-infinity')` es NaN y la comparación daba falso: un hilo que la
// instructora nunca abrió salía leído.
test('equipo: la instructora que nunca abrió el hilo (\'-infinity\') → sin leer', () => {
  const c = base({ leido_hasta: '-infinity', ultimo_remitente_auth_user_id: 'socia' });
  assert.equal(tieneSinLeer(c, 'instructora', 'equipo'), true);
});

// F-15 (auditoría 20ª pasada): el mostrador no tiene fila STAFF individual —
// leido_hasta es SIEMPRE null ahí. Antes eso devolvía false sin más, así que
// el badge no se encendía JAMÁS para nadie, aunque el mensaje llevara sin
// contestar días.
test('equipo, ALUMNA_MOSTRADOR: nunca marcado como leído (null) → sin leer', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: null, mostrador_leido_hasta: null });
  assert.equal(tieneSinLeer(c, 'yo', 'equipo'), true);
});

test('equipo, ALUMNA_MOSTRADOR: mostrador_leido_hasta anterior al último mensaje → sin leer', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: null, mostrador_leido_hasta: '2026-01-01T12:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo', 'equipo'), true);
});

test('equipo, ALUMNA_MOSTRADOR: mostrador_leido_hasta posterior al último mensaje → leído', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: null, mostrador_leido_hasta: '2026-01-03T00:00:00Z' });
  assert.equal(tieneSinLeer(c, 'yo', 'equipo'), false);
});

test('nunca marca como sin leer el propio mensaje, ni en el mostrador', () => {
  const c = base({
    tipo: 'ALUMNA_MOSTRADOR', mostrador_leido_hasta: null,
    ultimo_remitente_auth_user_id: 'yo',
  });
  assert.equal(tieneSinLeer(c, 'yo', 'equipo'), false);
});

// Las conversaciones nacen con `ultimo_mensaje_en = creado_en` (migr
// 20260825175412): un hilo recién abierto sin mensajes no tiene nada que leer,
// tampoco en el mostrador.
test('sin mensajes → leído, también en el mostrador', () => {
  const vacio = { creado_en: '2026-01-01T00:00:00Z', ultimo_mensaje_en: '2026-01-01T00:00:00Z' };
  assert.equal(tieneSinLeer(base({ ...vacio, tipo: 'ALUMNA_MOSTRADOR' }), 'yo', 'equipo'), false);
  assert.equal(tieneSinLeer(base({ ...vacio, leido_hasta: '-infinity' }), 'yo', 'alumna'), false);
});

// ── tieneSinLeer: desde la alumna ──────────────────────────────────────────
//
// En el hilo con el estudio la alumna lee con SU marca, nunca con la del
// mostrador (que es la del equipo). Antes su app usaba la del mostrador, que su
// bandeja ni siquiera trae: el punto se encendía siempre.

test('alumna, hilo con el estudio: su marca posterior al último mensaje → leído (la del mostrador no cuenta)', () => {
  const c = base({
    tipo: 'ALUMNA_MOSTRADOR', leido_hasta: '2026-01-03T00:00:00Z', mostrador_leido_hasta: null,
    ultimo_remitente_auth_user_id: 'recepcion',
  });
  assert.equal(tieneSinLeer(c, 'socia', 'alumna'), false);
});

test('alumna, hilo con el estudio: su marca anterior al último mensaje → sin leer (aunque el mostrador lo leyera)', () => {
  const c = base({
    tipo: 'ALUMNA_MOSTRADOR', leido_hasta: '2026-01-01T12:00:00Z', mostrador_leido_hasta: '2026-01-03T00:00:00Z',
    ultimo_remitente_auth_user_id: 'recepcion',
  });
  assert.equal(tieneSinLeer(c, 'socia', 'alumna'), true);
});

test('alumna: nunca abrió el hilo (\'-infinity\') y el último es de la otra parte → sin leer', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: '-infinity', ultimo_remitente_auth_user_id: 'recepcion' });
  assert.equal(tieneSinLeer(c, 'socia', 'alumna'), true);
});

test('alumna: \'-infinity\' pero el último mensaje es suyo → leído', () => {
  const c = base({ tipo: 'ALUMNA_MOSTRADOR', leido_hasta: '-infinity', ultimo_remitente_auth_user_id: 'socia' });
  assert.equal(tieneSinLeer(c, 'socia', 'alumna'), false);
});

test('el push de un hilo con una alumna no lleva el texto, en ninguno de los dos; EQUIPO, los primeros 80 caracteres', () => {
  const largo = 'Me duele la rodilla desde la última clase y no sé si venir mañana, ¿qué me recomiendas hacer?';
  assert.equal(previsualizacionParaAviso('ALUMNA_INSTRUCTORA', largo), null);
  assert.equal(previsualizacionParaAviso('ALUMNA_MOSTRADOR', largo), null);
  // El canal de equipo está congelado: se queda como estaba.
  assert.equal(previsualizacionParaAviso('EQUIPO', largo), largo.slice(0, 80));
  assert.equal(previsualizacionParaAviso('EQUIPO', 'Hola'), 'Hola');
});

test('la alumna ve el nombre de su instructora; «Tu instructora» solo si no llega', () => {
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_MOSTRADOR' }, 'Estudio Norte'), 'Estudio Norte');
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_INSTRUCTORA', interlocutor: { nombre: 'Laura' } }, 'Estudio Norte'), 'Laura');
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_INSTRUCTORA', interlocutor: null }, 'Estudio Norte'), 'Tu instructora');
  assert.equal(tituloConversacionAlumna({ tipo: 'ALUMNA_INSTRUCTORA', interlocutor: { nombre: '  ' } }, 'Estudio Norte'), 'Tu instructora');
});

test('el mensaje propio llega dos veces (respuesta del POST y broadcast), en cualquier orden, y se pinta una', () => {
  const previo = { id: 'msg-1' };
  const nuevo = { id: 'msg-2' };

  // Broadcast primero, respuesta del POST después (lo habitual): la segunda no duplica.
  const trasBroadcast = anadirMensaje([previo], nuevo);
  assert.deepEqual(trasBroadcast, [previo, nuevo]);
  assert.equal(anadirMensaje(trasBroadcast, nuevo), trasBroadcast, 'misma referencia: sin re-render');

  // Respuesta primero, broadcast después: igual.
  assert.deepEqual(anadirMensaje(anadirMensaje([previo], nuevo), nuevo), [previo, nuevo]);

  // Hilo aún sin cargar.
  assert.deepEqual(anadirMensaje(null, nuevo), [nuevo]);
});
