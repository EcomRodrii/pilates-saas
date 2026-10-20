// Contrato del logro «Un mes completo sin ninguna falta» (PR 3.4). Sobre el fuente, mismo
// idioma que `crons-vercel-barridos.test.ts`: estos módulos arrastran Supabase y no se importan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');
const soloCodigo = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('el cron de no-shows lanza el barrido mensual DESPUÉS de los no-shows, sin cron nuevo', () => {
  const ruta = soloCodigo(leer('app/api/cron/no-shows/route.ts'));
  assert.ok(ruta.indexOf('barrerNoShows(') > 0);
  assert.ok(ruta.indexOf('barrerLogroMensual(') > ruta.indexOf('barrerNoShows('), 'el mes se mira con las clases ya resueltas');
  const vercel = JSON.parse(leer('vercel.json')) as { crons: { path: string }[] };
  assert.ok(!vercel.crons.some(c => /logro|mensual/i.test(c.path)), 'D8: sin cron nuevo');
});

test('el barrido solo evalúa los días 1–2, el mes cerrado y estudios con el interruptor', () => {
  const f = soloCodigo(leer('lib/db/supabase-data-admin.ts'));
  const ini = f.indexOf('export async function barrerLogroMensual');
  assert.ok(ini > 0);
  const cuerpo = f.slice(ini, f.indexOf('export async function validarKioskToken', ini));
  assert.ok(cuerpo.includes('esDiaDeBarridoMensual('));
  assert.ok(cuerpo.includes('ultimoMesCerrado('));
  assert.ok(cuerpo.includes('logroMensualCerradoEncendido('));
  assert.ok(cuerpo.includes("'gamificacion'"), 'respeta el gate de plan');
  assert.ok(cuerpo.includes('evaluarMesCompleto('));
  assert.ok(cuerpo.includes(".eq('studio_id', studioId)"), 'cada consulta acotada por estudio');
  // el pago va por el motor de logros de siempre (idempotente), no por un sistema paralelo
  assert.ok(cuerpo.includes('evaluarLogrosServidor('));
  assert.ok(!cuerpo.includes('otorgar_credito_disparador'));
});

test('la evaluación por acción no concede el mensual con el interruptor encendido', () => {
  const f = soloCodigo(leer('lib/db/supabase-data-admin.ts'));
  assert.ok(f.includes('mensualSoloAlCerrar = logroMensualCerradoEncendido(studioId)'));
  assert.ok(f.includes('mensualSoloAlCerrar })'));
  const motor = soloCodigo(leer('lib/engines/achievement-engine.ts'));
  assert.ok(motor.includes('if (ctx.mensualSoloAlCerrar) return 0'));
  const panel = soloCodigo(leer('lib/studio-context.tsx'));
  assert.ok(panel.includes("if (def.metric === 'ASISTENCIA_MENSUAL_COMPLETA') return;"), 'el panel ni lo concede ni escribe un 0 por acción');
});
