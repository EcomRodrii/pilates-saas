import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarPorDiaMes, type SesionMes } from './calendario-mes.ts';

function sesion(over: Partial<SesionMes> = {}): SesionMes {
  return {
    id: 's1', fecha: '2026-08-05', confirmadas: 4, aforoMaximo: 10,
    cancelada: false, pideAtencion: false,
    ...over,
  };
}

test('excluye canceladas del recuento y de la ocupación', () => {
  const m = agregarPorDiaMes([
    sesion({ id: 's1', cancelada: false }),
    sesion({ id: 's2', cancelada: true }),
  ]);
  assert.equal(m.get('2026-08-05')?.nClases, 1);
});

test('promedia la ocupación de varias sesiones el mismo día', () => {
  const m = agregarPorDiaMes([
    sesion({ id: 's1', confirmadas: 10, aforoMaximo: 10 }), // 100%
    sesion({ id: 's2', confirmadas: 0, aforoMaximo: 10 }),  // 0%
  ]);
  assert.equal(m.get('2026-08-05')?.ocupacionMedia, 0.5);
});

test('hayAtencion es true si CUALQUIER sesión del día lo pide', () => {
  const m = agregarPorDiaMes([
    sesion({ id: 's1', pideAtencion: false }),
    sesion({ id: 's2', pideAtencion: true }),
  ]);
  assert.equal(m.get('2026-08-05')?.hayAtencion, true);
});

test('hayAtencion es false si ninguna sesión del día lo pide', () => {
  const m = agregarPorDiaMes([sesion({ pideAtencion: false })]);
  assert.equal(m.get('2026-08-05')?.hayAtencion, false);
});

test('un día sin sesiones (todas canceladas) no aparece en el Map', () => {
  const m = agregarPorDiaMes([sesion({ cancelada: true })]);
  assert.equal(m.has('2026-08-05'), false);
});

test('días distintos se agregan por separado', () => {
  const m = agregarPorDiaMes([
    sesion({ id: 's1', fecha: '2026-08-05' }),
    sesion({ id: 's2', fecha: '2026-08-06' }),
  ]);
  assert.equal(m.size, 2);
  assert.equal(m.get('2026-08-05')?.nClases, 1);
  assert.equal(m.get('2026-08-06')?.nClases, 1);
});

test('lista vacía produce un Map vacío', () => {
  const m = agregarPorDiaMes([]);
  assert.equal(m.size, 0);
});
