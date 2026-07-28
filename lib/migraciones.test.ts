import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Dos migraciones no pueden llevar el mismo número.
//
// Con varias sesiones trabajando a la vez, cada una coge "el siguiente número
// libre" mirando `main`, y las dos cogen el mismo. Pasó cinco veces en una
// semana, y tres de ellas el mismo día.
//
// No ROMPE nada —producción lleva las migraciones por marca de tiempo, no por
// este prefijo, y las parejas que colisionaron tocaban objetos distintos—, pero
// hace ilegible el directorio: con dos `0115` no se sabe cuál se aplicó antes
// ni cuál falta por aplicar. Y ese "cuál falta por aplicar" ya ha costado caro
// dos veces (ver 0118 y 0120: mergeadas y sin aplicar durante horas).
//
// Un comentario en una guía no lo habría evitado; este test sí, porque falla
// en CI antes de mergear.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// Renumera TU fichero al siguiente hueco libre. No renumeres el ajeno: puede
// estar ya aplicado en producción y referenciado en su PR.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = new URL('../supabase/migrations', import.meta.url);

/**
 * Ya no hay excepciones, y la lista se queda vacía a propósito.
 *
 * Hubo cinco números repetidos (0061, 0069, 0071, 0072 y 0075) que se toleraban
 * por ser "sólo estéticos". No lo eran: `schema_migrations.version` es clave
 * primaria, así que el segundo de cada par reventaba `supabase start` y no había
 * forma de levantar el proyecto en local. Se renumeraron respetando el orden real
 * de aplicación en producción.
 *
 * Si alguna vez vuelve a hacer falta una excepción, piénsalo dos veces: significa
 * que ese número no se puede aplicar sobre una base vacía.
 */
const HISTORICAS = new Set<string>();

function prefijosDuplicados(): Record<string, string[]> {
  const porPrefijo: Record<string, string[]> = {};
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.sql')) continue;
    const m = /^(\d{4})_/.exec(f);
    // Las de prefijo largo son marcas de tiempo (20260725170000_…): no pueden
    // chocar entre sesiones, que es justo lo que se busca. Se ignoran aquí.
    if (!m) continue;
    (porPrefijo[m[1]] ??= []).push(f);
  }
  return Object.fromEntries(
    Object.entries(porPrefijo).filter(([n, fs]) => fs.length > 1 && !HISTORICAS.has(n)),
  );
}

test('ninguna migración nueva repite número', () => {
  const dup = prefijosDuplicados();
  const detalle = Object.entries(dup)
    .map(([n, fs]) => `  ${n}: ${fs.join(' · ')}`)
    .join('\n');
  assert.deepEqual(
    dup, {},
    `Hay migraciones con el mismo número:\n${detalle}\n\n` +
    'Renumera LA TUYA al siguiente hueco libre; la otra puede estar ya aplicada ' +
    'en producción y referenciada en su PR.',
  );
});

test('la lista de excepciones sigue vacía', () => {
  // El test de arriba sólo sirve si nadie vuelve a meter números en HISTORICAS
  // para silenciarlo. Una excepción nueva significa una migración que no se
  // puede aplicar sobre una base vacía: eso hay que arreglarlo, no taparlo.
  assert.deepEqual(
    [...HISTORICAS], [],
    'No añadas números aquí para saltarte el test: renumera tu migración.',
  );
});

test('toda migración numerada se puede aplicar sobre una base vacía', () => {
  // El motivo de existir de todo esto: `schema_migrations.version` es clave
  // primaria. Dos ficheros con el mismo número = el segundo revienta el
  // `supabase start` y nadie puede levantar el proyecto en local.
  const porPrefijo: Record<string, string[]> = {};
  for (const f of readdirSync(DIR)) {
    const m = /^(\d{4})_/.exec(f);
    if (m) (porPrefijo[m[1]] ??= []).push(f);
  }
  const repetidos = Object.entries(porPrefijo).filter(([, fs]) => fs.length > 1);
  assert.deepEqual(repetidos, [], 'Números repetidos, sin excepciones que valgan.');
});
