import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROVEEDORES } from './legal-info.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Guardianes de contrato de la auditoría RGPD (2026-09-13).
//
// Cada uno fija una cosa que ya se rompió y que no debe volver:
//  · `notas_progreso` es dato de salud y su RLS exige consentimiento vigente.
//  · La nota de sesión con IA solo la genera un rol que puede ver la ficha
//    clínica (el texto sale hacia un proveedor externo).
//  · La lista pública de proveedores nombra a los que tratan datos de verdad.
//  · Las páginas públicas no prometen lo que el código contradice.
//
// Si uno falla, no se arregla quitándolo: se arregla el texto o el código.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

test('la migración de notas_progreso exige consentimiento de salud en lectura y escritura', () => {
  const dir = join(RAIZ, 'supabase/migrations');
  const fichero = readdirSync(dir).find(f => f.endsWith('_notas_progreso_exige_consentimiento.sql'));
  assert.ok(fichero, 'falta la migración *_notas_progreso_exige_consentimiento.sql');
  const sql = readFileSync(join(dir, fichero), 'utf8').replace(/--.*$/gm, '');
  assert.match(sql, /drop policy if exists salud_notas_progreso on public\.notas_progreso/);
  // select + insert + update (using y with check) + delete = 5 apariciones.
  const usos = sql.match(/tiene_consentimiento_salud\(socio_id\)/g) ?? [];
  assert.ok(usos.length >= 5, `esperaba el gate en USING y WITH CHECK de las cuatro operaciones, hay ${usos.length}`);
});

test('la nota de sesión con IA comprueba el rol clínico y el consentimiento', () => {
  const ruta = leer('app/api/ai/instructor-note/route.ts');
  assert.match(ruta, /puedeVerFichaClinica\(sesion\.rol\)/);
  assert.match(ruta, /consentimiento_salud_revocado_en/);
  // Con service-role la RPC se salta el filtro de estudio: no vale aquí.
  assert.doesNotMatch(ruta, /rpc\(\s*['"]tiene_consentimiento_salud/);
});

test('la lista pública de proveedores incluye a quienes tratan datos', () => {
  const nombres = PROVEEDORES.map(p => p.nombre).join(' | ');
  for (const n of ['Anthropic', 'PostHog', 'Meta']) {
    assert.ok(nombres.includes(n), `falta ${n} en PROVEEDORES`);
  }
});

test('/seguridad no promete que los datos no salen de la UE', () => {
  assert.ok(!leer('app/seguridad/page.tsx').includes('No cruza el Atl'));
});

test('ninguna comparativa dice que los datos están alojados en España', () => {
  const dir = join(RAIZ, 'app/comparativa');
  const paginas = ['page.tsx', ...readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => join(e.name, 'page.tsx'))];
  for (const p of paginas) {
    let contenido: string;
    try { contenido = readFileSync(join(dir, p), 'utf8'); } catch { continue; }
    assert.ok(!contenido.includes('Sí, en España'), `app/comparativa/${p} dice «Sí, en España»`);
  }
});

test('la política de privacidad no niega las automatizaciones que el estudio puede activar', () => {
  assert.ok(!leer('app/(legal)/privacidad/page.tsx').includes('No se realizan decisiones automatizadas'));
});
