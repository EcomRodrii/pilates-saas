import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalisisCapacidad } from './capacidad.ts';
import type { EtapaVista } from './etapas.ts';
import { detectarAlertas, type EntradaAlertas } from './alertas.ts';

const analisis = (p: Partial<AnalisisCapacidad>): AnalisisCapacidad => ({
  ventana: { desde: '', hasta: '', dias: 42 },
  capacidadPublicada: 100, sesionesEnVentana: 10, demandaComprometida: 50,
  desglose: { OBSERVADA: { suscripciones: 0, plazas: 0 }, ESTIMADA_POR_PLAN: { suscripciones: 0, plazas: 0 } },
  estimadasPorMotivo: { TOPE_PLAN: 0, SIN_TOPE: 0, BONO: 0, PUNTUAL: 0 },
  demandaPotencial: 0, leads: 0, ocupacionPrevista: 0.5, riesgo: 'VERDE', ...p,
});
const entrada = (p: Partial<EntradaAlertas>): EntradaAlertas => ({
  diasHastaApertura: 30, analisis: analisis({}), etapas: [], planActivo: new Map(), objetivoPreventa: 0.4, ...p,
});
const tipos = (p: Partial<EntradaAlertas>) => detectarAlertas(entrada(p)).map(a => a.tipo);

test('todo en orden: ninguna alerta (no se avisa por avisar)', () => {
  assert.deepEqual(tipos({}), []);
});

test('sin horario a 3 semanas o menos de abrir: crítica, con los días', () => {
  const [a] = detectarAlertas(entrada({ diasHastaApertura: 10, analisis: analisis({ capacidadPublicada: 0, ocupacionPrevista: null, riesgo: 'SIN_OFERTA' }) }));
  assert.equal(a.tipo, 'SIN_HORARIO');
  assert.equal(a.severidad, 'CRITICA');
  assert.match(a.descripcion, /Abres en 10 días/);
  assert.equal(a.href, '/calendario');
});

test('sin horario a más de 3 semanas todavía no es alerta', () => {
  assert.deepEqual(tipos({ diasHastaApertura: 40, analisis: analisis({ ocupacionPrevista: null, riesgo: 'SIN_OFERTA' }) }), []);
});

test('capacidad en rojo: avisa con las cifras que la sostienen', () => {
  const [a] = detectarAlertas(entrada({ analisis: analisis({ ocupacionPrevista: 0.9, riesgo: 'ROJO', demandaComprometida: 90 }) }));
  assert.equal(a.tipo, 'CAPACIDAD_LLENA');
  assert.match(a.descripcion, /90 %: 90 plazas para 100 publicadas/);
});

test('preventa lenta solo en las dos últimas semanas y por debajo del objetivo del estudio', () => {
  const lenta = analisis({ ocupacionPrevista: 0.2 });
  assert.deepEqual(tipos({ diasHastaApertura: 10, analisis: lenta }), ['PREVENTA_LENTA']);
  assert.deepEqual(tipos({ diasHastaApertura: 20, analisis: lenta }), []);
  assert.deepEqual(tipos({ diasHastaApertura: 10, analisis: lenta, objetivoPreventa: 0.15 }), []);
  assert.deepEqual(tipos({ diasHastaApertura: 0, analisis: lenta }), []);
});

const etapa = (p: Partial<EtapaVista>): EtapaVista => ({
  id: 'e1', etapa: 'FUNDADORA', planId: 'p1', planNombre: 'Cuota Fundadora', desde: '2026-10-01', hasta: '2026-10-15',
  limitePlazas: 20, alCompletar: 'AVISAR', cerrada: true, cerradaMotivo: 'CUPO', ventas: 20, ...p,
});

test('etapa llena con «solo avisar» y el plan aún a la venta: avisa una vez por etapa', () => {
  const r = detectarAlertas(entrada({ etapas: [etapa({})], planActivo: new Map([['p1', true]]) }));
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'ETAPA_LLENA:e1');
  assert.match(r[0].descripcion, /20 de 20 vendidas y «Cuota Fundadora» sigue a la venta/);
});

test('etapa llena que ya cerró la venta, o cuyo plan ya no se vende, no avisa', () => {
  assert.deepEqual(tipos({ etapas: [etapa({ alCompletar: 'CERRAR' })], planActivo: new Map([['p1', false]]) }), []);
  assert.deepEqual(tipos({ etapas: [etapa({})], planActivo: new Map([['p1', false]]) }), []);
  assert.deepEqual(tipos({ etapas: [etapa({ cerradaMotivo: 'FECHA' })], planActivo: new Map([['p1', true]]) }), []);
});
