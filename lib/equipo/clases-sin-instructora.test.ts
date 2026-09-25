import test from 'node:test';
import assert from 'node:assert/strict';
import { clasesSinInstructora, nombreInstructoraDeClase, ETIQUETA_INSTRUCTORA_NO_DISPONIBLE } from './clases-sin-instructora.ts';

const AHORA = new Date('2026-09-25T10:00:00Z');
const instr = [
  { id: 'a', nombre: 'Ana', activo: false },
  { id: 'b', nombre: 'Berta', activo: true },
];
const ses = (id: string, instructorId: string, inicio: string, cancelada = false) => ({ id, instructorId, inicio, cancelada });

test('solo cuentan las futuras, sin cancelar, de quien está de baja', () => {
  const g = clasesSinInstructora([
    ses('1', 'a', '2026-09-26T10:00:00Z'),
    ses('2', 'a', '2026-09-24T10:00:00Z'),        // pasada
    ses('3', 'a', '2026-09-27T10:00:00Z', true),  // cancelada
    ses('4', 'b', '2026-09-26T10:00:00Z'),        // activa
    ses('5', '', '2026-09-26T10:00:00Z'),         // ya sin instructora
    ses('6', 'a', '2026-09-25T10:00:00Z'),        // empieza justo ahora: ya no es futura
  ], instr, AHORA);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].sesiones.map((s) => s.id), ['1']);
});

test('sin nadie de baja no hay nada que decidir, aunque haya clases', () => {
  assert.deepEqual(clasesSinInstructora([ses('1', 'b', '2026-09-26T10:00:00Z')], [instr[1]], AHORA), []);
});

test('reactivar a la instructora hace que dejen de estar pendientes', () => {
  const s = [ses('1', 'a', '2026-09-26T10:00:00Z')];
  assert.equal(clasesSinInstructora(s, instr, AHORA).length, 1);
  assert.equal(clasesSinInstructora(s, [{ id: 'a', nombre: 'Ana', activo: true }], AHORA).length, 0);
});

test('agrupa por instructora y ordena las clases por fecha', () => {
  const g = clasesSinInstructora([
    ses('2', 'a', '2026-10-01T10:00:00Z'), ses('1', 'a', '2026-09-26T10:00:00Z'),
  ], instr, AHORA);
  assert.deepEqual(g[0].sesiones.map((s) => s.id), ['1', '2']);
});

test('la etiqueta de una clase de una instructora de baja', () => {
  assert.equal(nombreInstructoraDeClase('a', instr), ETIQUETA_INSTRUCTORA_NO_DISPONIBLE);
  assert.equal(nombreInstructoraDeClase('b', instr), 'Berta');
  assert.equal(nombreInstructoraDeClase('', instr), null);
  assert.equal(nombreInstructoraDeClase('zz', instr), null);
});
