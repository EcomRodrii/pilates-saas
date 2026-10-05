import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Las tablas del Decision OS se leen y se escriben con service-role, sin RLS: el
// filtro por estudio lo pone cada consulta o no lo pone nadie. Y desde la
// migración 20261005121107 solo el servidor las escribe — el navegador
// conserva la lectura. Estático: lib/decision/db.ts importa el servidor.

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const DB = sinComentarios(leer('lib/decision/db.ts'));

function cuerpoDe(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `falta ${firma}`);
  return src.slice(i, src.indexOf('\n}\n', i));
}

test('dbGetRecomendacion: acotada al estudio cuando se sabe cuál, y un fallo de lectura no se confunde con «no existe»', () => {
  const f = cuerpoDe(DB, 'export async function dbGetRecomendacion(');
  assert.match(f, /dbGetRecomendacion\(id: string, studioId\?: string\): Promise<Recomendacion \| null \| undefined>/);
  assert.match(f, /if \(studioId !== undefined\) consulta = consulta\.eq\('studio_id', studioId\);/);
  assert.match(f, /if \(error\) \{ reportError\('\[dbGetRecomendacion\]', error\); return undefined; \}/);
});

test('el veredicto del día no puede enseñar la recomendación de otro estudio', () => {
  const src = sinComentarios(leer('app/api/decisiones/route.ts'));
  assert.match(src, /await dbGetRecomendacion\(mensajeHoy\.recomendacionId, sesion\.studioId\)/);
  // Ni una lectura sin acotar en esta ruta.
  assert.doesNotMatch(src, /dbGetRecomendacion\([^,)]+\)/);
  // Si no se ha podido leer, un error que reintentar, no «Todo bajo control».
  assert.match(src, /if \(recomendacionGanadora === undefined\) \{\s*return NextResponse\.json\(\{ error: [^}]+\}, \{ status: 500 \}\);/);
});

test('la calibración del Umbral solo cuenta recomendaciones de su estudio', () => {
  const f = cuerpoDe(DB, 'export async function dbCalcularSeguimientoPorTipo(');
  const recos = f.slice(f.indexOf(".from('recomendaciones')"));
  assert.match(recos.slice(0, recos.indexOf(';')), /\.eq\('studio_id', studioId\)/);
});

test('el refresco del análisis no devuelve a PENDIENTE una recomendación recién aprobada', () => {
  const f = cuerpoDe(DB, 'export async function dbUpsertRecomendacion(');
  const update = f.slice(f.indexOf(".from('recomendaciones').update("));
  assert.match(update.slice(0, update.indexOf(';')), /\.update\(actualizable\)\.eq\('id', existente\.id\)\.eq\('estado', 'PENDIENTE'\)/);
});

// ─── Solo el servidor escribe ────────────────────────────────────────────────
const TABLAS = ['recomendaciones', 'recomendacion_outcomes', 'decision_mensajes_dia'] as const;

test('la migración quita a `authenticated` la escritura de las tres tablas, y no se la devuelve', () => {
  const sql = leer('supabase/migrations/20261005121107_recomendaciones_resultado_y_escritura_solo_servidor.sql').replace(/--.*$/gm, '');
  for (const t of TABLAS) {
    assert.match(sql, new RegExp(`revoke insert, update, delete on table public\\.${t} from authenticated;`, 'i'), t);
  }
  assert.doesNotMatch(sql, /\bgrant\b/i, 'nada de grants en esta migración');
});

/** Ficheros .ts/.tsx de código (sin tests) bajo `dir`. */
function fuentes(dir: string): string[] {
  return readdirSync(join(RAIZ, dir)).flatMap((n) => {
    const rel = join(dir, n);
    if (statSync(join(RAIZ, rel)).isDirectory()) return n === 'node_modules' ? [] : fuentes(rel);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [relative('.', rel)] : [];
  });
}

test('nadie fuera de lib/decision/db.ts las escribe (con la migración, desde el navegador ya no podría)', () => {
  const fuera: string[] = [];
  for (const ruta of [...fuentes('app'), ...fuentes('components'), ...fuentes('lib')]) {
    if (ruta === 'lib/decision/db.ts' || ruta === 'lib/db-types.ts') continue;
    const crudo = leer(ruta);
    if (!TABLAS.some(t => crudo.includes(t))) continue;
    const src = sinComentarios(crudo);
    for (const t of TABLAS) {
      for (const m of src.matchAll(new RegExp(`\\.from\\(['"\`]${t}['"\`]\\)`, 'g'))) {
        const cadena = src.slice(m.index, src.indexOf(';', m.index));
        if (/\.(insert|update|upsert|delete)\(/.test(cadena)) fuera.push(`${ruta}: ${t}`);
      }
    }
  }
  assert.deepEqual(fuera, []);
});
