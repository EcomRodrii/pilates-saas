import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarATodos, cambiosDeEstudio, type BaseEscribible, type FiltroEscribible } from './visita-guiada-servidor.ts';

/** Una base de pega que APUNTA cada llamada del filtro, para ver exactamente qué se pide. */
function pega(devuelve: Array<{ id: string }> = []) {
  const llamadas: unknown[][] = [];
  const filtro: FiltroEscribible = {
    eq(c, v) { llamadas.push(['eq', c, v]); return filtro; },
    is(c, v) { llamadas.push(['is', c, v]); return filtro; },
    select(cols) { llamadas.push(['select', cols]); return Promise.resolve({ data: devuelve, error: null }); },
    then: (a, b) => Promise.resolve({ error: null }).then(a, b),
  };
  const db: BaseEscribible = { from(t) { llamadas.push(['from', t]); return { update(v) { llamadas.push(['update', v]); return filtro; } }; } };
  return { db, llamadas };
}

test('activar en todos: nunca demos, solo a quien no la tiene y no la ha completado', async () => {
  const { db, llamadas } = pega([{ id: 'a' }, { id: 'b' }]);
  const r = await aplicarATodos(db, true);
  assert.deepEqual(r.ids, ['a', 'b']);
  assert.deepEqual(llamadas, [
    ['from', 'studios'], ['update', { tour_obligatorio: true }],
    ['eq', 'es_demo', false], ['is', 'tour_completado_en', null], ['eq', 'tour_obligatorio', false],
    ['select', 'id'],
  ]);
});

test('desactivar en todos: nunca demos, solo a quien la tiene (y no toca lo completado)', async () => {
  const { db, llamadas } = pega([{ id: 'a' }]);
  const r = await aplicarATodos(db, false);
  assert.deepEqual(r.ids, ['a']);
  assert.deepEqual(llamadas, [
    ['from', 'studios'], ['update', { tour_obligatorio: false }],
    ['eq', 'es_demo', false], ['eq', 'tour_obligatorio', true],
    ['select', 'id'],
  ]);
});

test('«en todos» jamás escribe sin el filtro de demos', async () => {
  for (const activar of [true, false]) {
    const { db, llamadas } = pega();
    await aplicarATodos(db, activar);
    assert.ok(llamadas.some(l => l[0] === 'eq' && l[1] === 'es_demo' && l[2] === false), `activar=${activar}`);
  }
});

test('sin filas devueltas, ninguna cambió', async () => {
  assert.deepEqual((await aplicarATodos(pega([]).db, true)).ids, []);
});

test('los cambios de un estudio: activar conserva el avance, desde cero lo reinicia, desactivar solo apaga', () => {
  assert.deepEqual(cambiosDeEstudio('desactivar'), { tour_obligatorio: false });
  assert.deepEqual(cambiosDeEstudio('activar'), { tour_obligatorio: true, tour_completado_en: null });
  assert.deepEqual(cambiosDeEstudio('activar-desde-cero'), { tour_obligatorio: true, tour_completado_en: null, tour_progreso: {} });
  assert.ok(!('tour_progreso' in cambiosDeEstudio('activar')), 'activar NO reinicia el progreso');
});
