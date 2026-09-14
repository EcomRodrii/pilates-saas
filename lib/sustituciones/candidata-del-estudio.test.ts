import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidataDelEstudio } from './candidata-del-estudio.ts';

type Fila = { id: string; nombre: string | null; activo: boolean | null; studio_id: string };

// Simula `instructores` con los filtros de verdad: si la consulta se olvidara
// del `studio_id`, la ficha de otro estudio aparecería y el test lo cazaría.
function fakeAdmin(filas: Fila[], opciones: { error?: boolean } = {}) {
  const filtros: [string, unknown][] = [];
  const admin = {
    from(tabla: string) {
      assert.equal(tabla, 'instructores');
      const c = {
        select() { return c; },
        eq(campo: string, valor: unknown) { filtros.push([campo, valor]); return c; },
        maybeSingle() {
          if (opciones.error) return Promise.resolve({ data: null, error: { message: 'boom' } });
          const fila = filas.find(f => filtros.every(([k, v]) => (f as Record<string, unknown>)[k] === v));
          return Promise.resolve({ data: fila ?? null, error: null });
        },
      };
      return c;
    },
  };
  return { admin: admin as never, filtros };
}

const FILAS: Fila[] = [
  { id: 'ins-a', nombre: 'Ana', activo: true, studio_id: 'studio-a' },
  { id: 'ins-b', nombre: 'Bea', activo: true, studio_id: 'studio-b' },
  { id: 'ins-baja', nombre: 'Carla', activo: false, studio_id: 'studio-a' },
  { id: 'ins-null', nombre: 'Dora', activo: null, studio_id: 'studio-a' },
];

test('ficha activa del mismo estudio: la devuelve con su nombre', async () => {
  const { admin, filtros } = fakeAdmin(FILAS);
  assert.deepEqual(await candidataDelEstudio(admin, 'ins-a', 'studio-a'), { id: 'ins-a', nombre: 'Ana' });
  assert.deepEqual(filtros, [['id', 'ins-a'], ['studio_id', 'studio-a']]);
});

test('ficha de OTRO estudio: null (no se puede confirmar)', async () => {
  const { admin } = fakeAdmin(FILAS);
  assert.equal(await candidataDelEstudio(admin, 'ins-b', 'studio-a'), null);
});

test('ficha dada de baja: null', async () => {
  const { admin } = fakeAdmin(FILAS);
  assert.equal(await candidataDelEstudio(admin, 'ins-baja', 'studio-a'), null);
});

test('activo NULL cuenta como activa, igual que coalesce(activo, true)', async () => {
  const { admin } = fakeAdmin(FILAS);
  assert.deepEqual(await candidataDelEstudio(admin, 'ins-null', 'studio-a'), { id: 'ins-null', nombre: 'Dora' });
});

test('id inexistente o error de BD: null, nunca se da por buena', async () => {
  assert.equal(await candidataDelEstudio(fakeAdmin(FILAS).admin, 'ins-x', 'studio-a'), null);
  assert.equal(await candidataDelEstudio(fakeAdmin(FILAS, { error: true }).admin, 'ins-a', 'studio-a'), null);
});
