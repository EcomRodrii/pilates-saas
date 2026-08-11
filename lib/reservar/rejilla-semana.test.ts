import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoPlazas, franjasConClases, haySaltoAntesDe, celdaDe, LEYENDA, UMBRAL_ULTIMAS,
} from './rejilla-semana.ts';

test('una clase con sitio de sobra está disponible', () => {
  assert.equal(estadoPlazas({ ocupadas: 2, aforoMaximo: 8 }), 'disponible');
});

test('«últimas plazas» avisa ANTES de llenarse, no al llenarse', () => {
  // El aviso solo sirve si llega a tiempo de que alguien reaccione.
  assert.equal(estadoPlazas({ ocupadas: 6, aforoMaximo: 8 }), 'ultimas');
  assert.equal(estadoPlazas({ ocupadas: 7, aforoMaximo: 8 }), 'ultimas');
  assert.equal(estadoPlazas({ ocupadas: 8 - UMBRAL_ULTIMAS - 1, aforoMaximo: 8 }), 'disponible');
});

test('llena es «lista de espera» o «completa» según lo que permita el estudio', () => {
  // ⚠️ La diferencia importa: con lista de espera SÍ puedes hacer algo, y
  // pintarlo como «completa» convierte una clase reservable en un callejón sin
  // salida. El diseño les da dos colores distintos justo por esto.
  assert.equal(estadoPlazas({ ocupadas: 8, aforoMaximo: 8, permiteListaEspera: true }), 'lista-espera');
  assert.equal(estadoPlazas({ ocupadas: 8, aforoMaximo: 8, permiteListaEspera: false }), 'completa');
  assert.equal(estadoPlazas({ ocupadas: 8, aforoMaximo: 8 }), 'completa');
});

test('sobreaforo (más reservas que plazas) no se lee como que queda sitio', () => {
  // Pasa de verdad: staff que añade a mano por encima del aforo.
  assert.equal(estadoPlazas({ ocupadas: 10, aforoMaximo: 8 }), 'completa');
  assert.equal(estadoPlazas({ ocupadas: 10, aforoMaximo: 8, permiteListaEspera: true }), 'lista-espera');
});

test('un aforo sin fijar es «completa», nunca plazas infinitas', () => {
  // Ofrecer reservar sobre un aforo 0 acaba en un error del servidor delante de
  // la clienta. Mejor no ofrecerlo.
  assert.equal(estadoPlazas({ ocupadas: 0, aforoMaximo: 0 }), 'completa');
  assert.equal(estadoPlazas({ ocupadas: 0, aforoMaximo: -1 }), 'completa');
});

test('solo hay fila para las horas que tienen clase, y ordenadas', () => {
  const franjas = franjasConClases([
    { id: 'c', inicio: '2026-08-12T18:00:00' },
    { id: 'a', inicio: '2026-08-12T09:00:00' },
    { id: 'b', inicio: '2026-08-13T09:30:00' },
  ]);
  // Las 09:00 aparecen UNA vez aunque haya dos clases, y 10..17 no existen.
  assert.deepEqual(franjas, [9, 18]);
});

test('una fecha rota no inventa una fila', () => {
  assert.deepEqual(franjasConClases([{ id: 'x', inicio: 'no-es-una-fecha' }]), []);
});

test('el salto de horas se detecta para poder marcarlo', () => {
  // 8, 9, 10 … 17: el corte entre mañana y tarde no puede parecer una fila más.
  const franjas = [8, 9, 10, 17, 18];
  assert.equal(haySaltoAntesDe(franjas, 0), false);
  assert.equal(haySaltoAntesDe(franjas, 1), false);
  assert.equal(haySaltoAntesDe(franjas, 3), true);
  assert.equal(haySaltoAntesDe(franjas, 4), false);
});

test('la semana empieza en lunes, no en domingo', () => {
  // `getDay()` es 0=domingo. Sin corregirlo, el domingo se pinta el primero y
  // toda la rejilla queda desplazada una columna.
  assert.equal(celdaDe('2026-08-10T09:00:00')?.diaSemana, 0); // lunes
  assert.equal(celdaDe('2026-08-16T09:00:00')?.diaSemana, 6); // domingo
  assert.equal(celdaDe('2026-08-12T18:30:00')?.hora, 18);
  assert.equal(celdaDe('roto'), null);
});

test('la leyenda cubre exactamente los cuatro estados, sin repetir', () => {
  const estados = LEYENDA.map((l) => l.estado);
  assert.equal(new Set(estados).size, 4);
  // Un estado que se pinte y no se explique deja a la clienta adivinando el
  // color; uno que se explique y no exista es ruido.
  assert.deepEqual([...estados].sort(), ['completa', 'disponible', 'lista-espera', 'ultimas']);
});
