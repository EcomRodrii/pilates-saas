import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HORIZONTE_MATERIALIZAR_DIAS, HORIZONTE_AVISOS_PLAZA_FIJA_DIAS } from './plazas-fijas-slot.ts';

// Guardia de la migración que hace el motor de plazas fijas más robusto
// (20260921205935). El comportamiento se probó contra la base de datos con una
// transacción que se deshace; esto fija lo que un cambio de texto podría romper
// sin que ningún otro test lo viera: permisos, firma y el horizonte compartido.

const RAIZ = join(import.meta.dirname, '..');
const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '');
const SQL = sinComentarios(readFileSync(join(RAIZ, 'supabase/migrations/20260921205935_plazas_fijas_motor_robusto.sql'), 'utf8'));

test('el envoltorio conserva su firma pública (y con ella sus permisos) y solo delega', () => {
  assert.match(SQL, /create or replace function public\.materializar_plazas_fijas\(\s*p_horizonte_dias integer default 42,\s*p_plaza_id\s+text\s+default null\s*\) returns integer/);
  assert.match(SQL, /return public\.materializar_plazas_fijas_interno\(p_horizonte_dias, p_plaza_id, null\);/);
});

test('las cuatro funciones quedan cerradas a service_role, con los tres pasos', () => {
  for (const f of [
    'materializar_plazas_fijas_interno\\(integer, text, text\\[\\]\\)', 'materializar_plazas_fijas_sesiones_nuevas\\(\\)',
    'materializar_plazas_fijas\\(integer, text\\)', 'plazas_fijas_sin_materializar\\(integer\\)',
  ]) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${f} from public;`));
    assert.match(SQL, new RegExp(`revoke all on function public\\.${f} from anon;`));
    assert.match(SQL, new RegExp(`revoke all on function public\\.${f} from authenticated;`));
    assert.match(SQL, new RegExp(`grant execute on function public\\.${f} to service_role;`));
  }
});

test('B2: una cancelación respeta la regeneración sea cual sea el origen de la reserva', () => {
  assert.doesNotMatch(SQL, /res-pf-%/, 'volver a filtrar por el id de la reserva reabre el fallo de las cancelaciones a mano');
  assert.equal((SQL.match(/cancelada_motivo is distinct from 'plaza_fija_retirada'/g) ?? []).length, 2, 'motor y barrido de avisos');
});

test('B3: el motor y el barrido de avisos usan la misma regla de solape que reservar_plaza', () => {
  assert.equal((SQL.match(/socio_tiene_conflicto_horario\(/g) ?? []).length, 2);
  assert.match(SQL, /'conflicto_horario'::text as motivo/);
});

test('B1: crear una clase reserva sus plazas fijas al momento, y nunca puede impedir crearla', () => {
  assert.match(SQL, /after insert on public\.sesiones\s+referencing new table as nuevas\s+for each statement/);
  assert.match(SQL, /exception when others then\s+raise warning/);
  // El horizonte del disparador y el de TS son el mismo número: si uno cambia, el otro también.
  assert.match(SQL, new RegExp(`materializar_plazas_fijas_interno\\(${HORIZONTE_MATERIALIZAR_DIAS}, null, v_ids\\)`));
});

test('el disparador solo trabaja con las sesiones NUEVAS, y el motor parte siempre de ellas', () => {
  // Sin esto el coste de crear una clase dependía de cuántas plazas hay en toda la plataforma, y un
  // statement_timeout no lo captura ningún `when others`.
  assert.match(SQL, /from nuevas n\s+where n\.sala_id is not null[\s\S]*?exists \(\s*select 1 from plazas_fijas pf\s+where pf\.estado = 'ACTIVA' and pf\.studio_id = n\.studio_id and pf\.sala_id = n\.sala_id/);
  assert.equal((SQL.match(/with ses as materialized \(/g) ?? []).length, 2, 'el bloqueo y el motor');
  assert.match(SQL, /for no key update;/);
});

test('un horizonte NULL sigue sin reservar nada en el envoltorio público', () => {
  assert.match(SQL, /if p_horizonte_dias is null then\s+return 0;\s+end if;/);
});

test('el motor mira más lejos de lo que se avisa a la alumna', () => {
  assert.ok(HORIZONTE_MATERIALIZAR_DIAS > HORIZONTE_AVISOS_PLAZA_FIJA_DIAS);
});
