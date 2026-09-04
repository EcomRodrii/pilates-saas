import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/notifications/preferences: guardar UN canal no puede borrar los otros.
//
// El modelo es categoría × canal (inapp, push, email, whatsapp, sms) y las dos
// pantallas que lo usan —portal de la socia y panel— mandan UN solo campo por
// toque: `{ studioId, category, push: false }`. El endpoint hacía un `upsert` de
// FILA COMPLETA con defaults (`push: b.push ?? true`, `email: b.email ?? false`,
// …), así que cada toque reescribía los canales que no venían: apagar el email
// de `pagos` volvía a encender el push, tocar cualquier push apagaba el email y
// whatsapp/sms se ponían a false siempre. Respondía `{ok:true}` y ninguna de las
// dos pantallas recarga, así que el borrado no se veía hasta la siguiente visita.
//
// Se comprueba sobre el FUENTE (no importando el módulo) porque la ruta arrastra
// el cliente de Supabase; mismo idioma que `tope-socias-idempotencia.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

const PREFERENCIAS = 'app/api/notifications/preferences/route.ts';
const SUBSCRIBE = 'app/api/notifications/subscribe/route.ts';

// Se quitan los comentarios: el propio fix cita el patrón viejo
// (`push: b.push ?? true`) para explicar por qué desapareció, y un test que se
// deja engañar por su propia documentación no vale nada.
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function cuerpoDelPut(fuente: string): string {
  const ini = fuente.indexOf('export async function PUT');
  assert.ok(ini > 0, 'no encuentro el PUT de preferences: ¿se renombró?');
  return sinComentarios(fuente.slice(ini));
}

const CANALES = ['inapp', 'push', 'email', 'whatsapp', 'sms'];

test('el PUT no aplica defaults a los canales que no vienen en el body', () => {
  const put = cuerpoDelPut(leer(PREFERENCIAS));
  for (const canal of CANALES) {
    assert.ok(
      !new RegExp(`b\\.${canal}\\s*\\?\\?`).test(put),
      `El PUT vuelve a escribir '${canal}' con un default (\`b.${canal} ?? …\`). ` +
      'Eso reescribe un canal que la pantalla no ha tocado: guardar uno borra los otros.',
    );
  }
});

test('el PUT solo escribe los canales PRESENTES en el body', () => {
  const put = cuerpoDelPut(leer(PREFERENCIAS));
  assert.match(
    put,
    /typeof b\[canal\] === 'boolean'/,
    'El PUT tiene que distinguir "no me mandes este campo" de "ponlo a false" ' +
    'mirando qué claves vienen; si no, vuelve a ser un upsert de fila completa.',
  );
  assert.ok(
    !put.includes('.upsert('),
    'Un upsert de fila completa reescribe los canales ausentes. El update parcial ' +
    'va con UPDATE acotado por (user_id, category) y INSERT solo si no existía.',
  );
});

test('el PUT no responde ok cuando no hay ningún canal que guardar', () => {
  const put = cuerpoDelPut(leer(PREFERENCIAS));
  assert.match(
    put,
    /Object\.keys\(cambios\)\.length === 0[\s\S]{0,400}status: 400/,
    'Sin ningún canal en el body no hay nada que guardar: responder {ok:true} ' +
    'sería el mismo éxito falso que se acaba de quitar.',
  );
});

// ── El studio_id del body ────────────────────────────────────────────────────
// Las dos rutas escriben `studio_id: b.studioId` con service-role (sin RLS
// debajo) y solo el JWT validado. Se comprueban JUNTAS a propósito: son gemelas
// —misma forma, mismo fallo— y arreglar una y no la otra es exactamente lo que
// ya ha pasado varias veces en este repo.
for (const rel of [PREFERENCIAS, SUBSCRIBE]) {
  test(`${rel}: valida la pertenencia al estudio antes de escribir studio_id`, () => {
    const fuente = leer(rel);
    assert.ok(fuente.includes('studio_id: b.studioId'), `${rel} ya no escribe el studio_id del body: revisa este test`);
    assert.ok(
      fuente.includes('socioAutenticado(') && fuente.includes('verificarSesionStaff('),
      `${rel} escribe el studio_id del body sin comprobar que esa persona pertenezca ` +
      'al estudio. Cualquiera con cuenta puede sembrar filas en el estudio de otro.',
    );
    assert.ok(fuente.includes('status: 403'), `${rel} debe responder 403 a quien no pertenece al estudio`);
  });
}
