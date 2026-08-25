import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

test('I-5: conciliarReembolsos está definido y registrado', () => {
  const fuente = leer('lib/inngest/conciliar-reembolsos.ts');
  assert.ok(fuente.includes('export const conciliarReembolsos'), 'debe existir export');
  assert.ok(fuente.includes("id: 'conciliar-reembolsos-disputas'"), 'id debe ser correcto');
  assert.ok(fuente.includes("cron: '0 */2 * * *'"), 'cadencia debe ser cada 2 horas');
});

test('I-5: conciliarReembolsos está importado en inngest/route.ts', () => {
  const route = leer('app/api/inngest/route.ts');
  assert.ok(route.includes("import { conciliarReembolsos }"), 'debe importarse');
  assert.ok(route.includes('conciliarReembolsos,'), 'debe estar en el array de functions');
});
