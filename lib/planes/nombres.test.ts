import test from 'node:test';
import assert from 'node:assert/strict';
import { NOMBRE_TIPO_PLAN, EXPLICACION_TIPO_PLAN } from './formulario.ts';

// `MENSUAL`, `BONO` y `PUNTUAL` son constantes de la base de datos y se
// enseñaban tal cual, en mayúsculas, en el desplegable de crear tarifa y en la
// insignia de la tabla. Una dueña de estudio no dice «PUNTUAL»: dice «clase
// suelta». Estos tests fijan que la traducción existe para TODOS los tipos, que
// es donde se rompería al añadir uno nuevo.

test('cada tipo de tarifa tiene nombre en castellano, y no es la constante', () => {
  for (const tipo of ['MENSUAL', 'BONO', 'PUNTUAL'] as const) {
    const nombre = NOMBRE_TIPO_PLAN[tipo];
    assert.ok(nombre, `falta el nombre de ${tipo}`);
    assert.notEqual(nombre, tipo, `${tipo} sigue enseñándose en crudo`);
    assert.notEqual(nombre, nombre.toUpperCase(), `${tipo} sigue en mayúsculas`);
  }
});

test('cada tipo tiene su explicación de una línea para el desplegable', () => {
  for (const tipo of ['MENSUAL', 'BONO', 'PUNTUAL'] as const) {
    assert.ok(EXPLICACION_TIPO_PLAN[tipo]?.length > 10, `falta la explicación de ${tipo}`);
  }
});

test('«PUNTUAL» se llama clase suelta, que es como lo dice un estudio', () => {
  assert.equal(NOMBRE_TIPO_PLAN.PUNTUAL, 'Clase suelta');
});
