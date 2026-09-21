import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerRespuestas, recomendar, validarOnboarding, type ContextoRecomendaciones } from './onboarding.ts';

test('fecha exacta, aproximada (día 1 del mes) o ninguna', () => {
  const base = { puntos: ['LOCAL'], objetivos: ['FUNDADORAS'] };
  const exacta = validarOnboarding({ ...base, fechaTipo: 'EXACTA', fecha: '2026-11-03' });
  assert.ok(exacta.ok && exacta.fechaApertura === '2026-11-03' && !exacta.respuestas.fechaAproximada);
  const aprox = validarOnboarding({ ...base, fechaTipo: 'APROXIMADA', mes: '2026-11' });
  assert.ok(aprox.ok && aprox.fechaApertura === '2026-11-01' && aprox.respuestas.fechaAproximada);
  const nose = validarOnboarding({ ...base, fechaTipo: 'NO_SE' });
  assert.ok(nose.ok && nose.fechaApertura === null);
});

test('lista para vender la pone en preventa; si no, preparando', () => {
  const r = validarOnboarding({ puntos: ['LOCAL', 'LISTA_VENDER'], objetivos: [], fechaTipo: 'NO_SE' });
  assert.ok(r.ok && r.fase === 'PREVENTA');
  const p = validarOnboarding({ puntos: ['PROYECTO'], objetivos: [], fechaTipo: 'NO_SE' });
  assert.ok(p.ok && p.fase === 'PREPARACION');
});

test('rechaza lo incompleto o inventado con un motivo legible', () => {
  assert.deepEqual(validarOnboarding({ puntos: [], objetivos: [], fechaTipo: 'NO_SE' }), { ok: false, error: 'Elige en qué punto está tu apertura' });
  assert.deepEqual(validarOnboarding({ puntos: ['OTRO'], objetivos: [], fechaTipo: 'NO_SE' }), { ok: false, error: 'Elige en qué punto está tu apertura' });
  assert.deepEqual(validarOnboarding({ puntos: ['LOCAL'], objetivos: ['HACKEAR'], fechaTipo: 'NO_SE' }), { ok: false, error: 'Objetivos no válidos' });
  assert.deepEqual(validarOnboarding({ puntos: ['LOCAL'], objetivos: [] }), { ok: false, error: 'Dinos si tienes fecha de apertura' });
  assert.deepEqual(validarOnboarding({ puntos: ['LOCAL'], objetivos: [], fechaTipo: 'APROXIMADA', mes: '2026-13' }), { ok: false, error: 'Elige el mes aproximado' });
});

test('un jsonb vacío o a medias no cuenta como onboarding hecho', () => {
  assert.equal(leerRespuestas({}), null);
  assert.equal(leerRespuestas({ puntos: ['LOCAL'] }), null);
  assert.deepEqual(leerRespuestas({ completado: true, puntos: ['LOCAL', 'X'], objetivos: ['FUNDADORAS'] }),
    { completado: true, puntos: ['LOCAL'], objetivos: ['FUNDADORAS'], fechaAproximada: false });
});

const ctx = (p: Partial<ContextoRecomendaciones>): ContextoRecomendaciones => ({
  respuestas: { completado: true, puntos: ['LOCAL'], objetivos: [], fechaAproximada: false },
  hayClasesPublicadas: true, alertas: [], hayPlanes: true, hayEtapaFundadora: false, puedeVer: () => true, ...p,
});
const ids = (p: Partial<ContextoRecomendaciones>) => recomendar(ctx(p)).map(r => r.id);

test('sin horario, lo primero es publicarlo, se haya pedido o no', () => {
  assert.deepEqual(ids({ hayClasesPublicadas: false }), ['horario']);
});

test('si ya hay alerta de «sin horario», no se repite como siguiente paso', () => {
  assert.deepEqual(ids({ hayClasesPublicadas: false, alertas: ['SIN_HORARIO'] }), []);
});

test('fundadoras: etapa si ya hay planes, el plan antes si no, y nada si ya hay etapa', () => {
  const r = { completado: true as const, puntos: [], objetivos: ['FUNDADORAS' as const], fechaAproximada: false };
  assert.deepEqual(ids({ respuestas: r }), ['fundadora']);
  assert.deepEqual(ids({ respuestas: r, hayPlanes: false }), ['plan-fundadora']);
  assert.deepEqual(ids({ respuestas: r, hayEtapaFundadora: true }), []);
});

test('respeta lo que el rol puede ver y no pasa de 3', () => {
  const r = { completado: true as const, puntos: [], objetivos: ['CONTRATAR' as const, 'PRIMERAS_CLIENTAS' as const, 'TODO_PREPARADO' as const, 'FUNDADORAS' as const], fechaAproximada: false };
  assert.equal(recomendar(ctx({ respuestas: r, hayClasesPublicadas: false })).length, 3);
  assert.ok(!ids({ respuestas: r, puedeVer: h => h !== '/network/buscar' }).includes('contratar'));
});
