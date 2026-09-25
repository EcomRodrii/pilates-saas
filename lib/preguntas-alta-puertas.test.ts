import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// «Obligatorias antes de reservar o comprar» solo es verdad si TODAS las
// puertas del servidor que crean algo nuevo para la alumna lo comprueban. La
// app ya la para antes, pero la página de reservas y el widget no pasan por la
// app. Si alguien quita la comprobación de una puerta, esto falla.

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const PUERTAS = [
  ['app/api/public/reserva/route.ts', 'reservar'],
  ['app/api/public/checkout-embebido/route.ts', 'comprar'],
  ['app/api/stripe/checkout/route.ts', 'comprar'],
] as const;

for (const [fichero, que] of PUERTAS) {
  test(`${fichero} no deja ${que} con preguntas del estudio sin contestar`, () => {
    const fuente = leer(fichero);
    assert.match(
      fuente, new RegExp(`bloqueoPorPreguntasAlta\\(body\\.studioId, socioId, '${que}'\\)`),
      `Falta la comprobación de preguntas en ${fichero}.`,
    );
    // Y su respuesta se devuelve, no se calcula y se tira.
    assert.match(fuente, /if \(sinPreguntas\) return conCorsWidget\(req, sinPreguntas\);/);
  });
}

test('el código del rechazo lo conoce la app, y lo trata como regla y no como avería', () => {
  const servidor = leer('lib/db/preguntas-alta-admin.ts');
  const codigos = leer('lib/student/reserva-codigos.ts');
  assert.match(servidor, /CODIGO_FALTAN_PREGUNTAS = 'faltan-preguntas'/);
  assert.match(codigos, /'faltan-preguntas'/);
  // Al verlo, reservar y comprar abren las preguntas en vez de dejar un error sin salida.
  assert.match(leer('lib/student/reservar.ts'), /codigo === 'faltan-preguntas'\) avisarFaltanPreguntas\(\)/);
  assert.match(leer('lib/student/comprar.ts'), /codigo === 'faltan-preguntas'\) avisarFaltanPreguntas\(\)/);
});

test('la ruta de las preguntas saca a la socia del JWT, nunca del cuerpo', () => {
  const ruta = leer('app/api/public/preguntas-alta/route.ts');
  assert.match(ruta, /socioAutenticado\(user\.userId, studioId\)/);
  assert.doesNotMatch(ruta, /body\??\.socioId/);
});
