import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LO_QUE_NO_VUELVE, accionCierre, lineaCierre, momentoCierre, repartirCierres, seSolapaConOtro, type CierreGuardado,
} from './quitar-cierre.ts';
import { resumenCierres } from '../configuracion/resumenes.ts';

// Quitar un cierre ya aplicado no restaura nada: las clases siguen canceladas,
// las alumnas ya fueron avisadas y los bonos se quedan con sus días de más. Lo
// que se fija aquí es que la pantalla solo ofrece lo que se puede hacer de
// verdad y que la confirmación lo dice antes de tocar nada.

const hoy = '2026-12-20';
const cierre = (id: string, desde: string, hasta: string, motivo: string | null = null): CierreGuardado => ({ id, desde, hasta, motivo });

test('el momento de un cierre: los dos extremos cuentan como días cerrados', () => {
  assert.equal(momentoCierre({ desde: '2026-12-24', hasta: '2026-12-26' }, hoy), 'proximo');
  assert.equal(momentoCierre({ desde: '2026-12-20', hasta: '2026-12-20' }, hoy), 'en_curso');
  assert.equal(momentoCierre({ desde: '2026-12-18', hasta: '2026-12-20' }, hoy), 'en_curso');
  assert.equal(momentoCierre({ desde: '2026-12-10', hasta: '2026-12-19' }, hoy), 'pasado');
});

test('uno que viene se quita, y la confirmación dice que las clases y los bonos no vuelven atrás', () => {
  const a = accionCierre({ desde: '2026-12-24', hasta: '2026-12-26' }, hoy)!;
  assert.equal(a.momento, 'proximo');
  assert.equal(a.boton, 'Quitar este cierre');
  assert.equal(a.titulo, '¿Quitar el cierre del 24–26 dic?');
  assert.ok(a.descripcion.startsWith('Tus alumnas podrán volver a reservar esos días.'));
  assert.ok(a.descripcion.includes(LO_QUE_NO_VUELVE));
  assert.equal(a.textoConfirmar, 'Sí, quitar el cierre');
  assert.equal(a.hecho, 'Cierre quitado');
});

test('uno en curso se reabre desde hoy, con la misma advertencia', () => {
  const a = accionCierre({ desde: '2026-12-18', hasta: '2026-12-22' }, hoy)!;
  assert.equal(a.momento, 'en_curso');
  assert.equal(a.boton, 'Reabrir desde hoy');
  assert.equal(a.titulo, '¿Reabrir el centro desde hoy?');
  assert.ok(a.descripcion.includes(LO_QUE_NO_VUELVE));
});

test('uno que ya pasó no ofrece nada: no hay días que reabrir', () => {
  assert.equal(accionCierre({ desde: '2026-12-10', hasta: '2026-12-19' }, hoy), null);
});

test('la advertencia no promete nada de lo que no se hace', () => {
  // Ni «se restauran», ni «se avisa», ni «se recuperan»: quitar solo borra la fila.
  assert.doesNotMatch(LO_QUE_NO_VUELVE, /restaur|se avisa a tus|recuperan/i);
  assert.match(LO_QUE_NO_VUELVE, /no vuelven/);
  assert.match(LO_QUE_NO_VUELVE, /no se avisa a nadie/);
  // Y dice qué pasa con los días de más si el cierre se vuelve a poner: no se
  // suman otra vez (prorrogar_por_cierre, ver prorroga-una-vez.test.ts).
  assert.match(LO_QUE_NO_VUELVE, /Si vuelves a cerrar esos días, a los bonos no se les suman otra vez\./);
});

test('reparte: los que vienen del más cercano al más lejano; los pasados, el más reciente primero', () => {
  const todos = [
    cierre('a', '2027-04-01', '2027-04-05'),
    cierre('b', '2026-08-01', '2026-08-15'),
    cierre('c', '2026-12-18', '2026-12-22'),
    cierre('d', '2026-10-12', '2026-10-12'),
  ];
  const { proximos, pasados } = repartirCierres(todos, hoy);
  assert.deepEqual(proximos.map(c => c.id), ['c', 'a']);
  assert.deepEqual(pasados.map(c => c.id), ['d', 'b']);
});

test('tras quitar uno, la fila de Mi estudio dice el siguiente, o que no hay', () => {
  const todos = [cierre('a', '2026-12-24', '2026-12-26'), cierre('b', '2027-04-01', '2027-04-05')];
  assert.equal(resumenCierres(todos, hoy), 'Cerrado 24–26 dic · 1 cierre más');
  const sinA = todos.filter(c => c.id !== 'a');
  assert.equal(resumenCierres(sinA, hoy), 'Cerrado 1–5 abr');
  assert.equal(resumenCierres(sinA.filter(c => c.id !== 'b'), hoy), 'Sin cierres próximos');
});

test('dos cierres que comparten un día no cuentan clases: no se sabe de cuál es cada una', () => {
  const a = cierre('a', '2026-12-24', '2026-12-31');
  const b = cierre('b', '2026-12-31', '2027-01-02');
  const c = cierre('c', '2027-01-03', '2027-01-06');
  assert.equal(seSolapaConOtro(a, [a, b, c]), true);
  assert.equal(seSolapaConOtro(b, [a, b, c]), true);
  assert.equal(seSolapaConOtro(c, [a, b, c]), false);
  // Consigo mismo no se solapa.
  assert.equal(seSolapaConOtro(c, [c]), false);
});

test('la línea: fechas, año si no es el de hoy, motivo y clases; lo que no se sabe no se dice', () => {
  assert.deepEqual(lineaCierre(cierre('a', '2026-12-24', '2026-12-26', 'Navidad'), hoy, 12), { fechas: '24–26 dic', detalle: 'Navidad · 12 clases canceladas' });
  assert.deepEqual(lineaCierre(cierre('a', '2026-12-24', '2026-12-26'), hoy, 1), { fechas: '24–26 dic', detalle: '1 clase cancelada' });
  assert.deepEqual(lineaCierre(cierre('a', '2026-12-24', '2026-12-26', '  '), hoy, 0), { fechas: '24–26 dic', detalle: 'Ninguna clase cancelada' });
  assert.deepEqual(lineaCierre(cierre('a', '2026-12-24', '2026-12-26', 'reforma'), hoy, null), { fechas: '24–26 dic', detalle: 'Reforma' });
  assert.deepEqual(lineaCierre(cierre('a', '2026-12-24', '2026-12-26'), hoy, null), { fechas: '24–26 dic', detalle: null });
  assert.equal(lineaCierre(cierre('a', '2025-08-01', '2025-08-15'), hoy, null).fechas, '1–15 ago 2025');
  assert.equal(lineaCierre(cierre('a', '2026-12-30', '2027-01-02'), hoy, null).fechas, '30 dic–2 ene 2027');
});
