import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cambiosPorClase, type EdicionDeSerie, type SesionDeSerie } from '../series-impacto-edicion.ts';

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
//
// Desde que la vista previa de «Guardar esta y las siguientes» y el guardado
// comparten UNA función (`cambiosPorClase`, lib/series-impacto-edicion.ts), lo
// que decide qué clases avisan se prueba ahí, con comportamiento, y este fichero
// solo comprueba dos cosas de la página: que usa esa función y que no ha vuelto a
// comparar instantes como texto (la base devuelve `…+00:00` y `toISOString()`
// `…000Z`: como cadenas son siempre «distintos» y avisaba de un cambio de hora
// que no existía).

const raiz = join(import.meta.dirname, '..', '..');
const pagina = () => readFileSync(join(raiz, 'app/(dashboard)/calendario/page.tsx'), 'utf8');

/** El cuerpo de `editarSerie`, que es donde vive el bucle. */
function cuerpoEditarSerie(): string {
  const s = pagina();
  const i = s.indexOf('async function editarSerie(');
  assert.ok(i > 0, 'no se encontró editarSerie');
  return s.slice(i, s.indexOf('\n  }\n', s.indexOf('finally', i)));
}

const clase = (id: string, instructorId: string): SesionDeSerie => ({
  id, inicio: `2026-09-01T10:00:00+00:00`, salaId: 'sala-1', tipoClaseId: 'tc-1', instructorId,
  aforoMaximo: 8, cancelada: false, notas: null,
});
const igual: EdicionDeSerie = {
  tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', aforoMaximo: 8,
  horaInicio: '12:00', horaFin: '13:00', notas: null,
};

test('el aviso de la serie tiene en cuenta el cambio de instructora', () => {
  // Cambiar SOLO la profesora: no cambia la hora ni la sala, y aun así hay que avisar.
  const [c] = cambiosPorClase([clase('s0', 'ins-1')], { ...igual, instructorId: 'ins-2' });
  assert.equal(c.instructora, true);
  assert.equal(c.avisa, true,
    'Sin mirar la instructora, cambiar la profesora de una serie no avisa a nadie.');
  assert.equal(c.hora, false, 'y la hora NO ha cambiado (el correo no puede titularse «Cambio de horario»)');
  assert.equal(c.sala, false);
});

test('la comparación es por sesión, no contra la primera de la serie', () => {
  // La 1.ª ya tiene a la instructora nueva; la 2.ª la cubre otra (una sustitución puntual).
  const [primera, segunda] = cambiosPorClase(
    [clase('s0', 'ins-2'), clase('s1', 'ins-3')], { ...igual, instructorId: 'ins-2' });
  assert.equal(primera.avisa, false);
  assert.equal(segunda.avisa, true,
    'Dentro de una serie puede haber clases con instructora distinta (una '
    + 'sustitución puntual): comparar contra `base` dejaría esas sin avisar.');
});

test('la página avisa con la función compartida y no compara instantes como texto', () => {
  const cuerpo = cuerpoEditarSerie();
  assert.match(cuerpo, /cambiosPorClase\(/,
    'El guardado tiene que decidir qué clases avisan con la MISMA función que la vista previa.');
  assert.match(cuerpo, /c\.avisa/);
  assert.doesNotMatch(cuerpo, /s\.inicio !== nuevoInicioS|s\.inicio === nuevoInicioS/,
    'Comparar el inicio como texto da siempre «distinto» con el formato de la base (+00:00).');
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
