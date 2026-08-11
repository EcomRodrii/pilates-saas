import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Cada prefijo de subida tiene que tener su rama en la política de Storage.
//
// El 11-ago-2026 subir una foto desde el editor de apariencia daba «new row
// violates row-level security policy». El código escribía en
// `portal-<studioId>-<clave>` y `avatars_path_autorizado` no tenía ninguna rama
// para ese prefijo: caía al `else`, buscaba una socia con ese id, no la
// encontraba y denegaba. La función de subir se desplegó sin su permiso.
//
// Ese fallo no lo veía NADIE hasta producción: los e2e mockean la red con
// `page.route`, así que ninguna prueba toca Storage ni la RLS de verdad
// —punto ciego documentado de esta suite—. Y no se puede cubrir con un e2e
// real sin credenciales de Supabase en CI, que no las hay (el runner usa
// `https://example.supabase.co`).
//
// Así que esto NO prueba que la subida funcione: prueba que las dos mitades
// están de acuerdo. Compara los prefijos que el código escribe de verdad
// contra los que la migración autoriza. Es lo único de este agujero que se
// puede comprobar sin red, y es exactamente donde se rompió.
//
// Se leen del FUENTE a propósito, no de una lista escrita a mano: una lista
// hay que acordarse de actualizarla, y olvidarse es justo el bug.
// ─────────────────────────────────────────────────────────────────────────────

const FUENTE_SUBIDAS = 'lib/portal-storage.ts';
const DIR_MIGRACIONES = 'supabase/migrations';
const FUNCION = 'avatars_path_autorizado';

/** Prefijos que el cliente escribe: `const path = \`algo-${...}\``. */
function prefijosDelCodigo(): string[] {
  const src = readFileSync(FUENTE_SUBIDAS, 'utf8');
  const encontrados = [...src.matchAll(/const path = `([a-z-]+?)-\$\{/g)].map(m => m[1]);
  // Si el fichero cambia de forma y la búsqueda deja de encontrar nada, esta
  // prueba pasaría en verde sin comprobar absolutamente nada. Mejor que grite.
  assert.ok(encontrados.length >= 5, `no se han encontrado prefijos en ${FUENTE_SUBIDAS} — ¿cambió la forma de componer el path?`);
  return [...new Set(encontrados)];
}

/**
 * Prefijos que autoriza la definición VIGENTE de la función: la de la
 * migración más reciente que la redefine (las migraciones se aplican en orden
 * de nombre, así que la última manda).
 */
function prefijosAutorizados(): string[] {
  const ficheros = readdirSync(DIR_MIGRACIONES)
    .filter(f => f.endsWith('.sql'))
    .sort();
  const queLaDefinen = ficheros.filter(f =>
    readFileSync(`${DIR_MIGRACIONES}/${f}`, 'utf8').includes(`function public.${FUNCION}`));
  assert.ok(queLaDefinen.length > 0, `ninguna migración define ${FUNCION}`);

  const bruto = readFileSync(`${DIR_MIGRACIONES}/${queLaDefinen[queLaDefinen.length - 1]}`, 'utf8');

  // ⚠️ Fuera los comentarios ANTES de buscar, y no es una precaución de
  // manual: la primera versión de esta prueba los leía, y la cabecera de la
  // migración cita `starts_with(p_name, 'portal-' ...)` al explicar el arreglo.
  // Resultado: la prueba pasaba en verde aunque se borrase la política entera,
  // porque encontraba el prefijo en la explicación de por qué existe. Se
  // descubrió al comprobar que fallara sin el arreglo — que es exactamente
  // para lo que sirve esa comprobación.
  const sql = bruto.replace(/--.*$/gm, '');

  // Dos formas de autorizar en la función: `like 'algo-%'` y el `starts_with`
  // de la rama de `portal-`.
  const porLike = [...sql.matchAll(/like '([a-z-]+?)-%'/g)].map(m => m[1]);
  const porStartsWith = [...sql.matchAll(/starts_with\(p_name, '([a-z-]+?)-'/g)].map(m => m[1]);
  return [...new Set([...porLike, ...porStartsWith])];
}

test('todo prefijo que el código sube está autorizado en la política de Storage', () => {
  const delCodigo = prefijosDelCodigo();
  const autorizados = prefijosAutorizados();

  const huerfanos = delCodigo.filter(p => !autorizados.includes(p));
  assert.deepEqual(
    huerfanos, [],
    `Estos prefijos se suben desde el código pero NINGUNA rama de ${FUNCION} los autoriza: `
    + `${huerfanos.join(', ')}. La subida fallará con «new row violates row-level security policy». `
    + `Añade su rama en una migración nueva.`,
  );
});

test('⚠️ el caso que se escapó: `portal-` está cubierto', () => {
  // Explícito además del genérico de arriba: si alguien reescribe la función y
  // se deja esta rama, el mensaje del fallo dice de qué se trata en vez de
  // obligar a deducirlo de una lista.
  assert.ok(
    prefijosAutorizados().includes('portal'),
    'sin la rama `portal-`, subir una imagen desde el editor de apariencia vuelve a fallar',
  );
});

test('la política no autoriza prefijos que ya nadie sube', () => {
  // No es un fallo, es limpieza: una rama que sobra es superficie de permiso
  // sin uso. Se avisa con los nombres para poder decidir, no se da por malo.
  const delCodigo = prefijosDelCodigo();
  // `favicon` lo escribe el servidor con service-role al publicar el tema
  // (lib/theme-data.ts), no el cliente, así que no aparece en el fuente de
  // arriba y su rama SÍ hace falta.
  const escritosPorServidor = ['favicon'];
  const sinUso = prefijosAutorizados()
    .filter(p => !delCodigo.includes(p) && !escritosPorServidor.includes(p));
  assert.deepEqual(sinUso, [], `ramas de ${FUNCION} que ya no usa nadie: ${sinUso.join(', ')}`);
});
