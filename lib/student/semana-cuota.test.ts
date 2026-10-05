import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarSemana, lunesDeLaSemana, textoSemana, ventanaSemana, type PlanSemana, type ReservaSemana } from './semana-cuota.ts';

// Sin `@/`: con el alias este test dejaría de ejecutarse sin avisar.

test('el lunes de la semana, con el domingo dentro de la semana que acaba', () => {
  assert.equal(lunesDeLaSemana('2026-10-07'), '2026-10-05'); // miércoles
  assert.equal(lunesDeLaSemana('2026-10-05'), '2026-10-05'); // lunes
  assert.equal(lunesDeLaSemana('2026-10-11'), '2026-10-05'); // domingo
});

test('la ventana dura 7×24 h desde el lunes (la semana del cambio de hora no pierde una hora)', () => {
  // 26-oct-2026 es el lunes siguiente al cambio de hora (25-oct): 7×24 h desde las 00:00 de Madrid del 19.
  const v = ventanaSemana('2026-10-18T22:00:00.000Z');
  assert.equal(v.hasta, '2026-10-25T22:00:00.000Z');
});

const plan: PlanSemana = { limiteSemanal: 2, tiposClaseIds: ['tc-r', 'tc-m'], limitePorTipo: { 'tc-r': 1 } };
const V = { desde: '2026-10-04T22:00:00.000Z', hasta: '2026-10-11T22:00:00.000Z' };
const r = (id: string, estado: string, inicio: string, tipoClaseId: string | null = 'tc-r', claseCancelada: boolean | null = false): ReservaSemana => ({ id, estado, inicio, tipoClaseId, claseCancelada });

test('cuentan confirmadas, asistidas y no-shows de la semana, solo de lo que cubre el plan', () => {
  const s = contarSemana([
    r('a', 'CONFIRMADA', '2026-10-06T08:00:00Z'),
    r('b', 'NO_ASISTIO', '2026-10-05T08:00:00Z', 'tc-m'),
    r('c', 'CANCELADA', '2026-10-07T08:00:00Z'),
    r('d', 'LISTA_ESPERA', '2026-10-07T08:00:00Z'),
    r('e', 'CONFIRMADA', '2026-10-08T08:00:00Z', 'tc-barre'),
    r('f', 'CONFIRMADA', '2026-10-12T08:00:00Z'), // la semana siguiente
    r('g', 'ASISTIDA', '2026-10-04T21:00:00Z'), // el domingo anterior, 23:00 de Madrid
    r('h', 'CONFIRMADA', '2026-10-09T08:00:00Z', 'tc-r', true), // clase cancelada
  ], plan, V, new Set());
  assert.equal(s.cuentan, 2);
  assert.equal(s.limite, 2);
  assert.deepEqual(s.porTipo, [{ tipoClaseId: 'tc-r', limite: 1, cuentan: 1 }]);
});

test('las pagadas con recuperación cuentan para el tope, como en el servidor, y se dice cuántas', () => {
  const s = contarSemana([r('a', 'CONFIRMADA', '2026-10-06T08:00:00Z'), r('b', 'ASISTIDA', '2026-10-05T08:00:00Z')], plan, V, new Set(['b']));
  assert.equal(s.cuentan, 2);
  assert.equal(s.conRecuperacion, 1);
  // Con el tope lleno no puede decir «1 de 2»: la siguiente la rechaza el servidor o gasta otra recuperación.
  assert.deepEqual(textoSemana(s), { cifra: '2 de 2', recuperacion: '1 de ellas, con recuperación' });
});

test('por encima del tope no se recorta, y sin tope no hay texto', () => {
  const tres = contarSemana(['a', 'b', 'c'].map((id, i) => r(id, 'CONFIRMADA', `2026-10-0${6 + i}T08:00:00Z`, 'tc-m')), plan, V, new Set());
  assert.equal(textoSemana(tres)?.cifra, '3 clases · tu cuota incluye 2');
  assert.equal(textoSemana(contarSemana([], { ...plan, limiteSemanal: null }, V, new Set())), null);
});
