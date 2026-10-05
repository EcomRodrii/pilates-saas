import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirConversaciones, type FilaLectura, type FilaUltimoMensaje } from './resumen.ts';
import { TEXTO_RETIRADO } from '../moderacion/reglas.ts';

const conv = (id: string, tipo: string) => ({
  id, tipo, creado_en: '2026-09-01T10:00:00Z', ultimo_mensaje_en: '2026-09-14T10:00:00Z',
});

test('un hilo instructora–alumna en el que no participo es de solo lectura; el mío y el mostrador, no', () => {
  const r = resumirConversaciones(
    [conv('ajeno', 'ALUMNA_INSTRUCTORA'), conv('mio', 'ALUMNA_INSTRUCTORA'), conv('mostrador', 'ALUMNA_MOSTRADOR')],
    [],
    [
      { conversacion_id: 'ajeno', auth_user_id: 'instructora', leido_hasta: '2026-09-14T09:00:00Z' },
      { conversacion_id: 'ajeno', auth_user_id: 'socia', leido_hasta: '2026-09-14T09:00:00Z' },
      { conversacion_id: 'mio', auth_user_id: 'yo', leido_hasta: '2026-09-14T09:00:00Z' },
    ],
    'yo',
    'equipo',
  );
  assert.deepEqual(r.map((c) => [c.id, c.solo_lectura]), [['ajeno', true], ['mio', false], ['mostrador', false]]);
  // Sin fila propia no hay «leído por mí»: nunca cuenta como sin leer.
  assert.equal(r[0].leido_hasta, null);
  assert.equal(r[0].sin_leer, false);
});

// Las dos de abajo encadenan la consulta y la regla con filas COMO LAS DEVUELVE
// PostgREST: `leido_hasta` llega como texto, y el de un hilo que nunca se abrió
// es literalmente '-infinity' (el valor por defecto de la columna). Un mock de
// la ruta en un e2e no puede ver esto: el fallo era de servidor.

const ultimos: FilaUltimoMensaje[] = [
  { conversacion_id: 'estudio', cuerpo: 'Te guardo el sitio.', remitente_auth_user_id: 'recepcion', creado_en: '2026-09-14T10:00:00Z' },
  { conversacion_id: 'laura', cuerpo: '¿Qué tal la espalda?', remitente_auth_user_id: 'laura', creado_en: '2026-09-14T10:00:00Z' },
  { conversacion_id: 'mia', cuerpo: '¿Mañana hay clase?', remitente_auth_user_id: 'socia', creado_en: '2026-09-14T10:00:00Z' },
];

test('desde la alumna: sin_leer con su marca, \'-infinity\' incluido; su propio mensaje no enciende nada', () => {
  const lecturas: FilaLectura[] = [
    // Hilo con el estudio: la alumna lo leyó DESPUÉS del último mensaje. El
    // mostrador no tiene fila: su marca va en la conversación y aquí no cuenta.
    { conversacion_id: 'estudio', auth_user_id: 'socia', leido_hasta: '2026-09-14T11:00:00+00:00' },
    // Hilo con su instructora que nunca abrió.
    { conversacion_id: 'laura', auth_user_id: 'socia', leido_hasta: '-infinity' },
    { conversacion_id: 'laura', auth_user_id: 'laura', leido_hasta: '2026-09-14T10:00:00+00:00' },
    // Hilo donde lo último lo escribió ella y nunca lo «abrió».
    { conversacion_id: 'mia', auth_user_id: 'socia', leido_hasta: '-infinity' },
  ];
  const r = resumirConversaciones(
    [
      { ...conv('estudio', 'ALUMNA_MOSTRADOR'), mostrador_leido_hasta: null },
      conv('laura', 'ALUMNA_INSTRUCTORA'),
      conv('mia', 'ALUMNA_MOSTRADOR'),
    ],
    ultimos, lecturas, 'socia', 'alumna',
  );
  assert.deepEqual(r.map((c) => [c.id, c.sin_leer]), [['estudio', false], ['laura', true], ['mia', false]]);
});

test('desde la instructora: el hilo que nunca abrió sale sin leer; el que solo tiene un mensaje suyo, no', () => {
  const lecturas: FilaLectura[] = [
    { conversacion_id: 'laura', auth_user_id: 'laura', leido_hasta: '-infinity' },
    { conversacion_id: 'laura', auth_user_id: 'socia', leido_hasta: '2026-09-14T10:00:00+00:00' },
    { conversacion_id: 'suyo', auth_user_id: 'laura', leido_hasta: '-infinity' },
  ];
  const r = resumirConversaciones(
    [conv('laura', 'ALUMNA_INSTRUCTORA'), conv('suyo', 'ALUMNA_INSTRUCTORA')],
    [
      ...ultimos.filter((u) => u.conversacion_id !== 'laura'),
      { conversacion_id: 'laura', cuerpo: 'Me duele la rodilla', remitente_auth_user_id: 'socia', creado_en: '2026-09-14T10:00:00Z' },
      { conversacion_id: 'suyo', cuerpo: 'Hola, soy Laura', remitente_auth_user_id: 'laura', creado_en: '2026-09-14T10:00:00Z' },
    ],
    lecturas, 'laura', 'equipo',
  );
  assert.deepEqual(r.map((c) => [c.id, c.sin_leer]), [['laura', true], ['suyo', false]]);
});

// ── Moderación: lo retirado por el estudio en la última línea de la bandeja ─

const retirado: FilaUltimoMensaje[] = [
  { conversacion_id: 'laura', cuerpo: 'Algo feo', remitente_auth_user_id: 'socia', creado_en: '2026-09-14T10:00:00Z', oculto_en: '2026-09-14T11:00:00Z' },
];
const lecturasRetirado: FilaLectura[] = [{ conversacion_id: 'laura', auth_user_id: 'socia', leido_hasta: '-infinity' }];

test('en las apps, si lo último lo retiró el estudio, la bandeja no enseña el texto (por defecto, tampoco)', () => {
  for (const opciones of [{ ocultarRetirados: true }, undefined]) {
    const [c] = resumirConversaciones([conv('laura', 'ALUMNA_INSTRUCTORA')], retirado, lecturasRetirado, 'laura', 'equipo', opciones);
    assert.equal(c.ultimo_cuerpo, TEXTO_RETIRADO);
    assert.equal(c.ultimo_oculto, true);
  }
});

test('en el panel, que modera, la bandeja trae el texto y la marca', () => {
  const [c] = resumirConversaciones([conv('laura', 'ALUMNA_INSTRUCTORA')], retirado, lecturasRetirado, 'duena', 'equipo', { ocultarRetirados: false });
  assert.equal(c.ultimo_cuerpo, 'Algo feo');
  assert.equal(c.ultimo_oculto, true);
  // Y uno normal sale igual que siempre.
  const [n] = resumirConversaciones([conv('laura', 'ALUMNA_INSTRUCTORA')], [{ ...retirado[0], oculto_en: null }], lecturasRetirado, 'duena', 'equipo', { ocultarRetirados: true });
  assert.equal(n.ultimo_cuerpo, 'Algo feo');
  assert.equal(n.ultimo_oculto, false);
});
