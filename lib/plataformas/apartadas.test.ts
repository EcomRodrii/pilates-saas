import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hastaCuandoApartadas, PLATAFORMAS_QUE_APARTAN } from './apartadas.ts';

test('hasta cuándo, en hora del estudio: el mismo día solo la hora; otro día, con la fecha', () => {
  // 7-oct-2026, 10:00 en Madrid (08:00 UTC).
  const ahora = new Date('2026-10-07T08:00:00Z');
  assert.equal(hastaCuandoApartadas('2026-10-07T16:00:00Z', ahora), 'hasta las 18:00');
  assert.equal(hastaCuandoApartadas('2026-10-09T16:00:00Z', ahora), 'hasta el 9 de octubre a las 18:00');
  // 23:30 UTC del 7 ya es el 8 en Madrid: otro día.
  assert.equal(hastaCuandoApartadas('2026-10-07T23:30:00Z', ahora), 'hasta el 8 de octubre a las 01:30');
});

test('las plataformas que apartan son las mismas en SQL y aquí', () => {
  const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  const ultima = readdirSync(dir).filter(n => n.endsWith('.sql')).sort()
    .map(n => readFileSync(join(dir, n), 'utf8'))
    .filter(sql => /function public\.plataformas_que_apartan\(\)/.test(sql)).pop();
  assert.ok(ultima, 'no hay plataformas_que_apartan() en las migraciones');
  const m = ultima!.match(/function public\.plataformas_que_apartan\(\)[\s\S]*?array\[([^\]]*)\]/);
  const enSql = (m?.[1] ?? '').split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepEqual(enSql, [...PLATAFORMAS_QUE_APARTAN]);
});
