import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNombrePlan, planesSinCasar, aplicarMapeoPlanes } from './planes.ts';

// El importador de membresías casa por NOMBRE. Funciona si el estudio llega
// vacío y copia los nombres del software viejo — que es como se probó. Con un
// estudio que YA tiene su catálogo montado no casaba NADA: Momence exporta
// "10 Class Pack" y en Tentare esa tarifa se llama "Bono 10 Reformer". Todas
// las filas fallaban y no había dónde decir que son la misma.

const CATALOGO = [
  { id: 'p1', nombre: 'Bono 10 Reformer' },
  { id: 'p2', nombre: 'Mensual ilimitado' },
];

test('normalizar ignora mayúsculas, acentos y espacios de sobra', () => {
  const base = normalizarNombrePlan('Bono 10 Sesiones');
  assert.equal(normalizarNombrePlan('BONO 10 SESIONES'), base);
  assert.equal(normalizarNombrePlan('Bono 10 Sesiónes'), base);
  assert.equal(normalizarNombrePlan('  Bono 10 Sesiones  '), base);
  // El interior también: un doble espacio de un copy-paste no puede tumbar la fila.
  assert.equal(normalizarNombrePlan('Bono  10   Sesiones'), base);
});

test('pero no ignora lo que de verdad distingue una tarifa de otra', () => {
  assert.notEqual(normalizarNombrePlan('Bono 10 Reformer'), normalizarNombrePlan('Bono 10 Mat'));
  assert.notEqual(normalizarNombrePlan('Bono 10'), normalizarNombrePlan('Bono 20'));
});

test('los planes que no existen se listan con cuántas filas arrastran', () => {
  const filas = [
    { plan: '10 Class Pack' }, { plan: '10 Class Pack' }, { plan: '10 Class Pack' },
    { plan: 'Monthly Unlimited' },
    { plan: 'Bono 10 Reformer' }, // este SÍ existe
  ];
  const p = planesSinCasar(filas, CATALOGO);
  // Ordenados por impacto: primero el que salva más filas.
  assert.deepEqual(p.map(x => [x.nombre, x.filas]), [['10 Class Pack', 3], ['Monthly Unlimited', 1]]);
});

test('un plan ya emparejado deja de aparecer como pendiente', () => {
  const filas = [{ plan: '10 Class Pack' }, { plan: 'Monthly Unlimited' }];
  const mapeo = { [normalizarNombrePlan('10 Class Pack')]: 'p1' };
  assert.deepEqual(planesSinCasar(filas, CATALOGO, mapeo).map(x => x.nombre), ['Monthly Unlimited']);
});

test('las filas sin plan no cuentan como plan desconocido', () => {
  assert.deepEqual(planesSinCasar([{ plan: '' }, { plan: null }, {}], CATALOGO), []);
});

test('aplicar el mapeo pone el nombre real de la tarifa', () => {
  // El servidor sigue casando por nombre: basta con dejar puesto el suyo.
  const filas = [{ plan: '10 Class Pack', email: 'a@b.com' }];
  const out = aplicarMapeoPlanes(filas, { [normalizarNombrePlan('10 Class Pack')]: 'p1' }, CATALOGO);
  assert.equal(out[0].plan, 'Bono 10 Reformer');
  assert.equal(out[0].email, 'a@b.com', 'no toca el resto de la fila');
});

test('mapear a "no importar" descarta esas filas antes de mandarlas', () => {
  // Más honesto que mandarlas para que el servidor las rechace y salgan como
  // incidencias en el acta: la dueña ya dijo que no las quería.
  const filas = [{ plan: 'Drop-in' }, { plan: 'Bono 10 Reformer' }];
  const out = aplicarMapeoPlanes(filas, { [normalizarNombrePlan('Drop-in')]: '' }, CATALOGO);
  assert.deepEqual(out.map(f => f.plan), ['Bono 10 Reformer']);
});

test('sin mapeo no se toca nada', () => {
  const filas = [{ plan: '10 Class Pack' }];
  assert.deepEqual(aplicarMapeoPlanes(filas, {}, CATALOGO), filas);
});

test('un plan que no está en el mapeo pasa tal cual', () => {
  // Que el servidor lo rechace y salga en el acta: aquí no se adivina.
  const filas = [{ plan: 'Otro' }];
  const out = aplicarMapeoPlanes(filas, { [normalizarNombrePlan('10 Class Pack')]: 'p1' }, CATALOGO);
  assert.equal(out[0].plan, 'Otro');
});

test('el caso de Cloe entero: catálogo propio + export de Momence', () => {
  // Su estudio ya tiene las tarifas montadas en español. El CSV viene en inglés.
  // Antes: 0 de 4 filas importables. Ahora: empareja y entran.
  const filas = [
    { email: 'a@x.com', plan: '10 Class Pack' },
    { email: 'b@x.com', plan: '10 Class Pack' },
    { email: 'c@x.com', plan: 'Monthly Unlimited' },
    { email: 'd@x.com', plan: 'Drop-in' }, // esta no la quiere traer
  ];
  const pendientes = planesSinCasar(filas, CATALOGO);
  assert.equal(pendientes.length, 3, 'los tres nombres ingleses salen a decidir');

  const mapeo = {
    [normalizarNombrePlan('10 Class Pack')]: 'p1',
    [normalizarNombrePlan('Monthly Unlimited')]: 'p2',
    [normalizarNombrePlan('Drop-in')]: '',
  };
  assert.deepEqual(planesSinCasar(filas, CATALOGO, mapeo), [], 'ya no queda nada pendiente');

  const out = aplicarMapeoPlanes(filas, mapeo, CATALOGO);
  assert.deepEqual(out.map(f => f.plan), ['Bono 10 Reformer', 'Bono 10 Reformer', 'Mensual ilimitado']);
});
