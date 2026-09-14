import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoClaseAlumna, ordenarAlumnas, repartirClases, textoEstadoClaseAlumna, type ClaseConAlumna,
} from './alumnas-instructora.ts';

const AHORA = Date.parse('2026-09-15T10:00:00Z');

function clase(sesionId: string, inicio: string, estado: ClaseConAlumna['estado'] = 'viene'): ClaseConAlumna {
  return { sesionId, inicio, fecha: inicio.slice(0, 10), hora: '10:00', tipo: 'Reformer', estado };
}

test('el estado de cada clase con la alumna sale de su reserva', () => {
  assert.equal(estadoClaseAlumna('CONFIRMADA', '2026-09-16T10:00:00Z', AHORA), 'viene');
  assert.equal(estadoClaseAlumna('CONFIRMADA', '2026-09-14T10:00:00Z', AHORA), 'sin-marcar');
  assert.equal(estadoClaseAlumna('ASISTIDA', '2026-09-14T10:00:00Z', AHORA), 'asistio');
  assert.equal(estadoClaseAlumna('NO_ASISTIO', '2026-09-14T10:00:00Z', AHORA), 'no-vino');
  assert.equal(estadoClaseAlumna('LISTA_ESPERA', '2026-09-16T10:00:00Z', AHORA), 'en-espera');
  assert.equal(estadoClaseAlumna('PENDIENTE_APROBACION', '2026-09-16T10:00:00Z', AHORA), 'pendiente');
  assert.equal(estadoClaseAlumna('CANCELADA', '2026-09-16T10:00:00Z', AHORA), null);
  assert.equal(estadoClaseAlumna('RARO', '2026-09-16T10:00:00Z', AHORA), null);
  assert.equal(textoEstadoClaseAlumna('no-vino'), 'No vino');
});

test('las próximas van en orden y las pasadas empiezan por la más reciente', () => {
  const { proximas, pasadas } = repartirClases([
    clase('lejana', '2026-09-30T10:00:00Z'),
    clase('antigua', '2026-08-20T10:00:00Z', 'asistio'),
    clase('manana', '2026-09-16T10:00:00Z'),
    clase('ayer', '2026-09-14T10:00:00Z', 'no-vino'),
    clase('justo-ahora', '2026-09-15T10:00:00Z', 'sin-marcar'),
  ], AHORA);
  assert.deepEqual(proximas.map((c) => c.sesionId), ['manana', 'lejana']);
  assert.deepEqual(pasadas.map((c) => c.sesionId), ['justo-ahora', 'ayer', 'antigua']);
});

test('la lista pone primero a quien viene antes y deja al final, por nombre, a quien no tiene clase', () => {
  const lista = ordenarAlumnas([
    { nombre: 'Úrsula T.', proxima: null },
    { nombre: 'Carmen L.', proxima: { inicio: '2026-09-20T10:00:00Z' } },
    { nombre: 'Aina P.', proxima: null },
    { nombre: 'Laura M.', proxima: { inicio: '2026-09-16T10:00:00Z' } },
  ]);
  assert.deepEqual(lista.map((a) => a.nombre), ['Laura M.', 'Carmen L.', 'Aina P.', 'Úrsula T.']);
});
