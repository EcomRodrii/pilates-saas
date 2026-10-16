import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COLUMNAS_ESTUDIO_INSERTABLES } from './alta-escritura-navegador.ts';

// El navegador crea un estudio con SOLO las columnas del alta y no lo borra nunca (migración
// 20261016115000). La cerradura real es la base de datos (REVOKE de tabla + GRANT por columnas); este
// fichero fija que el CÓDIGO, la lista que lo declara y la migración dicen lo mismo. Lo que hace la base
// de datos de verdad se prueba en `supabase/tests/rls-studios-alta-y-borrado.test.ts` (CI, contra Postgres).

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

function migracion(): string {
  const dir = join(raiz, 'supabase', 'migrations');
  const nombre = readdirSync(dir).find(n => n.endsWith('_studios_alta_y_borrado_solo_lo_necesario.sql'));
  assert.ok(nombre, 'no existe la migración de alta y borrado de studios');
  return readFileSync(join(dir, nombre), 'utf8').replace(/^\s*--.*$/gm, '');
}

test('la migración quita el DELETE y el INSERT de tabla y concede exactamente las columnas de la lista', () => {
  const sql = migracion();
  assert.match(sql, /revoke delete on public\.studios from authenticated;/);
  const revoke = sql.indexOf('revoke insert on public.studios from authenticated;');
  assert.ok(revoke >= 0, 'la migración no quita el INSERT de tabla a authenticated');
  const m = sql.match(/grant insert \(([^)]+)\) on public\.studios to authenticated;/);
  assert.ok(m, 'la migración no concede INSERT por columnas a authenticated');
  assert.ok(revoke < sql.indexOf(m[0]), 'el GRANT por columnas va DESPUÉS del REVOKE de tabla');
  assert.deepEqual(m[1].split(',').map(c => c.trim()).sort(), [...COLUMNAS_ESTUDIO_INSERTABLES].sort());
  // La verificación del final repite la lista: que no se quede vieja.
  assert.ok(sql.includes(`'${[...COLUMNAS_ESTUDIO_INSERTABLES].sort().join(',')}'`), 'la verificación de la migración no comprueba la misma lista');
  assert.doesNotMatch(sql, /grant [^;]* to (public|anon)\b/i);
});

test('el alta (dbCreateStudio) solo manda columnas de la lista, y las manda todas las que la lista declara', () => {
  const src = leer('lib/supabase-data.ts');
  const inicio = src.indexOf("await supabase.from('studios').insert({");
  assert.ok(inicio >= 0, 'no se encuentra el INSERT del alta en dbCreateStudio');
  const fin = src.indexOf('} satisfies Partial<Record<ColumnaEstudioInsertable, unknown>>);', inicio);
  assert.ok(fin > inicio, 'el INSERT del alta ya no se comprueba con `satisfies` contra la lista');
  const cuerpo = src.slice(inicio, fin).replace(/\/\/.*$/gm, '');
  // Una clave por línea (`nombre: …` o abreviada, `id,`) y la del spread condicional (`{ tipo_cuenta: … }`).
  const claves = new Set([
    ...[...cuerpo.matchAll(/^\s*([a-z_]+)\s*[:,]/gm)].map(x => x[1]),
    ...[...cuerpo.matchAll(/\{\s*([a-z_]+):/g)].map(x => x[1]),
  ]);
  assert.deepEqual([...claves].sort(), [...COLUMNAS_ESTUDIO_INSERTABLES].sort());
});

test('ningún código del navegador borra un estudio ni lo crea fuera del alta', () => {
  // Escritores de `studios` que no son el cliente de servidor (admin / service role). Un INSERT o DELETE
  // nuevo con la sesión de la persona falla en producción (42501): que se vea aquí antes.
  const ficheros: string[] = [];
  const recorrer = (dir: string) => {
    for (const n of readdirSync(join(raiz, dir))) {
      const p = join(dir, n);
      if (n === 'node_modules' || n.startsWith('.')) continue;
      if (statSync(join(raiz, p)).isDirectory()) recorrer(p);
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) ficheros.push(p);
    }
  };
  for (const d of ['app', 'components', 'lib']) recorrer(d);

  const sospechosos: string[] = [];
  for (const f of ficheros) {
    const src = readFileSync(join(raiz, f), 'utf8');
    for (const m of src.matchAll(/(\w+)\s*\.from\(\s*['"]studios['"]\s*\)\s*\.\s*(insert|upsert|delete)\(/g)) {
      const [, cliente, op] = m;
      if (/admin/i.test(cliente)) continue;
      const esElAlta = f === join('lib', 'supabase-data.ts') && op === 'insert'
        && src.slice(Math.max(0, m.index - 6000), m.index).includes('export async function dbCreateStudio(');
      if (!esElAlta) sospechosos.push(`${f}: ${cliente}.from('studios').${op}(`);
    }
  }
  assert.deepEqual(sospechosos, []);
});
