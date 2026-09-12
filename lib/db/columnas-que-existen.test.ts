import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: ninguna ruta de API pide una columna que no existe.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// `app/api/interno/kpis` pedía `sesiones.creado_en`. Esa columna NO existía
// entonces (se añadió después, migr 20260912223256): la tabla solo guardaba
// cuándo EMPIEZA una clase (`inicio`), no cuándo se creó. PostgREST
// respondía 400 —«column sesiones.creado_en does not exist», visto en los logs
// de producción—, el helper de paginado lo convertía en `data: null`, y la ruta
// lo leía con un `?? []`.
//
// El resultado no era una pantalla rota, que se habría arreglado en un día: era
// un CERO creíble. El panel interno de Tentare llevaba quién sabe cuánto
// diciendo que la plataforma entera no tenía ni una clase programada, y que
// «programar clases» era el paso que bloqueaba a todos los estudios. Un número
// falso que encaja con la historia que ya te esperabas no lo mira nadie dos
// veces.
//
// `tsc` no puede cazarlo: el nombre de la columna viaja dentro de una cadena.
// Por eso se comprueba aquí, contra `lib/db-types.ts`, que se GENERA desde las
// migraciones y por tanto es la forma real de la base.
//
// ── Qué NO comprueba ─────────────────────────────────────────────────────────
// Solo los `select` simples: lista de columnas separadas por comas. Se saltan
// los que traen `*`, relaciones embebidas (`socios(...)`) o alias (`x:col`),
// porque ahí la cadena ya no es una lista de columnas y distinguirlo bien pide
// un parser de verdad. Tampoco mira tablas que no estén en `db-types.ts`
// (vistas, por ejemplo). Cubre el caso que falló, no todos los imaginables.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');

/** `sesiones` → `RowSesiones`, `posts_comunidad` → `RowPostsComunidad`. */
function nombreInterfaz(tabla: string): string {
  return 'Row' + tabla.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** Las columnas de cada interfaz `Row…` de los tipos generados. */
function columnasPorInterfaz(): Map<string, Set<string>> {
  const fuente = readFileSync(join(RAIZ, 'lib/db-types.ts'), 'utf8');
  const mapa = new Map<string, Set<string>>();
  for (const m of fuente.matchAll(/export interface (Row\w+) \{([\s\S]*?)\n\}/g)) {
    const columnas = new Set<string>();
    for (const linea of m[2].split('\n')) {
      const campo = linea.match(/^\s{2}(\w+)\??:/);
      if (campo) columnas.add(campo[1]);
    }
    mapa.set(m[1], columnas);
  }
  return mapa;
}

function rutasDeApi(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const ruta = join(dir, e);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.ts$/.test(e) && !/\.test\.ts$/.test(e)) salida.push(ruta);
    }
  };
  recorrer(join(RAIZ, 'app/api'));
  return salida;
}

/**
 * `from('tabla')` … `.select('a, b')`.
 *
 * ⚠️ Lo de en medio NO puede contener otro `.from(`. Sin esa condición, un
 * `from('cadenas').delete()` seguido en la línea siguiente de
 * `from('studios').select('cadena_id')` se leía como si `cadenas` tuviera una
 * columna `cadena_id` — falso positivo real, cazado al estrenar este guardián.
 */
const SELECT_TRAS_FROM = /\.from\(\s*'(\w+)'\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.select\(\s*'([^']*)'/g;

test('la lista de tipos generados se ha leído de verdad', () => {
  const mapa = columnasPorInterfaz();
  assert.ok(mapa.size > 50, `solo ${mapa.size} interfaces: el parseo de db-types.ts no está funcionando`);
  assert.ok(mapa.get('RowSesiones')?.has('inicio'), 'RowSesiones sin `inicio`: el parseo está mal');
  // Desde 20260912223256 sí existe. Si este assert falla es que la migración
  // o la regeneración de tipos se ha perdido — no que el guardián esté mal.
  assert.ok(mapa.get('RowSesiones')?.has('creado_en'), '`sesiones.creado_en` ha desaparecido de los tipos generados');
});

test('⚠️ ninguna ruta de API pide una columna inexistente', () => {
  const columnas = columnasPorInterfaz();
  const culpables: string[] = [];

  for (const ruta of rutasDeApi()) {
    const fuente = readFileSync(ruta, 'utf8');
    for (const m of fuente.matchAll(SELECT_TRAS_FROM)) {
      const [, tabla, , lista] = m;
      // Relaciones embebidas, comodines y alias: fuera (ver cabecera).
      if (/[*():]/.test(lista)) continue;
      const conocidas = columnas.get(nombreInterfaz(tabla));
      if (!conocidas) continue; // vista o tabla sin tipo generado
      for (const col of lista.split(',').map(c => c.trim()).filter(Boolean)) {
        if (!conocidas.has(col)) {
          culpables.push(`${ruta.replace(RAIZ + '/', '')}: ${tabla}.${col} no existe`);
        }
      }
    }
  }

  assert.deepEqual(culpables, [],
    `\n${culpables.join('\n')}\n\n`
    + 'PostgREST devuelve 400 ante una columna desconocida, el helper lo convierte en '
    + '`data: null` y la ruta lo acaba leyendo como CERO. Un cero inventado no se '
    + 'distingue de un dato real.\n');
});
