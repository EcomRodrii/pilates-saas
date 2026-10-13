import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoCoberturaFallida } from './cobertura-fallida.ts';

const base = { nombre: 'Bono 10 clases', editando: false, aLaVenta: true, desactivada: false };

test('nunca dice «no se ha guardado»: la tarifa existe en los cuatro casos', () => {
  for (const caso of [
    base,
    { ...base, desactivada: true },
    { ...base, aLaVenta: false },
    { ...base, editando: true },
  ]) {
    assert.doesNotMatch(avisoCoberturaFallida(caso), /no se ha guardado/i);
  }
});

test('creada y retirada de la venta: lo dice, y cómo volver a ponerla', () => {
  const t = avisoCoberturaFallida({ ...base, desactivada: true });
  assert.match(t, /«Bono 10 clases» se ha creado/);
  assert.match(t, /sin poner a la venta/);
  assert.match(t, /vuelve a ponerla a la venta/);
});

test('a la venta sin poder retirarla: avisa de que vale para TODAS las clases', () => {
  assert.match(avisoCoberturaFallida(base), /está a la venta.*ahora vale para TODAS/);
});

test('creada como borrador: no habla de retirarla', () => {
  const t = avisoCoberturaFallida({ ...base, aLaVenta: false });
  assert.match(t, /se ha creado sin poner a la venta/);
  assert.doesNotMatch(t, /TODAS/);
});

test('editando: los cambios sí, la cobertura no, y nunca promete «las de antes» (podían ser todas)', () => {
  const t = avisoCoberturaFallida({ ...base, editando: true });
  assert.match(t, /Los cambios de «Bono 10 clases» se han guardado, pero no a qué clases da acceso\. Ábrela con el lápiz y revísalas\./);
  assert.doesNotMatch(t, /las de antes/);
});

test('editando y retirada de la venta (la edición la ponía a la venta): lo dice', () => {
  assert.match(avisoCoberturaFallida({ ...base, editando: true, desactivada: true }), /se han guardado, pero no a qué clases da acceso, así que la hemos dejado sin poner a la venta/);
});

test('sin nombre, no deja comillas vacías', () => {
  assert.match(avisoCoberturaFallida({ ...base, nombre: '  ' }), /^«La tarifa» se ha creado/);
});
