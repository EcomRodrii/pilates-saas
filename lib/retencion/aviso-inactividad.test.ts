// El barrido importa `server-only` y Resend: se comprueba sobre el FUENTE, como el resto de crons
// (lib/decision/resumen-semanal-cron.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fuente = readFileSync(join(import.meta.dirname, 'aviso-inactividad.ts'), 'utf8');
const ruta = readFileSync(join(import.meta.dirname, '../../app/api/cron/notif-trial/route.ts'), 'utf8');
const migracion = readFileSync(join(import.meta.dirname, '../../supabase/migrations/20261123230827_avisos_inactividad_30_dias.sql'), 'utf8');

test('apagado por defecto: lo primero que hace el barrido es comprobar AVISO_INACTIVIDAD', () => {
  const i = fuente.indexOf('avisoInactividadActivo(entorno)');
  assert.ok(i > 0 && i < fuente.indexOf("rpc('situacion_estudios')"), 'sin el interruptor encendido no se debe ni medir');
});

test('reclama la fila ANTES de enviar y, si el envío falla, la suelta para reintentar', () => {
  const reclamo = fuente.indexOf(".insert({ studio_id: f.studio_id");
  const envio = fuente.indexOf('enviarAvisoInactividad({');
  assert.ok(reclamo > 0 && reclamo < envio, 'compare-and-set antes de mandar: dos pasadas a la vez no pueden enviar dos correos');
  assert.match(fuente, /23505[^\n]*continue/, 'un choque de la reclamación no reenvía');
  assert.match(fuente, /\.delete\(\)\.eq\('studio_id', f\.studio_id\)/, 'sin soltar la reclamación, un fallo de Resend dejaría a ese estudio sin aviso para siempre');
});

test('si Resend falla se para la pasada (no se insiste con el siguiente) y se avisa a Sentry', () => {
  assert.match(fuente, /Sentry\.captureMessage\('\[aviso-inactividad\]/);
  assert.match(fuente, /break; \/\/ si Resend falla/);
});

test('solo avisa: nada borra ni cambia un estudio', () => {
  assert.ok(!/from\('studios'\)\s*\.(update|delete)/.test(fuente));
  assert.ok(!/\.rpc\('(?!situacion_estudios)/.test(fuente), 'el único RPC es la lectura de situacion_estudios');
  assert.ok(!/admin\.storage|r2|borrar/i.test(fuente));
});

test('cuelga del cron horario que ya existe (sin cron nuevo) y cada paso va aislado', () => {
  assert.match(ruta, /avisarEstudiosInactivos\(requireSupabaseAdmin\(\)\)/);
  assert.match(ruta, /avisoInactividad = \{ error:/);
});

test('la tabla es solo del servidor y lleva la política del segundo paso', () => {
  assert.match(migracion, /enable row level security/);
  assert.match(migracion, /revoke all on public\.avisos_inactividad from public, anon, authenticated/);
  assert.match(migracion, /grant select, insert, delete on public\.avisos_inactividad to service_role/);
  assert.match(migracion, /create policy exige_doble_factor on public\.avisos_inactividad as restrictive/);
});
