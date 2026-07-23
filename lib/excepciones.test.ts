import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SocioExcepcion } from '@/lib/types';
import { tieneExcepcion, sociosConExcepcion } from './excepciones.ts';

function exc(p: Partial<SocioExcepcion> & Pick<SocioExcepcion, 'socioId' | 'tipo'>): SocioExcepcion {
  return { id: 'e1', studioId: 'st', motivo: null, creadaEn: '2026-07-23T00:00:00Z', ...p };
}

test('tieneExcepcion: cierto solo para la socia + tipo exactos', () => {
  const e = [exc({ socioId: 'a', tipo: 'SIN_AVISO_HUECO' })];
  assert.equal(tieneExcepcion(e, 'a', 'SIN_AVISO_HUECO'), true);
  assert.equal(tieneExcepcion(e, 'a', 'SIN_RECORDATORIO'), false);
  assert.equal(tieneExcepcion(e, 'b', 'SIN_AVISO_HUECO'), false);
});

test('sociosConExcepcion: set con las socias del tipo pedido', () => {
  const e = [
    exc({ socioId: 'a', tipo: 'SIN_RECORDATORIO' }),
    exc({ socioId: 'b', tipo: 'SIN_RECORDATORIO' }),
    exc({ socioId: 'c', tipo: 'SIN_AVISO_HUECO' }),
  ];
  const set = sociosConExcepcion(e, 'SIN_RECORDATORIO');
  assert.deepEqual([...set].sort(), ['a', 'b']);
  assert.ok(!set.has('c'));
});

test('sociosConExcepcion: vacío si no hay ninguna del tipo', () => {
  assert.equal(sociosConExcepcion([], 'SIN_AVISO_HUECO').size, 0);
});
