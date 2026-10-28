import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anadirNota, escrituraLeadDemo, MAX_NOTAS } from './lead-escritura.ts';
import type { DatosDemo } from './lead.ts';

const datos: DatosDemo = { tipoCentro: 'yoga', nombre: 'Marta Gil', estudio: 'Estudio Luna', email: 'marta@example.com', telefono: '+34600112233', comercial: false };
const AHORA = '2026-11-03T10:00:00.000Z';
const sinPermiso = { id: 'lead-1', consentimiento_comercial: false, consentimiento_confirmado_en: null, baja_en: null };

test('lead nuevo: se guarda con origen ALTA y estado DEMO, sin permiso comercial si no lo marcó', () => {
  const e = escrituraLeadDemo(null, datos, AHORA, () => 'lead-nuevo');
  assert.equal(e.tipo, 'insertar');
  if (e.tipo !== 'insertar') return;
  assert.equal(e.id, 'lead-nuevo');
  assert.equal(e.solicitud, false);
  assert.equal(e.fila.origen, 'ALTA');
  assert.equal(e.fila.estado, 'DEMO');
  assert.equal(e.fila.consentimiento_comercial, undefined);
  assert.equal(e.fila.telefono, '+34600112233');
});

test('lead nuevo con la casilla marcada: permiso PENDIENTE con el texto exacto y fecha', () => {
  const e = escrituraLeadDemo(null, { ...datos, comercial: true }, AHORA, () => 'x');
  assert.ok(e.tipo === 'insertar' && e.solicitud && e.fila.consentimiento_comercial === true);
  if (e.tipo === 'insertar') {
    assert.match(String(e.fila.consentimiento_texto), /novedades y guías de Tentare/);
    assert.equal(e.fila.consentimiento_en, AHORA);
    assert.equal(e.fila.consentimiento_confirmado_en, undefined, 'no se da por confirmado');
  }
});

test('lead existente: nunca se pisan sus datos ni se mueve actualizado_en', () => {
  const e = escrituraLeadDemo(sinPermiso, { ...datos, nombre: 'Otra Persona', estudio: 'Otro' }, AHORA, () => 'x');
  assert.deepEqual(e, { tipo: 'nada', id: 'lead-1' });
});

test('lead existente + casilla marcada: solo el permiso pendiente, nada más', () => {
  const e = escrituraLeadDemo(sinPermiso, { ...datos, comercial: true }, AHORA, () => 'x');
  assert.equal(e.tipo, 'actualizar');
  if (e.tipo === 'actualizar') assert.deepEqual(Object.keys(e.cambios).sort(), ['actualizado_en', 'consentimiento_comercial', 'consentimiento_en', 'consentimiento_texto']);
});

test('quien ya tiene el permiso confirmado y vigente no se toca', () => {
  const e = escrituraLeadDemo({ ...sinPermiso, consentimiento_comercial: true, consentimiento_confirmado_en: '2026-10-01T00:00:00Z' }, { ...datos, comercial: true }, AHORA, () => 'x');
  assert.equal(e.tipo, 'nada');
});

test('las notas se acotan por el principio (se conserva lo más reciente)', () => {
  assert.equal(anadirNota(null, 'a'), 'a');
  assert.equal(anadirNota('a', 'b'), 'a\nb');
  const larga = anadirNota('x'.repeat(MAX_NOTAS), 'FIN');
  assert.equal(larga.length, MAX_NOTAS);
  assert.ok(larga.endsWith('FIN'));
});
