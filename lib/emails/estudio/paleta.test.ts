import test from 'node:test';
import assert from 'node:assert/strict';
import { paletaCorreoEstudio, MARCA_POR_DEFECTO } from './paleta.ts';
import { ratioContraste } from '../../wcag-contrast.ts';
import { hexToHsl } from '../../color-utils.ts';

// Umbral de texto normal. Ninguna de las tres cosas que se pintan SOBRE un
// fondo en el correo es texto grande: la etiqueta va a 11 px, el pie a 11 y el
// texto del botón a 13,5.
const AA = 4.5;

test('sin color del estudio cae al del kit, nunca a una cadena rota', () => {
  for (const malo of [null, undefined, '', '  ', 'azul', '#GGG', '#12345']) {
    const p = paletaCorreoEstudio(malo);
    assert.equal(p.marca, MARCA_POR_DEFECTO, `«${String(malo)}» debería caer al color del kit`);
    // Lo que de verdad importa: todo lo que se pinta es un hex válido.
    for (const [clave, valor] of Object.entries(p)) {
      assert.match(valor, /^#[0-9a-fA-F]{6}$/, `${clave} no es un hex válido con «${String(malo)}»`);
    }
  }
});

test('el arena y el papel llevan el matiz de la marca, no un gris de catálogo', () => {
  const oliva = paletaCorreoEstudio('#343825');
  const magenta = paletaCorreoEstudio('#C2185B');
  assert.notEqual(oliva.arena, magenta.arena, 'dos marcas distintas comparten fondo');
  assert.notEqual(oliva.papel, magenta.papel);
  assert.notEqual(oliva.borde, magenta.borde);
});

test('el fondo se queda claro por chillón que sea el color de marca', () => {
  // Si el arena se oscureciera, el texto dejaría de leerse: es el fondo de la
  // tarjeta de datos, donde va la fecha de la clase.
  for (const color of ['#FF0000', '#00FF00', '#0000FF', '#000000', '#FFFFFF', '#C2185B']) {
    const p = paletaCorreoEstudio(color);
    assert.ok(ratioContraste(p.tinta, p.arena)! >= 7, `el texto no se lee sobre el arena de ${color}`);
    assert.ok(ratioContraste(p.tinta, p.papel)! >= 7, `el texto no se lee sobre el papel de ${color}`);
  }
});

test('etiqueta, pie y texto del botón cumplen AA con cualquier marca', () => {
  // Un color de marca pastel es legítimo (los hay en producción) y es justo el
  // que deja una etiqueta de 11 px en 2:1 si nadie lo comprueba.
  for (const color of ['#F7A6C4', '#FFE066', '#343825', '#7C9A82', '#C2185B', '#111111']) {
    const p = paletaCorreoEstudio(color);
    assert.ok(ratioContraste(p.etiqueta, p.arena)! >= AA, `etiqueta ilegible con ${color}`);
    assert.ok(ratioContraste(p.tintaSuave, p.arena)! >= AA, `pie ilegible con ${color}`);
    assert.ok(ratioContraste(p.tintaSuave, p.papel)! >= AA, `nota ilegible con ${color}`);
    assert.ok(ratioContraste(p.enlace, p.papel)! >= AA, `enlace ilegible con ${color}`);
    assert.ok(ratioContraste(p.botonTexto, p.boton)! >= AA, `texto del botón ilegible con ${color}`);
  }
});

test('el color secundario pinta el botón; sin él, lo pinta el principal', () => {
  const dos = paletaCorreoEstudio('#7C9A82', '#B9714A');
  assert.equal(dos.boton, '#B9714A');
  assert.equal(dos.marca, '#7C9A82', 'el secundario no debe pisar el principal');

  const uno = paletaCorreoEstudio('#7C9A82');
  assert.equal(uno.boton, '#7C9A82');

  // Un secundario a medio escribir no puede dejar el botón sin fondo.
  assert.equal(paletaCorreoEstudio('#7C9A82', 'rosa').boton, '#7C9A82');
});


test('un secundario casi blanco es el fondo del estudio, no su botón', () => {
  // Así llegó a una bandeja real: tema publicado con #ECE8E1 de «superficie
  // suave», y el correo lo usaba de botón — beige sobre beige, texto negro.
  const p = paletaCorreoEstudio('#666dcc', '#ECE8E1');
  assert.equal(p.boton, '#666dcc', 'el botón vuelve al color principal');
  assert.equal(p.arena, '#ECE8E1', 'el fondo es el que eligió el estudio');
  assert.ok(ratioContraste(p.botonTexto, p.boton)! >= AA, 'texto del botón ilegible');
  assert.ok(ratioContraste(p.etiqueta, p.arena)! >= AA, 'etiqueta ilegible');
  assert.ok(ratioContraste(p.tinta, p.arena)! >= 7);
});

test('un secundario con cuerpo sigue pintando el botón (los presets)', () => {
  assert.equal(paletaCorreoEstudio('#343825', '#5A6142').boton, '#5A6142');
});

test('una marca fría no ensucia el arena de gris', () => {
  // Un 10 % de índigo sobre el arena cálido daba un gris lila: tonos opuestos
  // en RGB no tiñen, apagan. La saturación del arena es la medida de eso.
  const base = hexToHsl(paletaCorreoEstudio('#343825').arena)!;
  for (const fria of ['#666dcc', '#4F46E5', '#0F766E', '#6D28D9']) {
    const arena = hexToHsl(paletaCorreoEstudio(fria).arena)!;
    assert.ok(arena.s >= 40, `arena apagado (${arena.s.toFixed(0)} %) con ${fria}`);
  }
  assert.ok(base.s > 0, 'la marca cálida sigue tiñendo');
  assert.notEqual(paletaCorreoEstudio('#343825').arena, paletaCorreoEstudio('#666dcc').arena);
});

test('el color de botón elegido a mano gana, sea claro u oscuro', () => {
  const p = paletaCorreoEstudio('#666dcc', '#ECE8E1', '#F3E6D8');
  assert.equal(p.boton, '#F3E6D8');
  assert.equal(p.arena, '#ECE8E1', 'elegir botón no cambia el fondo');
  assert.ok(ratioContraste(p.botonTexto, p.boton)! >= AA);
});
