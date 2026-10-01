import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// El cron de los webhooks corre cada minuto, pero solo puede costar una
// invocación de Vercel cuando hay trabajo: el `where exists` va ANTES del POST.
// Sin él serían 43.200 invocaciones al mes para no hacer nada.

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const M = readFileSync(join(RAIZ, 'supabase/migrations/20261001170000_api_webhooks.sql'), 'utf8');
const RUTA = readFileSync(join(RAIZ, 'app/api/cron/api-webhooks/route.ts'), 'utf8');

test('api-webhooks: cada minuto, y solo si hay eventos o entregas pendientes', () => {
  const ini = M.indexOf("'api-webhooks',");
  const cuerpo = M.slice(ini, M.indexOf('$$\n);', ini));
  assert.match(cuerpo, /'\* \* \* \* \*'/);
  assert.match(cuerpo, /url := 'https:\/\/www\.tentare\.app\/api\/cron\/api-webhooks'/);
  assert.match(cuerpo, /where exists \(select 1 from public\.api_eventos where procesado_en is null\)/);
  assert.match(cuerpo, /or exists \(select 1 from public\.api_webhook_entregas where estado = 'PENDIENTE' and proximo_intento_en <= now\(\)\)/);
});

test('la ruta cabe de sobra en el timeout del cron (si no, el vigilante AUT-10 lo da por caído)', () => {
  const timeout = Number(/timeout_milliseconds := (\d+)/.exec(M.slice(M.indexOf("'api-webhooks',")))![1]);
  const presupuesto = Number(/PRESUPUESTO_ENTREGAS_MS = ([\d_]+)/.exec(RUTA)![1].replace(/_/g, ''));
  // Presupuesto + un envío entero (8 s) + procesar eventos: por debajo del timeout.
  assert.ok(presupuesto + 8_000 + 5_000 < timeout, `${presupuesto} ms de presupuesto con ${timeout} ms de timeout`);
});

test('el registro se purga a los 30 días (lo que promete la guía)', () => {
  assert.match(M, /'api-eventos-purgar',[\s\S]*?delete from public\.api_eventos where creado_en < now\(\) - interval '30 days'/);
});
