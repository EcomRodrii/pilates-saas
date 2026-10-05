import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// pg_cron llama a /api/cron/backups con `timeout_milliseconds := 120000`. Si la
// función tarda más, `vigilar-jobs-http` da la noche por fallida aunque las
// copias hayan salido (Sentry, 4-oct-2026). El traslado al bucket de la UE es
// lo único largo: tiene que cortar antes de esos 120 s.
test('el traslado nocturno al bucket de la UE corta antes del timeout de pg_cron', () => {
  const fuente = readFileSync(new URL('./ejecutar-copia-diaria.ts', import.meta.url), 'utf8');
  const m = fuente.match(/trasladarAlBucketUe\(\{[^}]*hastaMs:\s*inicio \+ ([\d_]+)\s*\}/);
  assert.ok(m, 'el tope del traslado se cuenta desde el arranque de la función');
  const ms = Number(m[1].replace(/_/g, ''));
  assert.ok(ms <= 100_000, `tope ${ms} ms: deja menos de 20 s de margen sobre los 120 s de pg_cron`);
});
