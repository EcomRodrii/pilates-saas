import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test ESTRUCTURAL: `app/(dashboard)/calendario/page.tsx` no se puede importar
// desde el runner (resuelve el alias `@/`), mismo idioma que
// lib/student/cadena-rechazo-reserva.test.ts.
//
// El bug: al editar una SERIE, el bucle de avisos saltaba la clase si no habían
// cambiado la hora ni la sala:
//
//     if (s.inicio === nuevoInicioS && s.salaId === form.salaId) continue;
//
// Pero `editarSerieDesde` SÍ manda `instructorId`, así que pasar una serie de 12
// clases a otra profesora cambiaba las 12 y no mandaba ni un aviso a las
// alumnas apuntadas. La clase suelta y el cambio en lote sí avisaban — solo la
// serie, que es el caso que más gente afecta, se quedaba callada.

const raiz = join(import.meta.dirname, '..', '..');
const pagina = () => readFileSync(join(raiz, 'app/(dashboard)/calendario/page.tsx'), 'utf8');

/** El cuerpo de `editarSerie`, que es donde vive el bucle. */
function cuerpoEditarSerie(): string {
  const s = pagina();
  const i = s.indexOf('async function editarSerie(');
  assert.ok(i > 0, 'no se encontró editarSerie');
  return s.slice(i, s.indexOf('\n  }\n', s.indexOf('finally', i)));
}

test('el aviso de la serie tiene en cuenta el cambio de instructora', () => {
  const cuerpo = cuerpoEditarSerie();
  assert.match(cuerpo, /cambioInstructora/,
    'Sin mirar la instructora, cambiar la profesora de una serie no avisa a nadie.');
  assert.doesNotMatch(cuerpo, /if \(s\.inicio === nuevoInicioS && s\.salaId === form\.salaId\) continue;/,
    'Esa condición es justo la que se comía el cambio de instructora.');
});

test('la comparación es por sesión, no contra la primera de la serie', () => {
  const cuerpo = cuerpoEditarSerie();
  assert.match(cuerpo, /s\.instructorId !== form\.instructorId/,
    'Dentro de una serie puede haber clases con instructora distinta (una '
    + 'sustitución puntual): comparar contra `base` dejaría esas sin avisar.');
});

test('usa el aviso que SÍ lleva quién da la clase', () => {
  const cuerpo = cuerpoEditarSerie();
  // Desde el 13-sep la serie avisa en UNA llamada (`avisarCambioSerieServidor`,
  // un correo por alumna — ver lib/avisos-serie.ts) en vez de llamar a
  // `avisarCambioHorarioSala` clase a clase. Lo que protege este test sigue
  // igual: que ese aviso lleve quién da la clase y quién la daba.
  assert.match(cuerpo, /avisarCambioSerieServidor/,
    'El aviso corto no lleva instructora: el correo diría que algo cambió sin decir qué.');
  assert.match(cuerpo, /instructorActual/,
    'El correo tiene que decir quién la da ahora.');
  assert.match(cuerpo, /instructorAnterior/,
    'El correo tiene que poder decir quién la daba antes.');
});

test('una serie no avisa clase a clase', () => {
  const cuerpo = cuerpoEditarSerie();
  // Llamar al aviso dentro del bucle mandaba a una alumna con plaza en toda la
  // serie un correo por clase (evaluación del 13-sep).
  assert.doesNotMatch(cuerpo, /avisarCambioHorarioSala\(/,
    'El aviso por clase dentro del bucle vuelve a mandar un correo por clase.');
});
