import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarCadenaRotaVerifactu, type FilaCadenaVerifactu } from './verifactu-cadena.ts';

// Auditoría 22ª pasada (3-sep-2026), P-3: la bifurcación de la cadena
// Veri*Factu de un estudio real se encontró con una consulta SQL manual —
// nada la comprobaba antes. Estos tests prueban el EFECTO (cuántas roturas
// detecta, y que compara dentro de cada estudio, nunca entre estudios).
//
// `vigilarCadenaVerifactu` (el wrapper que lee `facturas` y avisa a Sentry) no
// se testea aquí directamente: arrastra `lib/supabase-data.ts` (god file con
// imports `@/lib` sin resolver nunca bajo `node --test`, porque hasta ahora
// ningún test lo importaba) — arreglar eso no es tarea de esta pasada.

test('cadena sana (sin roturas): []', () => {
  const filas: FilaCadenaVerifactu[] = [
    { studio_id: 'studio-1', verifactu_seq: 1, numero_completo: 'A-1', verifactu_hash: 'h1', verifactu_prev_hash: '' },
    { studio_id: 'studio-1', verifactu_seq: 2, numero_completo: 'A-2', verifactu_hash: 'h2', verifactu_prev_hash: 'h1' },
    { studio_id: 'studio-1', verifactu_seq: 3, numero_completo: 'A-3', verifactu_hash: 'h3', verifactu_prev_hash: 'h2' },
  ];
  assert.deepEqual(detectarCadenaRotaVerifactu(filas), []);
});

test('detecta la bifurcación real: seq 4 con prev_hash que no casa con el hash de seq 3, y se sana en seq 5', () => {
  // Reproduce la forma del caso encontrado en producción (studio-1, seq 3→4,
  // 10-jul): dos sellados concurrentes escribieron el MISMO prev_hash (el de
  // seq 2) en seq 3 y seq 4 — seq 3 "gana" la carrera, seq 4 queda bifurcada
  // porque su prev_hash ya no es el hash REAL de seq 3. La cadena se sana sola
  // a partir de seq 5 (que sí encadena con el hash real de seq 4).
  const filas: FilaCadenaVerifactu[] = [
    { studio_id: 'studio-1', verifactu_seq: 2, numero_completo: 'A-2026-0026', verifactu_hash: 'h2', verifactu_prev_hash: 'h1' },
    { studio_id: 'studio-1', verifactu_seq: 3, numero_completo: 'A-2026-0027', verifactu_hash: 'h3-real', verifactu_prev_hash: 'h2' },
    // Bifurcada: su prev_hash es 'h2' (el mismo que usó seq 3), no 'h3-real'.
    { studio_id: 'studio-1', verifactu_seq: 4, numero_completo: 'A-2026-0028', verifactu_hash: 'h4', verifactu_prev_hash: 'h2' },
    { studio_id: 'studio-1', verifactu_seq: 5, numero_completo: 'A-2026-0029', verifactu_hash: 'h5', verifactu_prev_hash: 'h4' },
  ];
  const roturas = detectarCadenaRotaVerifactu(filas);
  assert.equal(roturas.length, 1);
  assert.deepEqual(roturas[0], {
    studioId: 'studio-1', seqRota: 4, numeroCompleto: 'A-2026-0028',
    seqAnterior: 3, numeroCompletoAnterior: 'A-2026-0027',
  });
});

test('NUNCA compara entre estudios distintos: seq 1 de un estudio nuevo no rompe contra el último del anterior', () => {
  const filas: FilaCadenaVerifactu[] = [
    { studio_id: 'studio-1', verifactu_seq: 1, numero_completo: 'A-1', verifactu_hash: 'h1', verifactu_prev_hash: '' },
    { studio_id: 'studio-1', verifactu_seq: 2, numero_completo: 'A-2', verifactu_hash: 'h2', verifactu_prev_hash: 'h1' },
    // studio-2 arranca su PROPIA cadena; su prev_hash vacío no debe compararse
    // contra `h2` del estudio anterior solo por venir justo después en la lista.
    { studio_id: 'studio-2', verifactu_seq: 1, numero_completo: 'B-1', verifactu_hash: 'x1', verifactu_prev_hash: '' },
  ];
  assert.deepEqual(detectarCadenaRotaVerifactu(filas), []);
});

test('sin filas: [], sin lanzar', () => {
  assert.deepEqual(detectarCadenaRotaVerifactu([]), []);
});
