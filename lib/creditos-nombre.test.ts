import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreCreditos, normalizarNombreCreditos, NOMBRE_CREDITOS_POR_DEFECTO, NOMBRE_CREDITOS_MAX } from './creditos-nombre.ts';

test('sin nombre configurado, el producto pone el suyo', () => {
  assert.equal(nombreCreditos(null), NOMBRE_CREDITOS_POR_DEFECTO);
  assert.equal(nombreCreditos(undefined), NOMBRE_CREDITOS_POR_DEFECTO);
  assert.equal(nombreCreditos(''), NOMBRE_CREDITOS_POR_DEFECTO);
  // Espacios en blanco NO son un nombre: si esto devolviera '   ', la tarjeta
  // pondría «500  » y parecería un fallo de carga.
  assert.equal(nombreCreditos('   '), NOMBRE_CREDITOS_POR_DEFECTO);
});

test('el nombre del estudio se respeta tal cual, solo recortado por los lados', () => {
  assert.equal(nombreCreditos('puntos'), 'puntos');
  assert.equal(nombreCreditos('  estrellas  '), 'estrellas');
  // Mayúsculas incluidas: es su marca, no se «corrige».
  assert.equal(nombreCreditos('Zen'), 'Zen');
});

test('al guardar, «créditos» y vacío son lo mismo: no se guarda nada', () => {
  // Guardar el literal por defecto congelaría ese texto para ese estudio: si el
  // producto cambia la palabra, quien la tecleó se quedaría con la vieja.
  assert.equal(normalizarNombreCreditos('créditos'), null);
  assert.equal(normalizarNombreCreditos('  Créditos '), null);
  assert.equal(normalizarNombreCreditos(''), null);
  assert.equal(normalizarNombreCreditos('   '), null);
});

test('al guardar se recorta al máximo, y no queda un espacio colgando', () => {
  const largo = 'a'.repeat(NOMBRE_CREDITOS_MAX + 10);
  assert.equal(normalizarNombreCreditos(largo)?.length, NOMBRE_CREDITOS_MAX);
  // Si el corte cae justo en un espacio, no se guarda con él al final.
  const conEspacio = 'a'.repeat(NOMBRE_CREDITOS_MAX - 1) + ' bcd';
  assert.equal(normalizarNombreCreditos(conEspacio), 'a'.repeat(NOMBRE_CREDITOS_MAX - 1));
});

test('lo que se guarda es lo que luego se pinta', () => {
  // La pareja tiene que cerrar: normalizar → guardar → nombreCreditos.
  for (const tecleado of ['puntos', 'ESTRELLAS', '  Zen  ', 'créditos', '']) {
    const guardado = normalizarNombreCreditos(tecleado);
    const pintado = nombreCreditos(guardado);
    assert.ok(pintado.length > 0 && pintado === pintado.trim(), `«${tecleado}» → «${pintado}»`);
  }
});
