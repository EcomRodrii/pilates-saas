import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASE_URL, PAGINAS, PREFIJOS_NO_INDEXABLES, esNoIndexable, paginaDe, relacionadasDe, urlDe, funcionalidades,
} from './paginas.ts';
import { LEGAL } from '../legal-info.ts';

// ─── Recorrido del árbol de rutas ────────────────────────────────────────────

const RAIZ_APP = join(process.cwd(), 'app');

/**
 * Todas las rutas ESTÁTICAS de `app/` (una por `page.tsx`), con los route-groups
 * `(...)` colapsados. Las dinámicas (`[slug]`) se excluyen: por definición no son
 * una URL, sino un patrón, y las que hay o están bloqueadas o son del portal.
 */
function rutasEstaticas(dir = RAIZ_APP, prefijo = ''): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (entrada === 'page.tsx') {
      rutas.push(prefijo === '' ? '/' : prefijo);
      continue;
    }
    if (!statSync(completo).isDirectory()) continue;
    if (entrada.startsWith('[') || entrada.startsWith('_') || entrada.startsWith('@')) continue;
    // Route-group: no aporta segmento de URL.
    const segmento = entrada.startsWith('(') && entrada.endsWith(')') ? '' : `/${entrada}`;
    rutas.push(...rutasEstaticas(completo, prefijo + segmento));
  }
  return rutas;
}

// ─── El test que existe para que no se repita el fallo de /comparativa ───────

test('toda página pública de app/ está en el registro SEO', () => {
  const publicas = rutasEstaticas().filter((r) => !esNoIndexable(r));
  const faltan = publicas.filter((r) => !paginaDe(r));
  assert.deepEqual(
    faltan,
    [],
    `Estas páginas son rastreables pero no están en lib/seo/paginas.ts, así que no entran en el sitemap ` +
    `ni en el interlinking: ${faltan.join(', ')}. Añádelas al registro o bloquéalas en PREFIJOS_NO_INDEXABLES.`,
  );
});

test('toda página del registro existe de verdad en app/', () => {
  const existentes = new Set(rutasEstaticas());
  const fantasmas = PAGINAS.filter((p) => !existentes.has(p.path)).map((p) => p.path);
  assert.deepEqual(fantasmas, [], `Registradas en el sitemap pero sin page.tsx: ${fantasmas.join(', ')}`);
});

test('ninguna ruta del panel de gestión queda sin bloquear', () => {
  // El fallo real que esto caza: `app/(dashboard)/cierre` y compañía vivían en
  // la raíz del route-group, así que su URL es `/cierre` — y la lista de robots
  // solo nombraba algunas. Ocho quedaban rastreables.
  const delPanel = rutasEstaticas(join(RAIZ_APP, '(dashboard)'));
  const sinBloquear = delPanel.filter((r) => !esNoIndexable(r));
  assert.deepEqual(sinBloquear, [], `Rutas del panel rastreables: ${sinBloquear.join(', ')}`);
});

// ─── Integridad del registro ─────────────────────────────────────────────────

test('los paths son únicos, absolutos y sin barra final', () => {
  const vistos = new Set<string>();
  for (const p of PAGINAS) {
    assert.ok(p.path.startsWith('/'), `path no absoluto: ${p.path}`);
    assert.ok(p.path === '/' || !p.path.endsWith('/'), `path con barra final: ${p.path}`);
    assert.ok(!vistos.has(p.path), `path duplicado: ${p.path}`);
    vistos.add(p.path);
  }
});

test('no hay dos páginas con el mismo title ni la misma description', () => {
  // Duplicar cualquiera de los dos es la señal más directa de contenido
  // duplicado que Google recoge.
  for (const campo of ['titulo', 'descripcion'] as const) {
    const vistos = new Map<string, string>();
    for (const p of PAGINAS) {
      const previo = vistos.get(p[campo]);
      assert.equal(previo, undefined, `${campo} repetido entre ${previo} y ${p.path}`);
      vistos.set(p[campo], p.path);
    }
  }
});

test('los títulos y descripciones caben en un resultado de búsqueda', () => {
  // 80 es el techo duro, no el objetivo: Google recorta el título alrededor de
  // los 60-65 caracteres. El de la home ya iba en 78 antes de este registro y
  // no se toca aquí —es la página comercial principal y su copy es una decisión
  // de producto, no de este cambio—, pero nada nuevo debería acercarse.
  for (const p of PAGINAS) {
    assert.ok(p.titulo.length <= 80, `title de ${p.path} demasiado largo (${p.titulo.length})`);
    assert.ok(p.descripcion.length >= 70, `description de ${p.path} demasiado corta (${p.descripcion.length})`);
    assert.ok(p.descripcion.length <= 200, `description de ${p.path} demasiado larga (${p.descripcion.length})`);
  }
});

test('ninguna página relacionada apunta a un path inexistente', () => {
  for (const p of PAGINAS) {
    for (const r of p.relacionadas ?? []) {
      assert.ok(paginaDe(r), `${p.path} enlaza a ${r}, que no está en el registro`);
      assert.notEqual(r, p.path, `${p.path} se enlaza a sí misma`);
    }
  }
});

test('ninguna funcionalidad queda huérfana: el hub las enlaza todas', () => {
  // El hub las pinta desde `funcionalidades()`, así que basta comprobar que la
  // lista y el registro no han divergido.
  const enRegistro = PAGINAS.filter((p) => p.path.startsWith('/funcionalidades/')).map((p) => p.path).sort();
  const enHub = funcionalidades().map((p) => p.path).sort();
  assert.deepEqual(enHub, enRegistro);
});

test('ninguna página queda huérfana', () => {
  // Tres formas legítimas de recibir enlace interno:
  //  1. estar en las `relacionadas` de otra página,
  //  2. colgar de un hub que sí está en el registro — /comparativa lista sus 7
  //     hijas, /recursos sus guías y /funcionalidades sus 10 áreas,
  //  3. estar en la navegación o el footer, que es el caso de la home y las
  //     páginas legales.
  const entrantes = new Set(PAGINAS.flatMap((p) => p.relacionadas ?? []));
  const enNavegacion = new Set(['/', ...PAGINAS.filter((p) => p.grupo === 'legal').map((p) => p.path)]);
  const padreDe = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';

  const huerfanas = PAGINAS
    .filter((p) => !enNavegacion.has(p.path))
    .filter((p) => !entrantes.has(p.path))
    .filter((p) => !(p.path.lastIndexOf('/') > 0 && paginaDe(padreDe(p.path))))
    .map((p) => p.path);
  assert.deepEqual(huerfanas, [], `Sin ningún enlace interno entrante: ${huerfanas.join(', ')}`);
});

test('urlDe no genera barras duplicadas', () => {
  assert.equal(urlDe('/'), BASE_URL);
  assert.equal(urlDe('/precios'), `${BASE_URL}/precios`);
  assert.ok(!urlDe('/precios').includes('//precios'));
});

test('relacionadasDe resuelve las páginas y descarta lo que no existe', () => {
  const rel = relacionadasDe('/funcionalidades/sustituciones');
  assert.ok(rel.length > 0);
  assert.ok(rel.every((p) => typeof p.etiqueta === 'string' && p.etiqueta.length > 0));
  assert.deepEqual(relacionadasDe('/no-existe'), []);
});

test('esNoIndexable usa prefijo de cadena, como robots.txt', () => {
  // `/portal` tiene que cubrir `/portal-preview` (no es subruta, pero robots.txt
  // no razona por segmentos) y NO puede cubrir `/funcionalidades/...`.
  assert.equal(esNoIndexable('/portal-preview/x'), true);
  assert.equal(esNoIndexable('/reservar/mi-estudio'), true);
  assert.equal(esNoIndexable('/funcionalidades/sustituciones'), false);
  assert.equal(esNoIndexable('/precios'), false);
});

test('ningún prefijo bloqueado tumba una página del registro', () => {
  // Red de seguridad de la trampa anterior: si alguien añade '/fun' a la lista
  // de bloqueo, diez páginas desaparecen del índice en silencio.
  const bloqueadas = PAGINAS.filter((p) => esNoIndexable(p.path)).map((p) => p.path);
  assert.deepEqual(bloqueadas, [], `Páginas del registro bloqueadas por robots: ${bloqueadas.join(', ')}`);
  assert.ok(PREFIJOS_NO_INDEXABLES.length > 0);
});

test('el origen canónico es el host que sirve el sitio de verdad', () => {
  // `tentare.app` a secas devuelve un 308 hacia `www.tentare.app` (medido
  // 2026-08-11). Declarar el ápice dejaba a TODAS las páginas con un canonical
  // apuntando a una URL que redirige. Si algún día se quita ese redirect, este
  // test es el sitio donde consta por qué lleva www.
  assert.equal(BASE_URL, 'https://www.tentare.app');
  assert.equal(BASE_URL, LEGAL.url, 'BASE_URL debe derivar de LEGAL.url, no ser una segunda copia');
  assert.ok(!BASE_URL.endsWith('/'), 'sin barra final: urlDe la concatena');
});

test('nadie escribe el origen a mano fuera de lib/legal-info.ts', () => {
  // La divergencia que originó todo esto: el origen estaba copiado en
  // paginas.ts, en el layout raíz, en StructuredData y en 18 páginas con su
  // canonical a pelo. Se corrigieron todas a la vez; esto impide que vuelva a
  // colarse una copia nueva.
  const RAIZ = process.cwd();
  const EXENTOS = [
    'lib/legal-info.ts',        // la definición
    'lib/seo/paginas.ts',       // la deriva y la documenta en un comentario
    'lib/seo/paginas.test.ts',  // este fichero
  ];
  const sospechosos: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (['node_modules', '.next', '.git'].includes(e.name)) continue;
        recorrer(rel);
      } else if (/\.tsx?$/.test(e.name) && !EXENTOS.includes(rel)) {
        // Se busca el DOMINIO, con o sin www: cualquiera de las dos formas
        // escrita a mano es una segunda fuente de verdad.
        if (/https:\/\/(www\.)?tentare\.app/.test(readFileSync(join(RAIZ, rel), 'utf8'))) {
          sospechosos.push(rel);
        }
      }
    }
  };
  for (const raiz of ['app', 'components', 'lib']) recorrer(raiz);

  // Los tests que usan el dominio como DATO de prueba (un enlace cualquiera que
  // sanear, una condición de tema) no son una segunda fuente de verdad.
  const reales = sospechosos.filter((f) => !f.endsWith('.test.ts'));
  assert.deepEqual(reales, [],
    `Origen escrito a mano; usa urlDe() o LEGAL.url: ${reales.join(', ')}`);
});
