import test from 'node:test';
import assert from 'node:assert/strict';
import { colorMarcaDelEstudio, colorSecundarioDelEstudio, PRIMARY_POR_DEFECTO } from './color-marca.ts';

test('el color que elige la propietaria en Marca es el del correo', () => {
  // El bug que cierra esto: cambiaba su color, veía cambiar su panel y su app,
  // y sus correos seguían saliendo del color viejo para siempre.
  assert.equal(colorMarcaDelEstudio('#343825', '#C2185B'), '#C2185B');
  assert.equal(colorMarcaDelEstudio(null, '#C2185B'), '#C2185B');
});

test('sin tema publicado manda la columna de siempre', () => {
  assert.equal(colorMarcaDelEstudio('#7C9A82', null), '#7C9A82');
  assert.equal(colorMarcaDelEstudio('#7C9A82', undefined), '#7C9A82');
});

test('el default del producto NO cuenta como elección', () => {
  // Un tema publicado puede traer el primary por defecto sin que nadie haya
  // elegido nada: basta con publicar un favicon. Tomarlo le cambiaría el color
  // de sus correos al oliva del producto sin haberlo pedido.
  assert.equal(colorMarcaDelEstudio('#C2185B', PRIMARY_POR_DEFECTO), '#C2185B');
  assert.equal(colorMarcaDelEstudio('#c2185b', '#343825'), '#c2185b');
  // Sin color propio en la columna, el default sí vale: es lo único que hay.
  assert.equal(colorMarcaDelEstudio(null, PRIMARY_POR_DEFECTO), PRIMARY_POR_DEFECTO);
});

test('un hex a medio escribir nunca sale del resolver', () => {
  // Un valor roto en un `style` de correo deja el fondo transparente y no hay
  // forma de verlo hasta que llega a una clienta.
  for (const malo of ['', '  ', 'rosa', '#12345', '#GGGGGG', 42, {}, null, undefined]) {
    assert.equal(colorMarcaDelEstudio(malo, malo), null, `«${String(malo)}» no debería pasar`);
  }
  assert.equal(colorMarcaDelEstudio('rosa', '#C2185B'), '#C2185B');
  assert.equal(colorMarcaDelEstudio('#C2185B', 'rosa'), '#C2185B');
});

test('el secundario solo vive en el tema', () => {
  assert.equal(colorSecundarioDelEstudio('#B9714A'), '#B9714A');
  assert.equal(colorSecundarioDelEstudio(null), null);
  assert.equal(colorSecundarioDelEstudio('medio'), null);
});
