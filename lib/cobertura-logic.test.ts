import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatosCobertura } from './cobertura-logic.ts';

const instructores = [
  { id: 'orig', nombre: 'Original', telefono: '600111111', activo: true },
  { id: 'a', nombre: 'Ana', telefono: '600222222', activo: true },
  { id: 'b', nombre: 'Berta', telefono: null, activo: true },
  { id: 'c', nombre: 'Carla (inactiva)', telefono: '600444444', activo: false },
];

const SESION = { instructorId: 'orig', tipoClaseId: 'mat', inicio: '2026-01-01T10:00:00' };

test('ordena por veces impartida descendente, excluye a la instructora original', () => {
  const sesiones = [
    { instructorId: 'orig', tipoClaseId: 'mat', cancelada: false, inicio: '2026-01-01T10:00:00', fin: '2026-01-01T11:00:00' },
    { instructorId: 'a', tipoClaseId: 'mat', cancelada: false, inicio: '2026-01-01T08:00:00', fin: '2026-01-01T09:00:00' },
    { instructorId: 'a', tipoClaseId: 'mat', cancelada: false, inicio: '2026-01-02T08:00:00', fin: '2026-01-02T09:00:00' },
    { instructorId: 'b', tipoClaseId: 'mat', cancelada: false, inicio: '2026-01-01T08:00:00', fin: '2026-01-01T09:00:00' },
  ];
  const r = candidatosCobertura(SESION, sesiones, instructores);
  assert.equal(r.length, 2); // excluye 'orig' y a la inactiva 'c'
  assert.equal(r[0].instructorId, 'a');
  assert.equal(r[0].vecesImpartida, 2);
  assert.equal(r[1].instructorId, 'b');
  assert.equal(r[1].vecesImpartida, 1);
});

test('incluye instructoras sin historial de esa clase con conteo 0', () => {
  const r = candidatosCobertura({ instructorId: 'orig', tipoClaseId: 'reformer', inicio: '2026-01-01T10:00:00' }, [], instructores);
  assert.equal(r.length, 2);
  assert.ok(r.every(c => c.vecesImpartida === 0));
});

test('ignora sesiones canceladas y de otro tipo de clase al contar', () => {
  const sesiones = [
    { instructorId: 'a', tipoClaseId: 'mat', cancelada: true, inicio: '2026-01-01T08:00:00', fin: '2026-01-01T09:00:00' },
    { instructorId: 'a', tipoClaseId: 'reformer', cancelada: false, inicio: '2026-01-01T08:00:00', fin: '2026-01-01T09:00:00' },
  ];
  const r = candidatosCobertura(SESION, sesiones, instructores);
  const ana = r.find(c => c.instructorId === 'a')!;
  assert.equal(ana.vecesImpartida, 0);
});

test('excluye instructoras inactivas de la lista de candidatas', () => {
  const r = candidatosCobertura(SESION, [], instructores);
  assert.ok(!r.some(c => c.instructorId === 'c'));
});

test('excluye a las marcadas como no disponibles (ausentes ese día u ocupadas en la franja)', () => {
  const noDisp = new Set(['a']); // Ana está de vacaciones o ya tiene otra clase que solapa
  const r = candidatosCobertura(SESION, [], instructores, noDisp);
  assert.ok(!r.some(c => c.instructorId === 'a'), 'no debe proponer a una no disponible');
  assert.ok(r.some(c => c.instructorId === 'b'), 'las demás siguen disponibles');
});

// ── otrasClasesHoy (P2, auditoría "Veredicto de Marta") ─────────────────────

test('otrasClasesHoy: enseña el resto de clases de la candidata ESE MISMO día, ordenadas', () => {
  const sesiones = [
    { instructorId: 'a', tipoClaseId: 'reformer', cancelada: false, inicio: '2026-01-01T17:00:00', fin: '2026-01-01T18:00:00' },
    { instructorId: 'a', tipoClaseId: 'reformer', cancelada: false, inicio: '2026-01-01T08:00:00', fin: '2026-01-01T09:00:00' },
  ];
  const r = candidatosCobertura(SESION, sesiones, instructores);
  const ana = r.find(c => c.instructorId === 'a')!;
  assert.deepEqual(ana.otrasClasesHoy.map(x => x.inicio), ['2026-01-01T08:00:00', '2026-01-01T17:00:00']);
});

test('otrasClasesHoy: no incluye clases de OTRO día ni canceladas ni la propia sesión a cubrir', () => {
  const sesionConId = { ...SESION, id: 'ses-a-cubrir' };
  const sesiones = [
    { id: 'ses-a-cubrir', instructorId: 'orig', tipoClaseId: 'mat', cancelada: false, inicio: '2026-01-01T10:00:00', fin: '2026-01-01T11:00:00' },
    { id: 'otro-dia', instructorId: 'a', tipoClaseId: 'reformer', cancelada: false, inicio: '2026-01-02T08:00:00', fin: '2026-01-02T09:00:00' },
    { id: 'cancelada', instructorId: 'a', tipoClaseId: 'reformer', cancelada: true, inicio: '2026-01-01T08:00:00', fin: '2026-01-01T09:00:00' },
  ];
  const r = candidatosCobertura(sesionConId, sesiones, instructores);
  const ana = r.find(c => c.instructorId === 'a')!;
  assert.equal(ana.otrasClasesHoy.length, 0);
});

test('otrasClasesHoy: vacío cuando la candidata no tiene nada más ese día (libre todo el día)', () => {
  const r = candidatosCobertura(SESION, [], instructores);
  assert.ok(r.every(c => c.otrasClasesHoy.length === 0));
});
