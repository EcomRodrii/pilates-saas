import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIAS_BAJA, MINUTOS_ULTIMA_HORA, antelacionMinutos, normalizarCategoria, normalizarRevision,
  revisionInicial, revisionReciente, textoMotivoParaEstudio, textoRevision,
} from './baja-instructora.ts';

test('el motivo son tres opciones fijas; cualquier otra cosa no se guarda', () => {
  assert.deepEqual(CATEGORIAS_BAJA.map((c) => c.valor), ['SALUD', 'PERSONAL', 'OTRO']);
  assert.equal(normalizarCategoria('SALUD'), 'SALUD');
  for (const malo of ['salud', 'BAJA_MEDICA', '', null, undefined, 3]) assert.equal(normalizarCategoria(malo), null);
});

test('el estudio lee el motivo en tercera persona y, sin motivo, no se inventa uno', () => {
  assert.equal(textoMotivoParaEstudio('SALUD', '  Fiebre  '), 'No se encuentra bien · Fiebre');
  assert.equal(textoMotivoParaEstudio('PERSONAL', null), 'Asunto personal');
  assert.equal(textoMotivoParaEstudio(null, 'Un imprevisto'), 'Un imprevisto');
  assert.equal(textoMotivoParaEstudio('RARO', '   '), null);
});

test('solo espera revisión la baja con menos de 24 h de antelación', () => {
  const ahora = Date.parse('2026-09-14T10:00:00Z');
  assert.equal(antelacionMinutos('2026-09-14T13:00:00Z', ahora), 180);
  assert.equal(revisionInicial(antelacionMinutos('2026-09-14T13:00:00Z', ahora)), 'PENDIENTE');
  assert.equal(revisionInicial(MINUTOS_ULTIMA_HORA - 1), 'PENDIENTE');
  assert.equal(revisionInicial(MINUTOS_ULTIMA_HORA), null);
  assert.equal(revisionInicial(antelacionMinutos('2026-09-16T10:00:00Z', ahora)), null);
  // Una clase ya empezada o una fecha rota no dan antelación negativa ni NaN.
  assert.equal(antelacionMinutos('2026-09-14T09:00:00Z', ahora), 0);
  assert.equal(antelacionMinutos('ayer', ahora), 0);
});

test('pendiente no se le enseña; la revisión hecha, con su nota y sin palabras de sanción', () => {
  assert.equal(textoRevision(null), null);
  assert.equal(textoRevision({ estado: 'PENDIENTE', nota: null, revisadaEn: null }), null);
  const enOrden = textoRevision({ estado: 'EN_ORDEN', nota: 'Que te mejores', revisadaEn: '2026-09-14T12:00:00Z' });
  assert.deepEqual(enOrden, { titulo: 'El estudio lo ha revisado: todo en orden', nota: 'Que te mejores' });
  const hablar = textoRevision({ estado: 'LO_HABLAMOS', nota: null, revisadaEn: '2026-09-14T12:00:00Z' });
  assert.equal(hablar?.titulo, 'El estudio quiere hablarlo contigo');
  for (const t of [enOrden, hablar]) assert.doesNotMatch(t!.titulo, /sanci|penaliz|injustific|no justific|falta/i);
});

test('la revisión de la respuesta solo vale con forma exacta', () => {
  assert.deepEqual(normalizarRevision({ estado: 'LO_HABLAMOS', nota: 'Llámame', revisadaEn: '2026-09-14T12:00:00Z' }),
    { estado: 'LO_HABLAMOS', nota: 'Llámame', revisadaEn: '2026-09-14T12:00:00Z' });
  // Pendiente nunca trae nota ni fecha, aunque lleguen.
  assert.deepEqual(normalizarRevision({ estado: 'PENDIENTE', nota: 'x', revisadaEn: '2026-09-14T12:00:00Z' }),
    { estado: 'PENDIENTE', nota: null, revisadaEn: null });
  for (const malo of [null, {}, { estado: 'JUSTIFICADA' }, { estado: 'EN_ORDEN', nota: 'x' }, { estado: 'EN_ORDEN', revisadaEn: 'ayer' }]) {
    assert.equal(normalizarRevision(malo), null, JSON.stringify(malo));
  }
});

test('la revisión de una baja cerrada se sigue viendo 7 días', () => {
  const ahora = Date.parse('2026-09-14T12:00:00Z');
  const hace = (dias: number) => new Date(ahora - dias * 86_400_000).toISOString();
  assert.equal(revisionReciente({ estado: 'EN_ORDEN', nota: null, revisadaEn: hace(6) }, ahora), true);
  assert.equal(revisionReciente({ estado: 'EN_ORDEN', nota: null, revisadaEn: hace(8) }, ahora), false);
  assert.equal(revisionReciente({ estado: 'PENDIENTE', nota: null, revisadaEn: null }, ahora), false);
  assert.equal(revisionReciente(null, ahora), false);
});
