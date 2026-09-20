import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Contrato TS ↔ SQL de `reservar_plaza`.
//
// Escrito en la auditoría del 2026-09-19, después de encontrar las reservas
// CAÍDAS en producción por cuatro defectos que ningún test veía. Los cuatro son
// de contrato, no de lógica — por eso una suite de 6.313 tests estaba en verde
// con el producto sin poder reservar:
//
//   1. `p_tipo_clase_id` en el TS, ausente en la función viva  → PGRST202.
//   2. Dos sobrecargas vivas (8 y 9 args) con defaults, y llamadas que no
//      nombraban el argumento que las distingue → 42725 «is not unique».
//   3. `(s.sesiones_restantes ?? 0)` — `??` de JavaScript dentro de SQL, en
//      `socio_tiene_entitlement_activo` → 42883 al ejecutarla.
//   4. `studios.requiere_plan`, columna que no existe → 42703.
//
// Un test equivalente se escribió el 2026-09-18 y lo borró un revert al día
// siguiente (`1a5a7b80`). Si vuelve a desaparecer, las reservas vuelven a
// poder caerse en silencio: no lo borres, arréglalo.

const raiz = join(import.meta.dirname, '..', '..');
const DIR = join(raiz, 'supabase', 'migrations');

const sinComentarios = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

/** Firma de la definición VIVA: la del `create function` más reciente. */
function firmaViva(): { fichero: string; params: string[] } {
  const ficheros = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort().reverse();
  for (const fichero of ficheros) {
    const sql = sinComentarios(readFileSync(join(DIR, fichero), 'utf8'));
    // Solo un `create [or replace] function`: una migración de `revoke ... on
    // function public.reservar_plaza(...)` también menciona el nombre.
    const m = /create\s+(?:or\s+replace\s+)?function\s+public\.reservar_plaza\s*\(([\s\S]*?)\)\s*returns/i.exec(sql);
    if (m) return { fichero, params: [...m[1].matchAll(/\bp_\w+/g)].map(x => x[0]) };
  }
  assert.fail('ninguna migración define public.reservar_plaza');
}

/** Cada `admin.rpc('reservar_plaza', { ... })` del repo, con sus claves. */
function llamadasTS(): { linea: number; claves: string[] }[] {
  const fuente = readFileSync(join(raiz, 'lib', 'db', 'supabase-data-admin.ts'), 'utf8');
  const salida: { linea: number; claves: string[] }[] = [];
  const re = /\.rpc\(\s*['"]reservar_plaza['"]\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente))) {
    // Recorre hasta cerrar la llave del objeto literal, contando anidamiento.
    let i = re.lastIndex, prof = 1;
    while (i < fuente.length && prof > 0) {
      if (fuente[i] === '{') prof++;
      else if (fuente[i] === '}') prof--;
      i++;
    }
    const cuerpo = sinComentarios(fuente.slice(re.lastIndex, i - 1));
    salida.push({
      linea: fuente.slice(0, m.index).split('\n').length,
      // Solo claves (`p_x:`), no valores — `params.spotId ?? null` no es clave.
      claves: [...cuerpo.matchAll(/(\bp_\w+)\s*:/g)].map(x => x[1]),
    });
  }
  return salida;
}

test('reservar_plaza: el TS no manda ningún argumento que la función no tenga', () => {
  const { fichero, params } = firmaViva();
  const llamadas = llamadasTS();
  assert.ok(llamadas.length >= 3, `esperaba al menos 3 llamadas, encontré ${llamadas.length}`);

  const sobrantes = llamadas.flatMap(l =>
    l.claves.filter(c => !params.includes(c)).map(c => `línea ${l.linea}: ${c}`));
  assert.deepEqual(sobrantes, [],
    `Argumentos que no existen en ${fichero} (${params.join(', ')}). ` +
    'PostgREST responde PGRST202 y la reserva falla SIEMPRE, no solo en un caso borde.');
});

test('reservar_plaza: toda llamada nombra el argumento que desambigua la sobrecarga', () => {
  // `p_exigir_entitlement` es el último parámetro y el único que la firma
  // antigua de 8 no tenía. Mientras quede cualquier sobrecarga viva, omitirlo
  // hace que Postgres no pueda elegir candidata (42725). Nombrarlo siempre
  // cuesta una línea y hace la llamada inmune a que reaparezca una sobrecarga.
  const sinDesambiguar = llamadasTS()
    .filter(l => !l.claves.includes('p_exigir_entitlement'))
    .map(l => `línea ${l.linea}`);
  assert.deepEqual(sinDesambiguar, [],
    'Añade `p_exigir_entitlement` explícito (false en mostrador y tras-pago: ' +
    'ese dinero ya está cobrado o comprobado en caja).');
});

test('migraciones: ningún cuerpo SQL usa el `??` de JavaScript', () => {
  // `??` no es un operador de Postgres. `create function` no lo detecta —el
  // cuerpo plpgsql no se analiza hasta ejecutarlo—, así que la migración se
  // aplica «bien» y la función revienta con 42883 la primera vez que alguien
  // la usa de verdad. Aquí solo se mira el SQL, nunca los comentarios (este
  // repo los usa para explicar el `??` de TypeScript, que sí es correcto).
  const fallos: string[] = [];
  for (const fichero of readdirSync(DIR).filter(n => n.endsWith('.sql'))) {
    const sql = sinComentarios(readFileSync(join(DIR, fichero), 'utf8'));
    if (/\?\?/.test(sql)) fallos.push(fichero);
  }
  assert.deepEqual(fallos, [], 'Usa `coalesce(x, y)`, no `x ?? y`.');
});
