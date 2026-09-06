import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planVacio, formularioAPlan } from './formulario.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El guardián del tercer sitio.
//
// `lib/planes/formulario.ts` ya unificó la DERIVACIÓN (qué se guarda) para que
// las dos pantallas de tarifas —/productos y configuración → Planes y tarifas—
// no divergieran nunca más. Pero quedaba un tercer sitio sin cubrir: la
// PERSISTENCIA, que en `lib/supabase-data.ts` eran DOS listas de columnas
// escritas a mano, una para el alta (`planTarifaToDb`) y otra para la edición
// (`dbUpdatePlanTarifa`).
//
// Y se quedó a medias exactamente como se temía: `oferta_hasta` (migr
// 20260819202520) entró en el alta y nunca en la edición. Editar una tarifa ya
// creada, poner o quitar "Oferta hasta" y guardar enseñaba «Plan actualizado»
// sin escribir nada — el estado optimista de `updatePlan` pintaba la fecha
// correcta hasta que se recargaba. Consecuencia real: el aviso «Oferta caducada
// — revisa el precio» no saltaba NUNCA en las tarifas editadas después de
// crearlas, que es justo el caso para el que se construyó.
//
// No se puede importar `lib/supabase-data.ts` aquí (arrastra el cliente de
// Supabase de navegador por alias `@/`), así que se comprueba sobre el código
// fuente — mismo patrón que socia-publica-campos-editables.test.ts y
// tope-socias-idempotencia.test.ts.
//
// La lista de campos NO se escribe a mano: se ejecuta `formularioAPlan`, que es
// quien decide de verdad qué se guarda. Un campo nuevo en la tarifa entra solo
// en esta cobertura, y si no llega a columna, este fichero se pone rojo.
// ─────────────────────────────────────────────────────────────────────────────

const FUENTE = readFileSync(new URL('../supabase-data.ts', import.meta.url), 'utf8');

/** El mapa camelCase → columna que comparten alta y edición. */
function columnasPlan(): Record<string, string> {
  const i = FUENTE.indexOf('const COLUMNAS_PLAN = {');
  assert.notEqual(i, -1, 'no encuentro COLUMNAS_PLAN en supabase-data.ts: ¿se renombró?');
  const bloque = FUENTE.slice(i, FUENTE.indexOf('}', i));
  return Object.fromEntries(
    [...bloque.matchAll(/^\s*(\w+):\s*'([\w]+)',/gm)].map(m => [m[1], m[2]]),
  );
}

function cuerpoDe(firma: string): string {
  const i = FUENTE.indexOf(firma);
  assert.notEqual(i, -1, `no encuentro ${firma}: ¿se renombró?`);
  const j = FUENTE.indexOf('\n}', i);
  return FUENTE.slice(i, j);
}

// `tiposClaseIds` no es una columna de `planes_tarifa`: vive en la tabla puente
// `plan_tipos_clase` (migr 0111) y la sincroniza `sincronizarTiposDePlan`, que
// los dos caminos ya llaman aparte. Es la ÚNICA excepción legítima.
const POR_TABLA_PUENTE = ['tiposClaseIds'];

// ── El bug que costó la funcionalidad ───────────────────────────────────────

test('la edición guarda "Oferta hasta" (el bug: se tiraba en silencio)', () => {
  assert.equal(
    columnasPlan().ofertaHasta,
    'oferta_hasta',
    'ofertaHasta no llega a su columna: editar la oferta de una tarifa vuelve a no guardarse',
  );
});

test('vaciar "Oferta hasta" se escribe: un null explícito NO se salta', () => {
  // Quitar la oferta es `ofertaHasta: null` (formularioAPlan devuelve null con
  // el input vacío). Si la edición filtrara por "valor con contenido" en vez de
  // por `undefined`, la fecha vieja se quedaría puesta para siempre.
  assert.equal(formularioAPlan({ ...planVacio(), nombre: 'X', precio: '10' }).ofertaHasta, null);
  assert.match(
    cuerpoDe('export async function dbUpdatePlanTarifa'),
    /valor\s*!==\s*undefined/,
    'la edición ya no distingue undefined de null: vaciar la oferta dejaría de borrarla',
  );
});

// ── El guardián: que no vuelva a quedarse a medias ──────────────────────────

test('todo campo que el formulario guarda tiene columna (o tabla puente)', () => {
  const columnas = columnasPlan();
  for (const campo of Object.keys(formularioAPlan(planVacio()))) {
    assert.ok(
      campo in columnas || POR_TABLA_PUENTE.includes(campo),
      `"${campo}" se guarda en formularioAPlan pero no tiene columna en COLUMNAS_PLAN: ` +
        'se perdería al crear Y al editar la tarifa',
    );
  }
});

test('alta y edición recorren el MISMO mapa, no dos listas a mano', () => {
  // El corazón del arreglo: mientras los dos caminos iteren COLUMNAS_PLAN, no
  // puede volver a existir un campo que se guarde al crear y no al editar.
  for (const fn of ['function planTarifaToDb', 'export async function dbUpdatePlanTarifa']) {
    assert.match(
      cuerpoDe(fn),
      /CAMPOS_PLAN/,
      `${fn} ha vuelto a escribir sus columnas a mano: es como se perdió oferta_hasta`,
    );
  }
  assert.doesNotMatch(
    cuerpoDe('export async function dbUpdatePlanTarifa'),
    /if \('(nombre|precio|activo|ofertaHasta)' in changes\)/,
    'ha vuelto la lista blanca a mano en la edición',
  );
});

test('la identidad de la tarifa no es editable', () => {
  // `id`/`studio_id` los pone el alta y no deben poder cambiarse por un UPDATE:
  // mover una tarifa de estudio con un parche sería un salto entre inquilinos.
  const columnas = columnasPlan();
  assert.ok(!('id' in columnas), 'id no puede entrar en el mapa de columnas editables');
  assert.ok(!('studioId' in columnas), 'studioId no puede entrar en el mapa de columnas editables');
  assert.match(cuerpoDe('function planTarifaToDb'), /studio_id: plan\.studioId \?\? STUDIO_ID/);
});

// ── Que una escritura sin efecto no se cante como éxito ──────────────────────
//
// La RLS de `planes_tarifa` exige `puede_mover_dinero()` (PROPIETARIO o
// RECEPCION) para INSERT, UPDATE y DELETE. Pero /productos NO está en
// BLOQUEADO_MANAGER, así que un MANAGER llega a la pantalla, edita el precio de
// un bono y pulsa Guardar: el UPDATE se queda en CERO filas y —sin `.select()`—
// PostgREST devuelve `error: null`, indistinguible de un guardado bueno. La
// pantalla decía «Tarifa actualizada», el estado optimista pintaba el precio
// nuevo y hasta se escribía una actividad reciente. Al recargar volvía el viejo.
//
// Es el mismo patrón que ya costó el bug de `oferta_hasta` que motivó este
// fichero, pero por la otra puerta: allí faltaba la columna, aquí falta saber
// si la fila llegó a tocarse.

for (const fn of ['export async function dbUpdatePlanTarifa', 'export async function dbDeletePlanTarifa']) {
  const nombre = fn.replace('export async function ', '');

  test(`${nombre} pide las filas tocadas: sin eso, 0 filas parece éxito`, () => {
    const cuerpo = cuerpoDe(fn);
    assert.match(
      cuerpo,
      /\.select\(/,
      `${nombre} escribe sin \`.select()\`: un rechazo de la RLS volvería como éxito`,
    );
  });

  test(`${nombre} trata «ninguna fila tocada» como fallo`, () => {
    const cuerpo = cuerpoDe(fn);
    assert.match(
      cuerpo,
      /!\w+\?\.length/,
      `${nombre} no comprueba cuántas filas tocó, así que no puede distinguir un rechazo`,
    );
    assert.match(
      cuerpo,
      /motivoSinEfecto/,
      `${nombre} debe explicar POR QUÉ no se escribió (sin permiso vs ya no existe)`,
    );
  });
}

test('el motivo distingue «sin permiso» de «ya no existe»', () => {
  // Decirlo mal manda a la usuaria al sitio equivocado: a buscar una tarifa que
  // sigue ahí, o a pedir un permiso que no le falta.
  const cuerpo = cuerpoDe('async function motivoSinEfecto');
  assert.match(cuerpo, /permiso/i);
  assert.match(cuerpo, /ya no existe/i);
  // Lo decide LEYENDO: el SELECT sí está abierto a todo el estudio, así que si
  // la fila se ve, lo que faltaba era el permiso.
  assert.match(cuerpo, /\.select\(/);
});

// ── La cobertura por tipo de clase no puede quedarse vacía a medias ──────────
//
// `plan_tipos_clase` sin filas para un plan significa «cubre TODAS las clases»
// (migr 0111). Eso hace que el orden de las escrituras sea una decisión de
// negocio, no de estilo: `sincronizarTiposDePlan` borraba TODO y luego
// insertaba, así que un insert fallido dejaba el plan sin filas — un «Bono 10
// Reformer» de 130 € pasaba a valer para Mat y para todo lo demás, con la
// pantalla diciendo «Tarifa actualizada».
//
// Ahora sincroniza por diferencia y añade ANTES de quitar, así que el estado
// «sin filas» no llega a existir.

test('⚠️ sincronizarTiposDePlan no borra la cobertura entera antes de escribirla', () => {
  const cuerpo = cuerpoDe('async function sincronizarTiposDePlan');
  // Un `.delete()` acotado solo por el plan borra TODA su cobertura. El de
  // ahora acota además por los tipos que sobran (`.in('tipo_clase_id', …)`).
  const borrados = cuerpo.match(/\.delete\(\)[^\n]*/g) ?? [];
  assert.ok(borrados.length > 0, 'ya no borra nada: ¿cambió la estrategia? actualiza este test');
  for (const linea of borrados) {
    assert.match(
      linea,
      /tipo_clase_id/,
      'un delete acotado solo al plan deja la cobertura VACÍA = «cubre todas las clases»',
    );
  }
});

test('sincronizarTiposDePlan añade antes de quitar', () => {
  // El orden es lo que hace que falle del lado seguro: si el insert no sale, el
  // plan conserva su cobertura anterior en vez de quedarse abierto.
  const cuerpo = cuerpoDe('async function sincronizarTiposDePlan');
  const iInsert = cuerpo.indexOf('.insert(');
  const iDelete = cuerpo.indexOf('.delete()');
  assert.ok(iInsert !== -1 && iDelete !== -1, 'faltan insert o delete: actualiza este test');
  assert.ok(iInsert < iDelete, 'quitar antes de añadir reabre la ventana de «sin filas»');
});

test('⚠️ un fallo al guardar la cobertura NO se canta como éxito', () => {
  // Antes se reportaba a Sentry y se devolvía void, así que `dbUpdatePlanTarifa`
  // seguía devolviendo ESCRITURA_OK y la pantalla decía que se había guardado.
  const sincro = cuerpoDe('async function sincronizarTiposDePlan');
  assert.match(sincro, /Promise<ResultadoEscritura>/, 'tiene que poder decir que falló');
  assert.match(sincro, /return falloEscritura/, 'y devolverlo, no solo reportarlo');

  for (const fn of ['export async function dbInsertPlanTarifa', 'export async function dbUpdatePlanTarifa']) {
    const cuerpo = cuerpoDe(fn);
    assert.match(
      cuerpo,
      /return sincronizarTiposDePlan\(/,
      `${fn.replace('export async function ', '')} se traga el fallo de la cobertura en vez de propagarlo`,
    );
  }
});
