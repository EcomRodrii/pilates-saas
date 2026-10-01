import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RUTAS } from './openapi.ts';

// La API pública corre con service-role: la RLS NO está debajo. Lo único que
// separa a un estudio de otro es que cada consulta filtre por `ctx.studioId`.
// Esto lo exige en CADA fichero de app/api/v1, y que todos pasen por la misma
// puerta (`conApiPublica`), que es la que autentica, limita y audita.

const RAIZ = join(import.meta.dirname, '..', '..');
const V1 = join(RAIZ, 'app', 'api', 'v1');

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return rutas(p);
    return n === 'route.ts' ? [p] : [];
  });
}
const ficheros = rutas(V1).map((p) => ({ p, ruta: '/' + relative(V1, p).replace(/\/route\.ts$/, '').replace(/\[(\w+)\]/g, '{$1}'), src: readFileSync(p, 'utf8') }));
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('hay rutas que comprobar', () => {
  assert.ok(ficheros.length >= 14, `solo ${ficheros.length} rutas en app/api/v1`);
});

for (const f of ficheros) {
  if (f.ruta === '/openapi.json') continue;
  const codigo = sinComentarios(f.src);

  test(`${f.ruta}: pasa por conApiPublica en cada método`, () => {
    const metodos = [...codigo.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(m => m[1]);
    assert.ok(metodos.length > 0, 'no exporta ningún método');
    const usos = (codigo.match(/conApiPublica\(/g) ?? []).length;
    assert.equal(usos, metodos.length, 'cada método tiene que envolverse en conApiPublica');
  });

  test(`${f.ruta}: toda consulta va acotada al estudio de la credencial`, () => {
    const consultas = (codigo.match(/admin\s*\.from\(/g) ?? []).length;
    // `studios` se acota por su clave (`id`): es la única tabla sin `studio_id`.
    const acotadas = (codigo.match(/\.eq\('studio_id', ctx\.studioId\)|from\('studios'\)[^;]*\.eq\('id', ctx\.studioId\)/g) ?? []).length;
    const porAyudante = /\b(listar|obtener)\(req|\bobtener\(admin/.test(codigo);
    assert.ok(consultas === 0 || acotadas >= consultas, `${consultas} consultas y solo ${acotadas} filtran por ctx.studioId`);
    assert.ok(consultas > 0 || porAyudante || /registrarSociaPublica|crearReservaPublica|cancelarReservaPublica|crearNotaInternaAdmin|crearTareaAdmin/.test(codigo),
      'ni consulta acotada ni ayudante que la acote');
  });

  test(`${f.ruta}: nunca select('*') hacia fuera`, () => {
    assert.doesNotMatch(codigo, /select\(\s*['"]\*['"]\s*\)/);
  });
}

test('los ayudantes de listado acotan SIEMPRE al estudio', () => {
  const src = sinComentarios(readFileSync(join(RAIZ, 'lib', 'api-publica', 'listado.ts'), 'utf8'));
  assert.match(src, /\.select\(o\.columnas\)\.eq\('studio_id', ctx\.studioId\)/);
  assert.match(src, /\.eq\('studio_id', ctx\.studioId\)\.eq\('id', o\.id\)/);
});

test('cada ruta de app/api/v1 está en la especificación OpenAPI, y al revés', () => {
  const enCodigo = ficheros.map(f => f.ruta).filter(r => r !== '/openapi.json').sort();
  assert.deepEqual(enCodigo, Object.keys(RUTAS).sort());
});
