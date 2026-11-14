import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { crearRegistroDeBusquedas, ESPERA_MS } from './registrar-busqueda.ts';

test('avisa una vez, cuando la persona deja de teclear, y solo si no hay resultados', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const enviados: string[] = [];
    const r = crearRegistroDeBusquedas(t => enviados.push(t));
    // Teclea «bsport importar» letra a letra: ningún intermedio se envía.
    for (const parcial of ['bsp', 'bspo', 'bspor', 'bsport', 'bsport i', 'bsport importar']) { r.cambio(parcial, 0); mock.timers.tick(300); }
    assert.deepEqual(enviados, []);
    mock.timers.tick(ESPERA_MS);
    assert.deepEqual(enviados, ['bsport importar']);
    // La misma búsqueda otra vez en la misma visita: no se cuenta dos veces.
    r.cambio('Bsport importar', 0); mock.timers.tick(ESPERA_MS * 2);
    assert.deepEqual(enviados, ['bsport importar']);
  } finally { mock.timers.reset(); }
});

test('con resultados, con menos de tres letras o cancelada: no se avisa de nada', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const enviados: string[] = [];
    const r = crearRegistroDeBusquedas(t => enviados.push(t));
    r.cambio('stripe', 4); mock.timers.tick(ESPERA_MS * 2);
    r.cambio('ab', 0); mock.timers.tick(ESPERA_MS * 2);
    r.cambio('algo raro', 0); r.cancelar(); mock.timers.tick(ESPERA_MS * 2);
    // Si aparecen resultados antes de que venza la espera (siguió tecleando), se cancela.
    r.cambio('bono cadu', 0); mock.timers.tick(500); r.cambio('bono caducidad', 1); mock.timers.tick(ESPERA_MS * 2);
    assert.deepEqual(enviados, []);
  } finally { mock.timers.reset(); }
});
