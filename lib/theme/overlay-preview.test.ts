import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escalaMedida, cajaEnPanel, estaALaVista, huecosDeInsercion,
  type Caja,
} from './overlay-preview.ts';

/** Un iframe de móvil (390 declarado) encogido al 50 %, colocado en el panel. */
const IFRAME: Caja = { x: 300, y: 100, ancho: 195, alto: 422 };
const ESCALA = 0.5;

test('escalaMedida sale de dividir lo pintado entre lo declarado', () => {
  assert.equal(escalaMedida(195, 390), 0.5);
  assert.equal(escalaMedida(390, 390), 1);
});

test('escalaMedida no divide entre cero si el iframe todavía no se ha medido', () => {
  // Al primer render el ancho declarado puede llegar como 0. Devolver
  // Infinity mandaría el overlay a coordenadas absurdas.
  assert.equal(escalaMedida(195, 0), 1);
});

test('⚠️ la caja del iframe NO se vuelve a escalar — el bug clásico', () => {
  // `getBoundingClientRect()` del iframe, medido en el padre, YA viene
  // escalado por el `transform`. Si esta función multiplicara también el
  // origen, un iframe a 300px de la izquierda aparecería a 150.
  const c = cajaEnPanel({ x: 0, y: 0, ancho: 390, alto: 100 }, IFRAME, ESCALA);
  assert.equal(c.x, 300, 'el origen es el del iframe tal cual, sin escalar');
  assert.equal(c.y, 100);
  // Y lo de DENTRO sí se escala: 390 declarados se ven como 195.
  assert.equal(c.ancho, 195);
  assert.equal(c.alto, 50);
});

test('cajaEnPanel desplaza y escala lo de dentro a la vez', () => {
  const c = cajaEnPanel({ x: 20, y: 40, ancho: 350, alto: 200 }, IFRAME, ESCALA);
  assert.deepEqual(c, { x: 310, y: 120, ancho: 175, alto: 100 });
});

test('con escala 1 la conversión es solo un desplazamiento', () => {
  const iframe: Caja = { x: 10, y: 20, ancho: 390, alto: 844 };
  assert.deepEqual(
    cajaEnPanel({ x: 5, y: 7, ancho: 100, alto: 50 }, iframe, 1),
    { x: 15, y: 27, ancho: 100, alto: 50 },
  );
});

test('estaALaVista incluye lo que asoma solo en parte', () => {
  // Mitad por arriba: se ve.
  assert.equal(estaALaVista({ x: 0, y: 60, ancho: 10, alto: 60 }, IFRAME), true);
  // Justo encima del borde: no.
  assert.equal(estaALaVista({ x: 0, y: 0, ancho: 10, alto: 50 }, IFRAME), false);
  // Por debajo del borde inferior: no.
  assert.equal(estaALaVista({ x: 0, y: 600, ancho: 10, alto: 20 }, IFRAME), false);
});

test('N bloques dan N+1 huecos: también antes del primero y tras el último', () => {
  const bloques = [
    { id: 'a', caja: { x: 0, y: 0, ancho: 390, alto: 200 } },
    { id: 'b', caja: { x: 0, y: 200, ancho: 390, alto: 200 } },
  ];
  const h = huecosDeInsercion(bloques, IFRAME, ESCALA);
  assert.deepEqual(h.map((x) => x.indice), [0, 1, 2]);
  // Sin el hueco 0 no se podría poner nada ENCIMA del primer bloque, que es
  // justo donde una propietaria quiere su banner de bienvenida.
  assert.equal(h[0].y, 100);
  assert.equal(h[1].y, 200); // 100 + 200*0.5
  assert.equal(h[2].y, 300);
});

test('los huecos que el scroll ha sacado del marco se descartan', () => {
  // Un bloque muy por debajo del alto visible: su "+" caería fuera del
  // marco, encima de lo que haya ahí. Mejor no pintarlo.
  const bloques = [
    { id: 'a', caja: { x: 0, y: 0, ancho: 390, alto: 100 } },
    { id: 'lejos', caja: { x: 0, y: 2_000, ancho: 390, alto: 100 } },
  ];
  const h = huecosDeInsercion(bloques, IFRAME, ESCALA);
  assert.deepEqual(h.map((x) => x.indice), [0, 1]);
});

test('sin bloques no hay ningún hueco — ni siquiera el 0', () => {
  // Una pantalla vacía se resuelve con el botón "Añadir bloque" del rail, no
  // con un "+" flotando sobre la nada.
  assert.deepEqual(huecosDeInsercion([], IFRAME, ESCALA), []);
});

test('el ancho del "+" sigue al del bloque, ya escalado', () => {
  const h = huecosDeInsercion(
    [{ id: 'a', caja: { x: 20, y: 0, ancho: 350, alto: 100 } }],
    IFRAME, ESCALA,
  );
  assert.equal(h[0].ancho, 175);
  assert.equal(h[0].x, 310);
});
