import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reservasPorAprobarDe, resultadoDecisionReserva, SIN_GUARDAR, YA_NO_PENDIENTE,
} from './reservas-por-aprobar.ts';

const AHORA = new Date('2026-09-14T10:00:00Z');
const fila = (id: string, inicio: string, extra: Record<string, unknown> = {}) => ({
  id, sesion_id: `ses-${id}`, socio_id: 'soc-1', estado: 'PENDIENTE_APROBACION',
  sesiones: { inicio, tipos_clase: { nombre: 'Reformer' } }, ...extra,
});

test('solo las pendientes de clases que aún no han empezado, ordenadas por inicio', () => {
  const r = reservasPorAprobarDe([
    fila('tarde', '2026-09-16T18:00:00Z'),
    fila('pronto', '2026-09-14T12:00:00Z'),
    fila('ya-empezo', '2026-09-14T10:00:00Z'),
    fila('pasada', '2026-09-13T09:00:00Z'),
    fila('confirmada', '2026-09-15T09:00:00Z', { estado: 'CONFIRMADA' }),
  ], AHORA);
  assert.deepEqual(r.map(x => x.id), ['pronto', 'tarde']);
  assert.deepEqual(r[0], {
    id: 'pronto', sesionId: 'ses-pronto', socioId: 'soc-1', clase: 'Reformer', inicio: '2026-09-14T12:00:00Z',
  });
});

test('⚠️ un mock que no filtra (filas sin embed de la sesión) no pinta nada', () => {
  // e2e/panel-sembrado.ts contesta rest/v1/reservas** con las reservas del
  // contexto: sin `sesiones` embebida y en cualquier estado.
  assert.deepEqual(reservasPorAprobarDe([
    { id: 'r1', sesion_id: 's1', socio_id: 'soc-1', estado: 'PENDIENTE_APROBACION' },
    { id: 'r2', sesion_id: 's2', socio_id: 'soc-1', estado: 'CONFIRMADA' },
  ], AHORA), []);
});

test('tolera el embed como array, sin tipo de clase, fechas rotas y cuerpos raros', () => {
  const r = reservasPorAprobarDe([
    { ...fila('a', '2026-09-15T09:00:00Z'), sesiones: [{ inicio: '2026-09-15T09:00:00Z', tipos_clase: null }] },
    fila('b', 'no-es-fecha'),
    null,
    { ...fila('c', '2026-09-15T10:00:00Z'), socio_id: null },
  ], AHORA);
  assert.deepEqual(r.map(x => [x.id, x.clase, x.socioId]), [['a', 'Clase', 'soc-1'], ['c', 'Reformer', null]]);
  assert.deepEqual(reservasPorAprobarDe(null, AHORA), []);
  assert.deepEqual(reservasPorAprobarDe({} as never, AHORA), []);
});

test('200 aprobar: dice cómo ha quedado de verdad (plaza o lista de espera)', () => {
  assert.deepEqual(resultadoDecisionReserva(true, { status: 200, body: { ok: true, estado: 'CONFIRMADA' } }),
    { quitar: true, mensaje: 'Reserva aprobada: tiene su plaza confirmada' });
  const espera = resultadoDecisionReserva(true, { status: 200, body: { ok: true, estado: 'LISTA_ESPERA' } });
  assert.equal(espera.quitar, true);
  assert.match(espera.mensaje, /lista de espera/);
  assert.doesNotMatch(espera.mensaje, /aprobada|confirmada/i);
});

test('200 con la clase ya empezada: se cancela y no dice «aprobada»', () => {
  const r = resultadoDecisionReserva(true, { status: 200, body: { ok: true, estado: 'CANCELADA', motivoUI: 'clase_ya_empezada' } });
  assert.equal(r.quitar, true);
  assert.match(r.mensaje, /ya ha empezado/);
  assert.doesNotMatch(r.mensaje, /aprobada/i);
});

test('200 rechazar y 200 sin cuerpo legible: la fila se va sin inventarse el resultado', () => {
  assert.deepEqual(resultadoDecisionReserva(false, { status: 200, body: { ok: true, estado: 'CANCELADA' } }),
    { quitar: true, mensaje: 'Reserva rechazada' });
  for (const body of [null, {}, 'ok', { ok: true, estado: 'RARO' }]) {
    const r = resultadoDecisionReserva(true, { status: 200, body });
    assert.deepEqual(r, { quitar: true, mensaje: YA_NO_PENDIENTE });
  }
});

test('409: ya no estaba pendiente — la fila se va y nunca afirma «aprobada»', () => {
  const r = resultadoDecisionReserva(true, { status: 409, body: { error: 'Esta reserva ya no está pendiente de aprobación' } });
  assert.equal(r.quitar, true);
  assert.doesNotMatch(r.mensaje, /aprobada/i);
});

test('400: sigue pendiente, la fila se queda con el motivo del servidor (y nunca uno técnico)', () => {
  const limite = 'La socia ya alcanzó el límite semanal de su plan y no tiene recuperaciones disponibles. La reserva sigue pendiente: libera una clase de esa semana o recházala.';
  assert.deepEqual(resultadoDecisionReserva(true, { status: 400, body: { error: limite } }), { quitar: false, mensaje: limite });
  assert.deepEqual(resultadoDecisionReserva(true, { status: 400, body: { error: 'duplicate key value violates unique constraint' } }),
    { quitar: false, mensaje: SIN_GUARDAR });
  assert.deepEqual(resultadoDecisionReserva(true, { status: 400, body: null }), { quitar: false, mensaje: SIN_GUARDAR });
});

test('sin red o 5xx: no sabemos si entró — la fila se queda para reintentar', () => {
  for (const status of [0, 500, 502, 504]) {
    assert.deepEqual(resultadoDecisionReserva(true, { status, body: { error: 'boom' } }), { quitar: false, mensaje: SIN_GUARDAR });
  }
});

test('401/403: la fila se queda y habla de la sesión o el permiso', () => {
  const r = resultadoDecisionReserva(false, { status: 403, body: { error: 'No autorizado' } });
  assert.equal(r.quitar, false);
  assert.match(r.mensaje, /permiso/);
});
