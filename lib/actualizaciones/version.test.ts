import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarFiltro, categoriaDeVersion, filtroDeEtiqueta, recuentoPorFiltro,
  esReciente, DIAS_RECIENTE, type VersionPublicada,
} from './version.ts';

const v = (id: string, fecha: string, etiquetas: string[]): VersionPublicada => ({
  id, version: '0.1', titulo: `Versión ${id}`, fecha_publicacion: fecha,
  cambios: etiquetas.map((e, i) => ({ etiqueta: e as never, texto: `cambio ${i}`, orden: i })),
});

test('RENDIMIENTO cuenta como mejora: «va más rápido» no es una categoría aparte', () => {
  assert.equal(filtroDeEtiqueta('RENDIMIENTO'), 'mejoras');
  assert.equal(filtroDeEtiqueta('MEJORA'), 'mejoras');
  assert.equal(filtroDeEtiqueta('NUEVA_FUNCIONALIDAD'), 'nuevas');
  assert.equal(filtroDeEtiqueta('ARREGLO'), 'correcciones');
});

// En producción 8 de 11 versiones mezclan ARREGLO con NUEVA_FUNCIONALIDAD, así
// que el desempate no es un caso raro: es el caso normal.
test('manda lo nuevo cuando la versión mezcla', () => {
  assert.equal(categoriaDeVersion(v('a', '2026-09-07', ['ARREGLO', 'NUEVA_FUNCIONALIDAD']).cambios), 'nuevas');
});

test('sin nada nuevo manda la mejora', () => {
  assert.equal(categoriaDeVersion(v('a', '2026-09-07', ['ARREGLO', 'RENDIMIENTO']).cambios), 'mejoras');
});

// Una versión de solo arreglos anunciada como «novedad» es una promesa vacía.
test('solo arreglos se dice que son arreglos', () => {
  assert.equal(categoriaDeVersion(v('a', '2026-09-07', ['ARREGLO', 'ARREGLO']).cambios), 'correcciones');
});

// ⚠️ Lo que de verdad hace que el filtro filtre: recorta los CAMBIOS, no solo
// esconde versiones. Sin esto, al pedir «Correcciones» una versión seguiría
// enseñando sus funciones nuevas.
test('el filtro recorta los cambios dentro de cada versión', () => {
  const r = aplicarFiltro([v('a', '2026-09-07', ['NUEVA_FUNCIONALIDAD', 'ARREGLO', 'ARREGLO'])], 'correcciones');
  assert.equal(r.length, 1);
  assert.equal(r[0].cambios.length, 2);
  assert.ok(r[0].cambios.every((c) => c.etiqueta === 'ARREGLO'));
});

test('una versión sin nada del tipo pedido desaparece', () => {
  const r = aplicarFiltro([v('a', '2026-09-07', ['ARREGLO'])], 'nuevas');
  assert.deepEqual(r, []);
});

test('«todas» no toca nada', () => {
  const lista = [v('a', '2026-09-07', ['ARREGLO', 'MEJORA'])];
  assert.deepEqual(aplicarFiltro(lista, 'todas'), lista);
});

test('el filtro no muta la lista original', () => {
  const lista = [v('a', '2026-09-07', ['NUEVA_FUNCIONALIDAD', 'ARREGLO'])];
  aplicarFiltro(lista, 'nuevas');
  assert.equal(lista[0].cambios.length, 2, 'la lista de origen se ha modificado');
});

test('el recuento reparte las cuatro etiquetas en tres cajones', () => {
  const c = recuentoPorFiltro(v('a', '2026-09-07', ['NUEVA_FUNCIONALIDAD', 'MEJORA', 'RENDIMIENTO', 'ARREGLO']).cambios);
  assert.deepEqual(c, { nuevas: 1, mejoras: 2, correcciones: 1 });
});

// ─── «Nueva» ────────────────────────────────────────────────────────────────

const AHORA = new Date('2026-09-10T12:00:00').getTime();

test('reciente: dentro de la ventana sí, fuera no', () => {
  assert.equal(esReciente('2026-09-07', AHORA), true);
  assert.equal(esReciente('2026-08-01', AHORA), false);
});

// Se cuenta por DÍAS: publicada hace 14 días sigue siendo reciente todo ese
// día, y deja de serlo al día siguiente. Con instantes se apagaba a mediodía.
test('el último día de la ventana cuenta entero, y el siguiente ya no', () => {
  assert.equal(esReciente('2026-08-27', AHORA), true);  // 14 días
  assert.equal(esReciente('2026-08-26', AHORA), false); // 15 días
  // Esas dos fechas SALEN de la constante. Clavada aquí para que cambiarla no
  // deje un test que sigue en verde comprobando un límite que ya no es el
  // límite: si alguien pone 21 días, este test tiene que rehacerse, no borrarse.
  assert.equal(DIAS_RECIENTE, 14);
});

// ⚠️ `null` es «todavía no hay reloj» (el servidor no sabe qué día es), no «hace
// mucho». Pintar el distintivo en SSR daría un desajuste de hidratación.
test('sin reloj no se marca nada como nuevo', () => {
  assert.equal(esReciente('2026-09-07', null), false);
});

test('una fecha futura no se marca como reciente', () => {
  assert.equal(esReciente('2027-01-01', AHORA), false);
});

test('una fecha inválida no revienta ni marca', () => {
  assert.equal(esReciente('vaya-fecha', AHORA), false);
});
