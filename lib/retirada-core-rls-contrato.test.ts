import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: la RLS ya no abre el panel a la instructora (Tentare Core
// retirado, 14-sep-2026). La app del estudio no lee ni escribe con su sesión:
// todo va por servidor. Si una migración nueva vuelve a darle una rama en estas
// políticas —copiando el texto viejo, que sigue en migraciones anteriores—, esto
// falla. No se arregla quitándolo: lo de la instructora va a la app.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = join(import.meta.dirname, '..', 'supabase/migrations');
const sinComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const nombre = readdirSync(DIR).find((n) => n.endsWith('_panel_sin_brazo_instructora.sql'));
const SQL = nombre ? sinComentarios(readFileSync(join(DIR, nombre), 'utf8')) : '';

/** Migraciones POSTERIORES a esta: donde podría volver una rama para la instructora. */
function posteriores(): Array<{ nombre: string; sql: string }> {
  return readdirSync(DIR).filter((n) => n.endsWith('.sql') && nombre && n > nombre)
    .map((n) => ({ nombre: n, sql: sinComentarios(readFileSync(join(DIR, n), 'utf8')) }));
}

const POLITICAS_SALUD = [
  'salud_condiciones_salud_lectura', 'salud_condiciones_salud_insert', 'salud_condiciones_salud_update', 'salud_condiciones_salud_delete',
  'salud_notas_progreso_select', 'salud_notas_progreso_insert', 'salud_notas_progreso_update', 'salud_notas_progreso_delete',
  'respuestas_cuestionario_salud_lectura', 'respuestas_cuestionario_salud_insert', 'respuestas_cuestionario_salud_update', 'respuestas_cuestionario_salud_delete',
  'salud_respuestas_sesion_select', 'salud_respuestas_sesion_insert', 'salud_respuestas_sesion_update', 'salud_respuestas_sesion_delete',
  'valoraciones_iniciales_salud_lectura',
];

function bloque(politica: string): string {
  const m = SQL.match(new RegExp(`alter policy ${politica} on [^;]*;`, 'i'));
  assert.ok(m, `falta ALTER POLICY ${politica}`);
  return m![0];
}

test('existe la migración que cierra el panel a la instructora', () => {
  assert.ok(nombre, 'falta *_panel_sin_brazo_instructora.sql');
});

test('salud: las 17 políticas quedan solo para la propietaria, con consentimiento', () => {
  for (const p of POLITICAS_SALUD) {
    const b = bloque(p);
    assert.doesNotMatch(b, /INSTRUCTOR|instructora_atiende_socia/, p);
    assert.match(b, /current_rol\(\) = 'PROPIETARIO'/, p);
    assert.match(b, /tiene_consentimiento_salud\(socio_id\)/, p);
  }
  for (const p of ['lecturas_ficha_salud_insercion', 'plantillas_cuestionario_salud_lectura']) {
    assert.doesNotMatch(bloque(p), /INSTRUCTOR/, p);
  }
});

test('clases y reservas: escribir es de quien gestiona el calendario', () => {
  for (const p of ['sesiones_escritura_insert', 'sesiones_escritura_update', 'reservas_escritura_update']) {
    const b = bloque(p);
    assert.doesNotMatch(b, /INSTRUCTOR|current_instructor_id/, p);
    assert.match(b, /puede_gestionar_calendario\(\)/, p);
  }
});

test('fichas de socias y citas: la instructora no las lee; logros y retos: no los escribe', () => {
  for (const p of ['socios_lectura', 'citas_lectura']) {
    assert.match(bloque(p), /current_rol\(\)\) is distinct from 'INSTRUCTOR'/, p);
  }
  for (const p of ['achievement_progress_insert_instructora', 'achievement_progress_update_instructora',
    'challenge_progress_insert_instructora', 'challenge_progress_update_instructora']) {
    assert.match(SQL, new RegExp(`drop policy if exists ${p} on`, 'i'), p);
  }
});

test('ninguna migración posterior le devuelve una rama en estas políticas', () => {
  const vigiladas = [...POLITICAS_SALUD, 'lecturas_ficha_salud_insercion', 'plantillas_cuestionario_salud_lectura',
    'sesiones_escritura_insert', 'sesiones_escritura_update', 'reservas_escritura_update', 'socios_lectura', 'citas_lectura'];
  for (const m of posteriores()) {
    for (const p of vigiladas) {
      const def = m.sql.match(new RegExp(`(create|alter) policy ${p}\\b[^;]*;`, 'i'))?.[0];
      if (def) assert.doesNotMatch(def, /= 'INSTRUCTOR'|current_instructor_id|instructora_atiende_socia/, `${m.nombre}: ${p}`);
    }
  }
});
