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
// hace ilegible el directorio: con dos `0110` no se sabe cuál se aplicó antes
// ni cuál falta por aplicar. Y ese "cuál falta por aplicar" ya ha costado caro
// dos veces (ver 0113 y 0115: mergeadas y sin aplicar durante horas).
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
 * Las que ya colisionaban antes de existir este test.
 *
 * No se renumeran a posteriori a propósito: están aplicadas hace semanas y sus
 * números aparecen en descripciones de PR y en notas. Cambiarlos ahora rompería
 * esas referencias a cambio de nada — el daño ya está hecho y es sólo estético.
 */
const HISTORICAS = new Set(['0061', '0069', '0071', '0072', '0075']);

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

test('las históricas siguen ahí: la lista de excepciones no tapa nada nuevo', () => {
  // Si alguien renumera una histórica, esta lista deja de hacer falta y hay que
  // quitarla — si no, seguiría dando permiso para colisionar en ese número.
  const numeros = new Set<string>();
  for (const f of readdirSync(DIR)) {
    const m = /^(\d{4})_/.exec(f);
    if (m) numeros.add(m[1]);
  }
  for (const n of HISTORICAS) {
    assert.ok(numeros.has(n), `${n} ya no existe: quítalo de HISTORICAS.`);
  }
});
