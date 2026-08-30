import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: si una tabla declara su PK como `id text primary key` SIN DEFAULT,
// todo `.insert(` sobre ella tiene que poner el `id` a mano.
//
// Auditoría 29-ago-2026: `POST /api/public/social/companeras` insertaba sin
// `id` sobre `socio_companeras` (`id text primary key`, sin default). Todas las
// solicitudes de "compañera de clase" morían con 23502 desde el día que se
// desplegó la pieza — verificado en producción, 0 filas en la tabla. Con
// typecheck, lint y 3.343 tests en verde: el tipo `RowSocioCompaneras` no
// distingue "columna obligatoria sin default" de "la pone Postgres".
//
// El test cruza las migraciones (fuente de verdad del esquema) con el código:
// no hay que mantener una lista a mano, una tabla nueva con la misma forma
// queda cubierta sola.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');

function ficherosTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) ficherosTs(p, acc);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

// Tablas con `id text primary key` y sin `default` en la misma línea.
function tablasConIdTextSinDefault(): Set<string> {
  const dir = join(RAIZ, 'supabase/migrations');
  const out = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sql')) continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const tabla = m[1];
      const cuerpo = m[2];
      const lineaId = cuerpo.split('\n').find(l => /^\s*id\s+text\b/i.test(l));
      if (!lineaId) continue;
      if (!/primary\s+key/i.test(lineaId)) continue;
      if (/\bdefault\b/i.test(lineaId)) continue;
      out.add(tabla);
    }
  }
  return out;
}

test('todo .insert() sobre una tabla con `id text primary key` sin default pone el id', () => {
  const tablas = tablasConIdTextSinDefault();
  // Control positivo: si el parser deja de encontrar tablas, el test pasaría
  // vacío y no protegería nada.
  assert.ok(tablas.size > 5, `el parser de migraciones solo vio ${tablas.size} tablas: revísalo`);
  assert.ok(tablas.has('socio_companeras'), 'socio_companeras debería estar: es el caso que originó este test');

  const fallos: string[] = [];
  for (const carpeta of ['lib', 'app']) {
    for (const fichero of ficherosTs(join(RAIZ, carpeta))) {
      const src = readFileSync(fichero, 'utf8');
      for (const tabla of tablas) {
        // `.from('tabla')` seguido de `.insert(`/`.upsert(` en las siguientes
        // ~12 líneas, y dentro del objeto insertado tiene que aparecer `id`.
        const re = new RegExp(`\\.from\\('${tabla}'\\)`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          // La ventana se corta en el siguiente `.from(`: sin eso, un
          // `.update()` sobre esta tabla se quedaba con el `.upsert()` de la
          // consulta de al lado y salía como falso positivo.
          let trozo = src.slice(m.index, m.index + 900);
          const otroFrom = trozo.indexOf(".from('", 1);
          if (otroFrom > 0) trozo = trozo.slice(0, otroFrom);
          const ins = trozo.match(/\.(insert|upsert)\(\s*(\{[\s\S]*?\n\s*\}|\{[^{}]*\}|[A-Za-z_][\w.]*)/);
          if (!ins) continue;
          const objeto = ins[2];
          // `id:` y también la forma abreviada `id,` — casi todo el repo hace
          // `const id = \`docsocio-${uid()}\`` y luego `.insert({ id, … })`.
          const declaraId = (s: string) => /(?:^|[{,\s])id\s*(?::|,|\}|\r?\n)/.test(s);
          // Si lo que se inserta es una variable (`.insert(fila)`), el objeto se
          // construye en otro sitio: se comprueba que el fichero mencione un id.
          const tieneId = declaraId(objeto) || (!objeto.startsWith('{') && declaraId(src));
          if (!tieneId) {
            const linea = src.slice(0, m.index).split('\n').length;
            fallos.push(`${relative(RAIZ, fichero)}:${linea} → insert en '${tabla}' sin id`);
          }
        }
      }
    }
  }

  assert.deepEqual(
    fallos, [],
    'estas tablas tienen `id text primary key` SIN default: Postgres no lo genera, '
    + 'lo tiene que poner el servidor (`comp-${uid()}`, `msg-${crypto.randomUUID()}`…). '
    + 'Sin él, el INSERT muere con 23502 y la funcionalidad entera queda muerta en producción.',
  );
});
