import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// North Star fase 1: «no vino» y «nadie pasó lista» deben poder distinguirse.
// Los dos caminos automáticos dicen SISTEMA; el resto (panel, QR, instructora)
// no dice nada y la BD lo anota como PERSONA.
const admin = readFileSync('lib/db/supabase-data-admin.ts', 'utf8');
const auto = readFileSync('lib/checkin/marcar-asistidas-automatico.ts', 'utf8');
const migracion = readFileSync('supabase/migrations/20261112233833_metricas_higiene_datos.sql', 'utf8');

test('el barrido de no-shows marca su origen como SISTEMA', () => {
  assert.match(admin, /estado: 'NO_ASISTIO', asistencia_origen: 'SISTEMA'/);
});

test('las marcas automáticas de asistencia pasan origen SISTEMA', () => {
  assert.match(auto, /origen: 'SISTEMA'/);
  assert.match(admin, /reservaId: r\.id, origen: 'SISTEMA'/);
});

test('el check-in manual cae en PERSONA por defecto', () => {
  assert.match(admin, /asistencia_origen: params\.origen \?\? 'PERSONA'/);
});

test('la migración es aditiva y protege excluir_de_metricas', () => {
  assert.match(migracion, /add column if not exists excluir_de_metricas/);
  assert.match(migracion, /es_llamada_servicio\(\)/);
  assert.doesNotMatch(migracion, /\b(drop (table|column)|delete from|truncate)\b/i);
});
