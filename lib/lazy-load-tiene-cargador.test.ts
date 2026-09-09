import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: si una tabla sale del arranque marcada como «lazy-load», alguien
// tiene que cargarla DESPUÉS. Si no, no es carga diferida: es carga eliminada.
//
// «Sprint 1: lazy-load non-critical tables» (#1375, 25-ago-2026) sacó veinte
// tablas de `fetchCriticalStudioData`, dejó `key: []` en su sitio y confió en
// que cada pantalla las pediría. Para diez de ellas —todas las de
// gamificación— la segunda mitad nunca se escribió. No lo cazó nada:
//
//   · tsc en verde: el tipo devuelto sigue siendo un array.
//   · lint en verde: no hay variable sin usar ni import muerto.
//   · >4.000 tests en verde: ninguno monta el panel con datos reales.
//   · La pantalla tampoco protesta — enseña «no hay nada», que es
//     indistinguible de un estudio que aún no ha configurado nada.
//
// Y el daño no se quedó en pintar vacío. `otorgarCreditos` filtraba en local
// con `rewardRules` antes de llamar a la RPC; con la lista siempre vacía, el
// panel dejó de conceder créditos por completo. Última concesión por ese
// camino en producción: 21-ago-2026, cuatro días antes del cambio. Diecisiete
// días sin que nadie lo notara, porque el camino del portal no pasa por ahí.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// O escribes el cargador que falta (un `fetch…` que consulte esa tabla, como
// `fetchGamificacionStudio` o el de `plazas_fijas`), o devuelves la consulta al
// arranque. Lo que no vale es dejar el `[]` sin nadie detrás.
// ─────────────────────────────────────────────────────────────────────────────

const FUENTE = readFileSync(join(import.meta.dirname, 'supabase-data.ts'), 'utf8');

/** `rewardCatalog` → `reward_catalog`. */
function aNombreDeTabla(clave: string): string {
  return clave.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}

// Las claves que `fetchCriticalStudioData` devuelve vacías a propósito.
function clavesDiferidas(): string[] {
  return [...FUENTE.matchAll(/^\s*([a-zA-Z]+):\s*\[\],\s*\/\/\s*Sprint 1: lazy-load/gm)]
    .map(m => m[1]);
}

// ¿Hay en el fichero una LECTURA viva de esa tabla?
//
// Dos precisiones que parecen quisquillosas y no lo son — la primera versión
// de este guardián se quedó en verde con el fallo delante por saltárselas:
//
//  · Tiene que ser `.select(`, no cualquier `.from(`. Casi todas estas tablas
//    tienen su `insert`/`update` en este mismo fichero (`dbInsertRewardCatalogItem`
//    y compañía), así que aceptar cualquier acceso da por cargada una tabla que
//    solo se escribe.
//  · Las líneas comentadas no cuentan. Son exactamente el rastro que dejó
//    #1375; contarlas sería quedarse ciego a lo único que se vigila.
function lineasVivas(): string[] {
  return FUENTE.split('\n').filter(linea => {
    const sinIndentar = linea.trimStart();
    return !sinIndentar.startsWith('//') && !sinIndentar.startsWith('*');
  });
}

const VIVAS = lineasVivas();

function tieneLecturaViva(tabla: string): boolean {
  return VIVAS.some(l => l.includes(`.from('${tabla}').select(`));
}

// La única que sigue sin cargador, y a propósito.
//
// `videos_on_demand` tiene datos (7 filas en producción) y un consumidor de
// panel… que es `app/(dashboard)/ondemand/page.frozen.tsx`. La página VIVA es
// un stub que redirige: VOD está CONGELADO por el feature-freeze de PMF
// (2026-07-23, ver docs/FEATURE-FREEZE-2026-07.md). Escribirle un cargador
// sería añadir una consulta en cada arranque de una pantalla a la que no se
// puede llegar.
//
// Cuando se descongele —renombrando page.frozen.tsx— habrá que darle su carga
// bajo demanda y borrarla de aquí. El segundo test de este fichero lo exige:
// en cuanto tenga lectura viva, esta lista tiene que menguar.
const HUERFANAS_CONOCIDAS = [
  'videos_on_demand',      // VOD congelado: la página viva es un stub que redirige
];

test('toda tabla marcada «lazy-load» tiene quien la cargue después', () => {
  const claves = clavesDiferidas();
  // Si el marcador cambia de texto, este test se quedaría en verde sin mirar
  // nada. Que haya varias es parte de lo que se comprueba.
  assert.ok(claves.length > 5, `Se esperaban varias claves diferidas y se han encontrado ${claves.length}: ¿cambió el comentario marcador?`);

  // La lista de conocidas tiene que ir MENGUANDO. Si alguien arregla una y no
  // la quita de aquí, este test lo dice: una excepción que ya no excepciona
  // nada es justo como vuelve a colarse el fallo siguiente.
  const yaResueltas = HUERFANAS_CONOCIDAS.filter(t => tieneLecturaViva(t));
  assert.deepEqual(yaResueltas, [],
    'Estas ya tienen cargador: quítalas de HUERFANAS_CONOCIDAS para que la lista siga significando algo.');

  const huerfanas = claves
    .map(aNombreDeTabla)
    .filter(tabla => !tieneLecturaViva(tabla))
    .filter(tabla => !HUERFANAS_CONOCIDAS.includes(tabla));

  assert.deepEqual(huerfanas, [],
    'Estas tablas salieron del arranque y nadie las carga: la pantalla que las use verá siempre vacío.');
});

test('cada área tiene su cargador, y carga TODAS sus tablas', () => {
  // Los casos concretos, anclados aparte: el guardián de arriba se conforma con
  // que exista CUALQUIER lectura viva, y las tablas de un área tienen que ir
  // JUNTAS — cargar la mitad deja la pantalla a medias igualmente.
  const vivas = VIVAS.join('\n');

  const AREAS: Record<string, string[]> = {
    fetchGamificacionStudio: [
      'reward_rules', 'reward_actions', 'member_credits', 'reward_catalog', 'reward_redemptions',
      'achievement_definitions', 'achievement_progress', 'level_definitions',
      'challenge_definitions', 'challenge_progress',
    ],
    fetchAgendaCitasStudio: ['citas_servicios', 'citas_disponibilidad'],
    fetchFichaClientaStudio: ['notas_internas', 'respuestas_sesion', 'valoraciones_iniciales', 'valoraciones_iniciales_salud'],
    fetchDashboardChartsStudio: ['dashboard_charts'],
  };

  const faltan: string[] = [];
  for (const [fn, tablas] of Object.entries(AREAS)) {
    const desde = vivas.indexOf(`export async function ${fn}`);
    assert.notEqual(desde, -1, `No existe ${fn}: sin él, su pantalla lee un estado que nadie rellena.`);
    const resto = vivas.slice(desde);
    const corte = resto.indexOf('\nexport async function ', 1);
    const cuerpo = corte === -1 ? resto : resto.slice(0, corte);
    for (const t of tablas) {
      if (!cuerpo.includes(`.from('${t}').select(`)) faltan.push(`${fn} → ${t}`);
    }
  }

  assert.deepEqual(faltan, [], 'Falta cargar estas tablas: su pantalla se queda en blanco.');
});
