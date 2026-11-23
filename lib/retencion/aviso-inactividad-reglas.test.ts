import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_AVISO_INACTIVIDAD, MAX_AVISOS_POR_PASADA, avisoInactividadActivo, elegirParaAvisar, type FilaSituacionAviso,
} from './aviso-inactividad-reglas.ts';

const fila = (p: Partial<FilaSituacionAviso> & { studio_id: string }): FilaSituacionAviso => ({
  estado: 'GRATIS', paga: false, es_demo: false, suspendido_a_mano: false, dias_sin_actividad: 40, ...p,
});

test('apagado por defecto: solo AVISO_INACTIVIDAD=on lo enciende', () => {
  assert.equal(avisoInactividadActivo({}), false);
  assert.equal(avisoInactividadActivo({ AVISO_INACTIVIDAD: 'true' }), false);
  assert.equal(avisoInactividadActivo({ AVISO_INACTIVIDAD: 'off' }), false);
  assert.equal(avisoInactividadActivo({ AVISO_INACTIVIDAD: ' on ' }), true);
});

test('el umbral es de 30 días y el límite está incluido', () => {
  assert.equal(DIAS_AVISO_INACTIVIDAD, 30);
  const r = elegirParaAvisar([fila({ studio_id: 'a', dias_sin_actividad: 29 }), fila({ studio_id: 'b', dias_sin_actividad: 30 })], new Set());
  assert.deepEqual(r.map(f => f.studio_id), ['b']);
});

test('nunca se avisa a quien paga, a una demo, a un estudio suspendido a mano ni a uno ya cerrado', () => {
  const r = elegirParaAvisar([
    fila({ studio_id: 'paga', paga: true, estado: 'ACTIVO_PAGO' }),
    fila({ studio_id: 'demo', es_demo: true }),
    fila({ studio_id: 'a-mano', suspendido_a_mano: true }),
    fila({ studio_id: 'suspendido', estado: 'SUSPENDIDO' }),
    fila({ studio_id: 'en-baja', estado: 'EN_BAJA' }),
    fila({ studio_id: 'eliminado', estado: 'ELIMINADO' }),
    fila({ studio_id: 'pago-pendiente', estado: 'PAGO_PENDIENTE' }),
    fila({ studio_id: 'ok-gratis' }),
    fila({ studio_id: 'ok-margen', estado: 'GRATIS_EN_MARGEN' }),
    fila({ studio_id: 'ok-inactivo', estado: 'INACTIVO', dias_sin_actividad: 70 }),
  ], new Set());
  assert.deepEqual(r.map(f => f.studio_id).sort(), ['ok-gratis', 'ok-inactivo', 'ok-margen']);
});

test('UN aviso por estudio: quien ya recibió el suyo no vuelve a entrar', () => {
  const r = elegirParaAvisar([fila({ studio_id: 'a' }), fila({ studio_id: 'b' })], new Set(['a']));
  assert.deepEqual(r.map(f => f.studio_id), ['b']);
});

test('primero los que más llevan, con desempate estable, y como mucho el tope de la pasada', () => {
  const muchos = Array.from({ length: 12 }, (_, i) => fila({ studio_id: `s${String(i).padStart(2, '0')}`, dias_sin_actividad: 30 + (i % 4) }));
  const r = elegirParaAvisar(muchos, new Set());
  assert.equal(r.length, MAX_AVISOS_POR_PASADA);
  assert.ok(r.every((f, i) => i === 0 || r[i - 1].dias_sin_actividad >= f.dias_sin_actividad));
  assert.deepEqual(r.map(f => f.studio_id), elegirParaAvisar([...muchos].reverse(), new Set()).map(f => f.studio_id));
});

test('un valor raro (NaN, sin dato) no cuenta como «30 días»', () => {
  assert.deepEqual(elegirParaAvisar([fila({ studio_id: 'x', dias_sin_actividad: Number.NaN })], new Set()), []);
  assert.deepEqual(elegirParaAvisar([fila({ studio_id: 'y' })], new Set(), 0), []);
});
