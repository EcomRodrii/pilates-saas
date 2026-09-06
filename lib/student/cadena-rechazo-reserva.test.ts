import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Estos tests son ESTRUCTURALES (leen el fuente) y hay que decirlo: ni las
// rutas de Next ni `lib/student/reservar.ts` se pueden importar desde el
// runner, porque resuelven el alias `@/` que `node --test
// --experimental-strip-types` no conoce. Es el mismo idioma que ya usan
// `crons-paginacion.test.ts` y `tope-socias-idempotencia.test.ts`.
//
// Por qué existen: el bug que arreglaron NO era una función equivocada, era una
// CADENA rota en tres saltos distintos, y cada salto vivía en un fichero que los
// tests de su vecino no miran. La revisión independiente de la auditoría del
// 4-sep lo dijo con todas las letras: revertir cualquiera de los tres saltos
// dejaba la suite entera en verde. Esto lo cierra.
//
// El síntoma: la alumna sin bono leía «Algo no ha salido como esperábamos ·
// Inténtalo de nuevo» —con un botón que iba a fallar igual— en vez de
// «Necesitas un plan o bono activo para reservar».

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

test('salto 1: los rechazos de negocio de crearReservaPublica llevan `codigo`', () => {
  const fuente = leer('lib/db/supabase-data-admin.ts');
  for (const codigo of ['sin-plan', 'bono-no-cubre', 'max-simultaneas']) {
    assert.match(
      fuente, new RegExp(`codigo: '${codigo}'`),
      `El rechazo '${codigo}' tiene que viajar con su codigo. Sin el, el switch de `
      + `reserva-codigos.ts cae en el default y la pantalla pinta una averia generica.`,
    );
  }
});

// El test de arriba fija TRES códigos concretos, y por eso no vio el siguiente
// caso: el 4-sep se arreglaron esos tres y se dejaron sin `codigo` los seis
// rechazos ANTERIORES de la misma función (sesión no encontrada, clase
// cancelada, clase ya empezada, las dos ventanas de antelación y el «No
// autorizado»). La alumna siguió leyendo el copy genérico de avería hasta que
// una de ellas apareció en Sentry el 4-sep (JAVASCRIPT-NEXTJS-26).
//
// Un test por código nombrado no cierra la familia: solo cierra el ejemplar
// que ya conocíamos. Estos dos la cierran por construcción.
test('salto 1 bis: NINGÚN rechazo de crearReservaPublica se queda sin `codigo`', () => {
  const fuente = leer('lib/db/supabase-data-admin.ts');
  const inicio = fuente.indexOf('export async function crearReservaPublica');
  assert.ok(inicio > 0, 'no se encuentra crearReservaPublica');
  // Hasta el final de la función: el siguiente `export async function`.
  const fin = fuente.indexOf('\nexport async function', inicio + 1);
  const cuerpo = fuente.slice(inicio, fin > 0 ? fin : undefined);

  // ⚠️ El patron NO puede exigir el prefijo `return { error:`: dos de los
  // rechazos —`sin-plan` y `bono-no-cubre`, justo los del fix del 4-sep— viven
  // dentro de un ternario (`return tieneAlgunPlan ? {...} : {...};`) y el
  // primer intento de este test los daba por buenos sin mirarlos. Se busca el
  // OBJETO, venga como venga.
  const rechazos = cuerpo.match(/\{ error: (?:[^{}]|\{[^{}]*\})*?\}/g) ?? [];
  assert.ok(rechazos.length >= 14, `esperaba los rechazos de la función, encontré ${rechazos.length}`);
  const sinCodigo = rechazos.filter(r => !/codigo:/.test(r));
  assert.deepEqual(
    sinCodigo, [],
    'Estos rechazos viajan sin `codigo`, asi que reserva-codigos.ts cae en el `default`: '
    + 'la alumna ve «algo no ha salido como esperabamos · intentalo de nuevo» en vez del motivo, '
    + 'y reservar.ts los reporta a Sentry como si fueran una averia. Anade el codigo (y registralo '
    + 'en CODIGOS_DE_NEGOCIO de lib/student/reserva-codigos.ts).',
  );
});

test('salto 1 ter: todo `codigo` que emite el servidor lo conoce el cliente', () => {
  const servidor = leer('lib/db/supabase-data-admin.ts');
  const cliente = leer('lib/student/reserva-codigos.ts');
  const inicio = servidor.indexOf('export async function crearReservaPublica');
  const fin = servidor.indexOf('\nexport async function', inicio + 1);
  const cuerpo = servidor.slice(inicio, fin > 0 ? fin : undefined);

  const emitidos = [...cuerpo.matchAll(/codigo: '([a-z-]+)'/g)].map(m => m[1]);
  assert.ok(emitidos.length > 0, 'esperaba encontrar codigos emitidos');
  // 'error' es el comodin: existe en el tipo a proposito y NO debe estar en
  // CODIGOS_DE_NEGOCIO (es lo unico que si hay que reportar a Sentry).
  for (const codigo of new Set(emitidos.filter(c => c !== 'error'))) {
    assert.match(
      cliente, new RegExp(`'${codigo}'`),
      `El servidor emite '${codigo}' y lib/student/reserva-codigos.ts no lo menciona: `
      + 'el switch cae en el default y esRechazoConocido() lo trata como averia. '
      + 'Anadelo al tipo CodigoReserva, a CODIGOS_DE_NEGOCIO y al switch.',
    );
  }
});

test('salto 2: /api/public/reserva NO se come el `codigo` al serializar', () => {
  const fuente = leer('app/api/public/reserva/route.ts');
  const respuestasDeError = fuente.match(/NextResponse\.json\(\{ error: r\.error[^)]*\}/g) ?? [];
  assert.ok(respuestasDeError.length >= 3, 'esperaba las 3 respuestas de rechazo (crear/cancelar/valorar)');
  for (const r of respuestasDeError) {
    assert.match(
      r, /codigo/,
      'Esta respuesta devuelve solo `error` y tira el `codigo`. Ese fue el fallo original: '
      + 'el codigo no llego NUNCA a ningun cliente, asi que los estados full/duplicate/conflict '
      + 'de la maquina de reserva estaban muertos en produccion.',
    );
  }
});

test('salto 3: BookingStatus pinta el mensaje del servidor cuando lo hay', () => {
  const fuente = leer('components/student/domain/BookingStatus.tsx');
  assert.match(
    fuente, /mensaje \?\? c\.cuerpo/,
    'Sin esto el componente ignora el mensaje concreto y siempre pinta el copy generico.',
  );
});

test('el mensaje crudo del servidor NO se le ensena a la alumna', () => {
  const fuente = leer('lib/student/reservar.ts');
  assert.match(
    fuente, /esRechazoConocido\(codigo\)\s*\?\s*\{ \.\.\.desenlace, mensaje: undefined \}/,
    'Un rechazo SIN codigo conocido llega como `{ error: error.message }`: el texto crudo de '
    + 'Postgres. Hay que recortarlo antes de la pantalla, o BookingStatus lo pinta tal cual.',
  );
  assert.match(fuente, /return desenlaceParaPantalla;/, 'y hay que devolver el recortado, no el original');
});

// El salto que ninguno de los tests de arriba mira: la RPC `reservar_plaza`
// lanza sus rechazos con `raise exception 'NOMBRE'`, y `crearReservaPublica`
// los traduce con una escalera de `error.message.includes('NOMBRE')`. Nada
// conecta las dos listas, asi que anadir un `raise exception` nuevo en una
// migracion deja el TS callado: el rechazo cae en el `codigo: 'error'` final y
// la alumna lee «algo no ha salido como esperabamos».
//
// Paso de verdad: `ESTUDIO_CERRADO` llego con el cierre del centro (#1665,
// migr 20260905153105) y estuvo un dia sin traducir — y en el camino del pago
// eso significaba cobrar y no dar plaza sin avisar a nadie.
test('salto 0: todo `raise exception` de reservar_plaza lo traduce el TS', () => {
  const migraciones = readdirSync(join(raiz, 'supabase/migrations'))
    .filter(f => f.endsWith('.sql'))
    .sort();
  // La ULTIMA migracion que redefine la RPC es la que esta viva en produccion.
  const ultima = migraciones
    .filter(f => /create or replace function public\.reservar_plaza/i.test(leer(`supabase/migrations/${f}`)))
    .pop();
  assert.ok(ultima, 'no se encuentra ninguna migracion que defina reservar_plaza');

  const sql = leer(`supabase/migrations/${ultima}`);
  const lanzados = new Set(
    [...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map(m => m[1]),
  );
  assert.ok(lanzados.size >= 10, `esperaba los rechazos de la RPC, encontre ${lanzados.size}`);

  const ts = leer('lib/db/supabase-data-admin.ts');
  const inicio = ts.indexOf('export async function crearReservaPublica');
  const fin = ts.indexOf('\nexport async function', inicio + 1);
  const cuerpo = ts.slice(inicio, fin > 0 ? fin : undefined);

  const sinTraducir = [...lanzados].filter(n => !cuerpo.includes(`includes('${n}')`));
  assert.deepEqual(
    sinTraducir, [],
    `La RPC lanza estos rechazos y crearReservaPublica no los traduce, asi que caen en `
    + `codigo:'error': copy generico de averia para la alumna y un evento de Sentry por `
    + `intento. Anade su rama a la escalera (y el codigo a lib/student/reserva-codigos.ts). `
    + `Migracion mirada: ${ultima}`,
  );
});
