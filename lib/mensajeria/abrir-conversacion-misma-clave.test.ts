import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: `abrir_conversacion` tiene que buscar la conversación de una alumna
// con la MISMA clave con la que las rutas públicas la autorizan.
//
// ── El fallo que hubo ────────────────────────────────────────────────────────
// La RPC reutilizaba por `auth_user_id`; las rutas (`/mensajes` GET y POST,
// `/leido` PATCH) autorizan por `socio_id`, y la lista filtra por `socio_id`.
//
// Con una sola ficha por persona y estudio las dos claves coinciden y no se
// nota nada. Dejan de coincidir cuando la ficha se BORRA y la persona vuelve a
// darse de alta: el borrado anonimiza `socios` y pone su `auth_user_id` a NULL,
// pero `conversacion_participantes` sigue apuntando al `socio_id` viejo con el
// `auth_user_id` de la persona. A partir de ahí la RPC le devolvía a su ficha
// NUEVA la conversación de la VIEJA, y esa conversación le respondía 403.
//
// La alumna veía: Mensajes vacío → «Escribir al estudio» → «Algo no ha salido
// como esperábamos». Ni un error en Sentry: un 403 no es una excepción.
//
// ── Por qué un test que lee SQL ──────────────────────────────────────────────
// Porque la deriva es entre un fichero `.sql` y tres `route.ts`, y eso no lo
// cruza ningún compilador — mismo motivo y mismo enfoque que
// `rpc-columnas-declaradas.test.ts`.
//
// Se lee la migración MÁS NUEVA que define la función, no una fija: si mañana
// otra migración la reescribe, este test mira esa. Fijar el nombre del fichero
// habría dejado el guardián verde vigilando una versión que ya no corre.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// O la RPC volvió a buscar por `auth_user_id`, o una ruta dejó de autorizar por
// `socio_id`. Las dos tienen que hablar de lo mismo; cuál de las dos se cambia
// es una decisión, pero no pueden discrepar.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');

/** La migración más reciente que define `abrir_conversacion`. */
function ultimaDefinicion(): { fichero: string; sql: string } {
  const candidatas = readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => /function public\.abrir_conversacion/.test(readFileSync(join(MIGRACIONES, f), 'utf8')))
    .sort();
  assert.ok(candidatas.length > 0, 'ninguna migración define abrir_conversacion: ¿cambió el nombre?');
  const fichero = candidatas[candidatas.length - 1];
  return { fichero, sql: readFileSync(join(MIGRACIONES, fichero), 'utf8') };
}

/** El bloque `elsif p_tipo = 'ALUMNA_MOSTRADOR' … else` de esa definición. */
function bloqueMostrador(sql: string): string {
  const i = sql.indexOf("elsif p_tipo = 'ALUMNA_MOSTRADOR'");
  assert.ok(i > 0, 'no se encuentra la rama ALUMNA_MOSTRADOR en la migración');
  const fin = sql.indexOf('else -- EQUIPO', i);
  assert.ok(fin > i, 'no se encuentra el final de la rama ALUMNA_MOSTRADOR');
  return sql.slice(i, fin);
}

const { fichero, sql } = ultimaDefinicion();

test('se ha leído una definición de verdad, no un fichero vacío', () => {
  // Sin esto, un cambio de forma dejaría el test comparando cadenas vacías.
  assert.ok(sql.length > 1500, `${fichero} parece demasiado corto para definir la función`);
  assert.match(sql, /ALUMNA_MOSTRADOR/);
  assert.match(sql, /conversacion_participantes/);
});

test('la reutilización de la conversación de alumna busca por socio_id', () => {
  const bloque = bloqueMostrador(sql);
  // La búsqueda de conversación existente: `exists (select 1 from
  // conversacion_participantes cp where … )`.
  const busqueda = bloque.slice(bloque.indexOf('select c.id into v_id'), bloque.indexOf('limit 1'));
  assert.ok(busqueda.length > 0, 'no se encuentra la búsqueda de conversación existente');

  assert.match(busqueda, /cp\.socio_id\s*=\s*p_socio_id/,
    `${fichero}: la reutilización debe casar por socio_id, la clave con la que autorizan las rutas`);
  assert.doesNotMatch(busqueda, /cp\.auth_user_id/,
    `${fichero}: buscar por auth_user_id devuelve a una ficha NUEVA la conversación de una BORRADA, `
    + 'y esa conversación le responde 403');
});

test('las tres rutas públicas de mensajería siguen autorizando por socio_id', () => {
  // La otra mitad del contrato. Si alguien cambiara estas a `auth_user_id`, la
  // discrepancia volvería por el otro lado y el test de arriba no la vería.
  const rutas = [
    'app/api/public/mensajeria/conversaciones/route.ts',
    'app/api/public/mensajeria/conversaciones/[id]/mensajes/route.ts',
    'app/api/public/mensajeria/conversaciones/[id]/leido/route.ts',
  ];
  for (const r of rutas) {
    const fuente = readFileSync(join(RAIZ, r), 'utf8');
    assert.match(fuente, /\.eq\('socio_id', socioId\)/,
      `${r}: ya no autoriza/filtra por socio_id — o se cambia también la RPC, o vuelve la discrepancia`);
  }
});
