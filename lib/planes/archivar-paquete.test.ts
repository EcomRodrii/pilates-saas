import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// «Eliminar» un paquete con historial no puede borrar la fila (FK RESTRICT y
// registros fiscales): se ARCHIVA (`archivado_en`) y deja de verse. Se vigila
// sobre el código fuente, como el resto de guardias de persistencia.
const data = readFileSync(new URL('../supabase-data.ts', import.meta.url), 'utf8');
const ctx = readFileSync(new URL('../studio-context.tsx', import.meta.url), 'utf8');
const pagina = readFileSync(new URL('../../app/(dashboard)/productos/page.tsx', import.meta.url), 'utf8');

test('el borrado distingue «tiene historial» (23503) de un fallo real', () => {
  assert.match(data, /code === '23503'[\s\S]{0,200}conHistorial: true/);
});

test('deletePlan archiva (activo=false + archivadoEn) si hay suscripciones o la BD lo rechaza por historial', () => {
  const cuerpo = ctx.slice(ctx.indexOf('async function deletePlan'), ctx.indexOf('// ── Salas'));
  assert.match(cuerpo, /activo: false, archivadoEn:/);
  assert.match(cuerpo, /suscripciones\.some\(s => s\.planId === id\)\) return archivar\(\)/);
  assert.match(cuerpo, /res\.conHistorial\) return archivar\(\)/);
});

test('el panel no enseña los paquetes archivados y la columna se lee y se escribe', () => {
  assert.match(pagina, /filter\(p => !p\.archivadoEn\)/);
  assert.match(data, /archivadoEn: r\.archivado_en \?\? null/);
  assert.match(data, /archivadoEn: 'archivado_en'/);
});
