import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: NINGÚN `.ilike(` puede incrustar un valor de entrada sin pasar por
// `escaparLike`.
//
// En PostgREST el segundo argumento de `.ilike()` ES el patrón: un `%` en el
// dato lo convierte en "cásalo con todo". El repo ya centralizó el escapado en
// `lib/escapar-like.ts` justamente porque «una defensa duplicada acaba
// arreglándose en un sitio y no en el gemelo» (su propio comentario) — y aun
// así, en la auditoría del 29-ago quedaban DOS `.ilike('email', …)` sin
// escapar, uno de ellos alcanzable desde `/api/oauth/v1/clientas` con el email
// sin validar de un integrador: `email: "%"` adoptaba una ficha fantasma
// arbitraria del estudio y le reasignaba el bono ya cobrado.
//
// Este test es estructural a propósito (mismo criterio que
// socia-publica-campos-editables.test.ts): los ficheros implicados llevan
// `import 'server-only'` y no se pueden ejecutar aquí.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const CARPETAS = ['lib', 'app', 'components'];

// Un `.ilike` cuyo patrón es una constante literal del propio código (no viene
// de fuera) no necesita escaparse. Se listan con su motivo para que ampliar la
// lista obligue a escribir por qué.
const EXCEPCIONES: Record<string, string> = {};

function ficherosTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) ficherosTs(p, acc);
    else if (/\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

test('todo .ilike() pasa su patrón por escaparLike', () => {
  const sinEscapar: string[] = [];

  for (const carpeta of CARPETAS) {
    for (const fichero of ficherosTs(join(RAIZ, carpeta))) {
      const rel = relative(RAIZ, fichero);
      if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;
      if (rel === 'lib/escapar-like.ts') continue;

      const src = readFileSync(fichero, 'utf8');
      const lineas = src.split('\n');
      lineas.forEach((linea, i) => {
        const m = linea.match(/\.ilike\(\s*[^,]+,\s*([^)]*)\)/);
        if (!m) return;
        // Los comentarios de este repo citan `.ilike('email', …)` a menudo para
        // explicar el riesgo; no son llamadas.
        if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;

        // Se mira EL ARGUMENTO, no el vecindario: un `escaparLike` que aparece
        // en el comentario de al lado, o en la llamada gemela de veinte líneas
        // más abajo, no protege a ESTA. (Primera versión de este test: hacía
        // exactamente eso y su control positivo pasaba en verde.)
        const patron = m[1].trim();
        if (patron.includes('escaparLike')) return;
        // `const patron = escaparLike(email)` y luego `.ilike('email', patron)`
        // — el estilo de lib/billing/socia-nueva.ts.
        if (/^[A-Za-z_]\w*$/.test(patron)
            && new RegExp(`\\b(const|let)\\s+${patron}\\s*=\\s*escaparLike\\(`).test(src)) return;

        const clave = `${rel}:${i + 1}`;
        if (clave in EXCEPCIONES) return;
        sinEscapar.push(`${clave} → ${linea.trim()}`);
      });
    }
  }

  assert.deepEqual(
    sinEscapar, [],
    'hay .ilike() sin escaparLike. El valor ES el patrón: un "%" convierte el '
    + 'filtro en "devuélvemelo todo". Usa escaparLike() o añade el sitio a '
    + 'EXCEPCIONES explicando por qué el patrón es una constante del código.',
  );
});
