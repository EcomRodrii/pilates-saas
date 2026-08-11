// ─────────────────────────────────────────────────────────────────────────────
// Regresión: `enviarEmailResumenSemanal` no pasa por `publish()` (motor de
// notificaciones), así que no tiene ningún `dedup_key` de fábrica — va
// directo a Resend. Sin una reclamación previa, invocar el barrido dos veces
// la misma semana (a mano, un reintento, un doble tick) manda el email dos
// veces de verdad. Se detectó verificando en vivo el piloto de pg_cron
// (2026-08-11): un curl manual de prueba mandó un email real.
//
// Se comprueba sobre el FUENTE, no importando el módulo (arrastra
// @/lib/db/supabase-admin y el resto del pipeline del Umbral) — mismo idioma
// que ya usa lib/inngest/crons-paginacion.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fuente = readFileSync(join(import.meta.dirname, 'resumen-semanal-cron.ts'), 'utf8');

test('resumen-semanal: reclama la fila de dedup ANTES de llamar a enviarEmailResumenSemanal', () => {
  const idxInsert = fuente.indexOf(".from('resumen_semanal_envios')");
  const idxEnviar = fuente.indexOf('enviarEmailResumenSemanal({');
  assert.ok(idxInsert > 0, 'no encuentro el INSERT de reclamación en resumen_semanal_envios');
  assert.ok(idxEnviar > 0, 'no encuentro la llamada a enviarEmailResumenSemanal');
  assert.ok(
    idxInsert < idxEnviar,
    'la reclamación debe ir ANTES del envío (compare-and-set) — al revés, dos invocaciones concurrentes podrían enviar las dos antes de que ninguna reclame',
  );
});

test('resumen-semanal: un choque de la reclamación (23505) no reenvía', () => {
  assert.match(
    fuente,
    /23505[\s\S]{0,80}skipped/,
    'si el INSERT choca por PRIMARY KEY (studio_id, semana_lunes) ya repetido, debe saltarse el envío, no reintentar ni lanzar',
  );
});
