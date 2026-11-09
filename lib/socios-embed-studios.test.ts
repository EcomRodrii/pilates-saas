import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// PostgREST no sabe embeber `studios` desde `socios` si hay MÁS de un camino entre las dos tablas: además de
// `socios_studio_id_fkey` existen `plaza_fija_sin_cuota_avisos` y `socio_tipos_clase_autorizados` (las dos con socio y
// estudio), y la lectura pelada `studios(...)` / `studios!inner(...)` contesta PGRST201 (Sentry JAVASCRIPT-NEXTJS-46: la
// ficha no podía comprobar la verificación en dos pasos). Quien embeba `studios` desde `socios` tiene que nombrar la clave.
function ficheros(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ficheros(p, acc);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) acc.push(p);
  }
  return acc;
}

test('ningún select de `socios` embebe `studios` sin nombrar la clave (PGRST201)', () => {
  const malos: string[] = [];
  for (const dir of ['lib', 'app', 'components']) {
    for (const f of ficheros(dir)) {
      const s = readFileSync(f, 'utf8');
      // `.from('socios')` seguido, dentro de la misma sentencia, de un `.select(` que embebe `studios`.
      for (const m of s.matchAll(/from\('socios'\)([\s\S]{0,400}?)\.select\(\s*(['`"])([\s\S]*?)\2/g)) {
        const cols = m[3];
        if (/\bstudios\s*(!inner)?\s*\(/.test(cols) && !/studios!socios_studio_id_fkey/.test(cols)) malos.push(`${f}: ${cols.slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(malos, [], 'Nombra la clave: studios!socios_studio_id_fkey(…)');
});
