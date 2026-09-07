import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: si el cliente lee `row.<columna>` de la respuesta de una RPC, esa
// RPC tiene que DECLARAR esa columna en su `returns table(...)`.
//
// PR #822 arregló un error de Sentry (JAVASCRIPT-NEXTJS-11) cambiando el cliente
// para que usara `row.accion_id` de otorgar_credito_disparador. Hizo las dos
// mitades —cambió el cliente Y aplicó la migración a producción (versión
// 20260808135357 en el ledger)—, pero el commit solo llevó la del cliente: toca
// 10 ficheros y ninguno en supabase/migrations.
//
// Así que producción quedó BIEN y el repo se quedó describiendo otra cosa. El
// bug vivía en cualquier base levantada desde las migraciones (local, CI, un
// proyecto nuevo): ahí `row.accion_id` era `undefined`, el panel cortaba con
// capturarMensaje('[otorgarCreditos] RPC otorgado=true sin accionId') y no
// escribía reward_history ni credit_transactions. Un año entero sin que nadie
// lo notara, porque el sitio donde se mira es justo el que estaba bien.
//
// Typecheck en verde (PostgREST devuelve `any`, y el cast `row.accion_id as
// string | null` se lo traga), lint en verde y >3.000 tests en verde. Nada de lo
// que ya había podía verlo: es una deriva entre dos lenguajes, y encima entre
// el repo y producción.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// O añades la columna al `returns table(...)` en una migración nueva (ojo:
// cambiar la firma obliga a DROP+CREATE y a rehacer los grants — REVOKE de
// `public` Y de `anon`, GRANT explícito, ver .claude/tentare-os.md), o dejas de
// leerla en el cliente. Lo que no vale es dar por hecho que está.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');

// RPCs cuya fila de respuesta lee el cliente por nombre de columna, con el
// fichero y la función TS donde se lee. Las columnas esperadas NO se listan a
// mano: se extraen del propio código, para que añadir un `row.loQueSea` nuevo
// quede cubierto solo.
const CONTRATOS = [
  {
    rpc: 'otorgar_credito_disparador',
    fichero: 'lib/supabase-data.ts',
    fn: 'dbOtorgarCreditoDisparador',
  },
];

// Última declaración `returns table(...)` de una función en las migraciones.
// Se recorre en orden de nombre de fichero (= orden de aplicación) porque una
// migración posterior puede redefinir la firma: manda la última, no la primera.
function columnasDeclaradas(rpc: string): string[] | null {
  const dir = join(RAIZ, 'supabase/migrations');
  let ultima: string[] | null = null;
  for (const f of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    // `create [or replace] function public.<rpc>(...) returns table(<cols>)`
    const re = new RegExp(
      String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?${rpc}\s*\([\s\S]*?\)\s*returns\s+table\s*\(([^)]*)\)`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      ultima = m[1]
        .split(',')
        .map(c => c.trim().split(/\s+/)[0])
        .filter(Boolean);
    }
  }
  return ultima;
}

// Columnas que el cuerpo de `fn` lee de la fila (`row.saldo`, `row.accion_id`…).
function columnasLeidas(fichero: string, fn: string): string[] {
  const src = readFileSync(join(RAIZ, fichero), 'utf8');
  const inicio = src.indexOf(`export async function ${fn}(`);
  assert.notEqual(inicio, -1, `No se encontró ${fn} en ${fichero}`);
  // Hasta el siguiente `export ` de nivel superior: basta para acotar el cuerpo
  // sin equilibrar llaves.
  const resto = src.slice(inicio + 1);
  const fin = resto.indexOf('\nexport ');
  const cuerpo = fin === -1 ? resto : resto.slice(0, fin);
  return [...new Set([...cuerpo.matchAll(/\brow\.(\w+)/g)].map(m => m[1]))];
}

for (const { rpc, fichero, fn } of CONTRATOS) {
  test(`${rpc}: declara todas las columnas que lee ${fn}`, () => {
    const declaradas = columnasDeclaradas(rpc);
    assert.notEqual(declaradas, null, `No se encontró ningún \`returns table(...)\` de ${rpc} en las migraciones`);

    const leidas = columnasLeidas(fichero, fn);
    assert.ok(leidas.length > 0, `${fn} no lee ninguna columna de la fila — ¿cambió de forma?`);

    const faltan = leidas.filter(c => !declaradas!.includes(c));
    assert.deepEqual(
      faltan, [],
      `${fn} lee ${faltan.map(c => `row.${c}`).join(', ')} pero ${rpc} solo declara (${declaradas!.join(', ')})`,
    );
  });
}

// El accion_id es el motivo de existir de este fichero: se comprueba también
// de forma explícita, para que borrar por accidente la entrada de CONTRATOS no
// deje el agujero abierto en silencio con el test en verde.
test('otorgar_credito_disparador devuelve accion_id (reward_history.action_id lo necesita)', () => {
  assert.ok(
    columnasDeclaradas('otorgar_credito_disparador')?.includes('accion_id'),
    'Sin accion_id el panel no puede escribir reward_history (FK reward_history_action_id_fkey) ' +
    'y el libro de movimientos de la socia queda vacío para lo concedido desde el panel.',
  );
});
