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

// Las que YA estaban huérfanas cuando se escribió este guardián.
//
// No se tapan: se anclan. Con la lista explícita, el test pasa hoy y ninguna
// tabla NUEVA puede quedarse sin cargador sin ponerse en rojo — que es lo que
// faltó en #1375. Y la lista es la deuda, escrita donde se ve.
//
// Las tres primeras no se leen en NINGÚN sitio del repo: el panel las escribe
// y nunca las relee. Las tres últimas sí se leen, pero por el camino de
// servidor (`supabase-data-admin.ts`, rutas de API) para el portal — no por el
// estado del panel, así que sus pantallas de panel siguen viendo vacío.
//
// Arreglarlas es tocar VOD, notas internas, cuestionarios de sesión, gráficos
// del dashboard y citas: cinco funciones que no tienen que ver con la
// gamificación, y que merecen su propio cambio y sus propias pruebas.
const HUERFANAS_CONOCIDAS = [
  'notas_internas',        // sin lectura viva en todo el repo
  'respuestas_sesion',     // sin lectura viva en todo el repo
  'dashboard_charts',      // sin lectura viva en todo el repo
  'videos_on_demand',      // solo la lee el servidor, para el portal
  'citas_servicios',       // solo la lee el servidor, para el portal
  'citas_disponibilidad',  // solo la lee el servidor, para el portal
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

test('las tablas de gamificación las carga fetchGamificacionStudio', () => {
  // El caso concreto que ocurrió, anclado aparte: el guardián de arriba se
  // conforma con que exista CUALQUIER consulta viva, y estas diez tienen que
  // ir juntas — cargar la mitad deja las pestañas a medias igualmente.
  const vivas = VIVAS.join('\n');
  const cuerpo = vivas.slice(vivas.indexOf('export async function fetchGamificacionStudio'));
  const fin = cuerpo.indexOf('\nexport async function ', 1);
  const fn = fin === -1 ? cuerpo : cuerpo.slice(0, fin);

  const esperadas = [
    'reward_rules', 'reward_actions', 'member_credits', 'reward_catalog', 'reward_redemptions',
    'achievement_definitions', 'achievement_progress', 'level_definitions',
    'challenge_definitions', 'challenge_progress',
  ];
  const faltan = esperadas.filter(t => !fn.includes(`.from('${t}').select(`));
  assert.deepEqual(faltan, [], 'Sin estas, las pestañas de Configuración › Logros y motivación se quedan en blanco.');
});
