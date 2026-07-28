import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCola } from './sentry-cola.ts';

// Estos tests ejecutan EL MISMO código que corre en producción (por eso la cola
// vive separada del módulo que hace el import dinámico). Lo que protegen: que
// una captura anterior a la carga del SDK no se pierda. Si eso se rompe no se ve
// nada raro en pantalla — simplemente dejas de enterarte de los errores del
// arranque, que son los peores de perder.

function espia() {
  const vistas: { metodo: string; args: unknown[] }[] = [];
  const destino: Record<string, unknown> = {
    captureException: (...args: unknown[]) => vistas.push({ metodo: 'captureException', args }),
    captureMessage: (...args: unknown[]) => vistas.push({ metodo: 'captureMessage', args }),
    setUser: (...args: unknown[]) => vistas.push({ metodo: 'setUser', args }),
    setTag: (...args: unknown[]) => vistas.push({ metodo: 'setTag', args }),
  };
  return { destino, vistas };
}

test('un error anterior a la carga del SDK no se pierde', () => {
  const cola = crearCola();
  const { destino, vistas } = espia();

  cola.pedir('captureException', [new Error('boom en el arranque')]);
  assert.equal(vistas.length, 0, 'sin SDK no puede haber salido nada');
  assert.equal(cola.pendientes, 1, 'pero tiene que estar guardado');

  cola.conectar(destino);
  assert.equal(vistas.length, 1);
  assert.equal((vistas[0].args[0] as Error).message, 'boom en el arranque');
  assert.equal(cola.pendientes, 0);
});

test('se vuelca EN ORDEN: setUser y setTag antes del error que los usa', () => {
  const cola = crearCola();
  const { destino, vistas } = espia();

  // El orden real del arranque: auth-context identifica, studio-context etiqueta
  // y sólo después falla algo. Desordenado, el error llegaría a Sentry sin
  // usuario ni estudio — justo los dos datos para los que existen.
  cola.pedir('setUser', [{ id: 'u-1' }]);
  cola.pedir('setTag', ['studio_id', 'studio-9']);
  cola.pedir('captureException', [new Error('fallo al guardar')]);

  cola.conectar(destino);
  assert.deepEqual(vistas.map(v => v.metodo), ['setUser', 'setTag', 'captureException']);
  assert.deepEqual(vistas[0].args[0], { id: 'u-1' });
  assert.deepEqual(vistas[1].args, ['studio_id', 'studio-9']);
});

test('ya conectada, las capturas van directas y no se encolan', () => {
  const cola = crearCola();
  const { destino, vistas } = espia();

  cola.conectar(destino);
  assert.equal(cola.conectada, true);
  cola.pedir('captureMessage', ['después', 'warning']);
  assert.equal(vistas.length, 1);
  assert.equal(cola.pendientes, 0);
});

test('un bucle de errores no se come la memoria: hay tope, y se sabe qué se perdió', () => {
  const cola = crearCola(3);
  const { destino, vistas } = espia();

  for (let i = 0; i < 10; i++) cola.pedir('captureException', [new Error(`e${i}`)]);
  assert.equal(cola.pendientes, 3, 'no puede crecer sin límite');
  assert.equal(cola.descartadas, 7, 'y no se ocultan las que caen');

  cola.conectar(destino);
  assert.equal(vistas.length, 3);
  // Sobreviven las PRIMERAS: explican el fallo original. Las siguientes suelen
  // ser su consecuencia.
  assert.equal((vistas[0].args[0] as Error).message, 'e0');
});

test('un método que el SDK no tiene se ignora, no revienta el volcado', () => {
  const cola = crearCola();
  const { destino, vistas } = espia();

  cola.pedir('metodoQueNoExiste', ['x']);
  cola.pedir('captureException', [new Error('sí existe')]);

  assert.doesNotThrow(() => cola.conectar(destino));
  assert.equal(vistas.length, 1, 'el desconocido se salta, el bueno sale igual');
});

test('lo que se pide DURANTE el volcado también sale', () => {
  const cola = crearCola();
  const vistas: string[] = [];
  const destino: Record<string, unknown> = {
    setUser: () => { vistas.push('setUser'); cola.pedir('captureMessage', ['reentrante']); },
    captureMessage: (m: unknown) => vistas.push(`captureMessage:${m}`),
  };

  cola.pedir('setUser', [{ id: 'u-1' }]);
  cola.conectar(destino);
  assert.deepEqual(vistas, ['setUser', 'captureMessage:reentrante']);
  assert.equal(cola.pendientes, 0, 'no puede quedarse nada colgado tras conectar');
});
