import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiarDeSede, sedeDesfasada, CLAVE_CAMBIO_GLOBAL, CLAVE_CAMBIO_SEDE } from './cambio-de-sede.ts';

function entorno(guardaOk: boolean) {
  const sesion = new Map<string, string>();
  const local = new Map<string, string>();
  const visitas: string[] = [];
  const guardados: [string, string][] = [];
  return {
    sesion, local, visitas, guardados,
    e: {
      guardar: async (u: string, s: string) => { guardados.push([u, s]); return guardaOk; },
      sesion: { setItem: (k: string, v: string) => void sesion.set(k, v) },
      local: { setItem: (k: string, v: string) => void local.set(k, v) },
      ir: (url: string) => void visitas.push(url),
      ahora: () => 1000,
    },
  };
}

test('cambiar de sede avisa a las demás pestañas y recarga, desde cualquier sitio', async () => {
  const t = entorno(true);
  assert.equal(await cambiarDeSede(t.e, 'u1', 'sede-b', 'Sede Centro'), true);
  assert.deepEqual(t.guardados, [['u1', 'sede-b']]);
  assert.equal(t.local.get(CLAVE_CAMBIO_GLOBAL), 'sede-b:1000');
  assert.equal(t.sesion.get(CLAVE_CAMBIO_SEDE), 'Sede Centro');
  assert.deepEqual(t.visitas, ['/dashboard']);
});

test('si no se pudo guardar, ni avisa ni recarga: la pantalla no puede ir por delante del servidor', async () => {
  const t = entorno(false);
  assert.equal(await cambiarDeSede(t.e, 'u1', 'sede-b', 'Sede Centro'), false);
  assert.equal(t.local.size, 0);
  assert.equal(t.visitas.length, 0);
});

test('sin almacenamiento (modo privado) cambia igual', async () => {
  const t = entorno(true);
  const e = { ...t.e, sesion: { setItem: () => { throw new Error('privado'); } }, local: null };
  assert.equal(await cambiarDeSede(e, 'u1', 'sede-b', 'x'), true);
  assert.deepEqual(t.visitas, ['/dashboard']);
});

test('desfase: solo con dos respuestas claras y distintas', () => {
  assert.equal(sedeDesfasada('sede-a', 'sede-b'), true);
  assert.equal(sedeDesfasada('sede-a', 'sede-a'), false);
  assert.equal(sedeDesfasada('sede-a', null), false); // fallo o sin sede: no recargar en bucle
  assert.equal(sedeDesfasada(undefined, 'sede-b'), false);
});
