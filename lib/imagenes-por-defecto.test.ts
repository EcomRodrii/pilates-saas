import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGENES_POR_DEFECTO, IMAGENES_CLASE,
  familiaDeClase, imagenDeEstudio, imagenDeClase, elegirVariante,
} from './imagenes-por-defecto.ts';

test('la foto propia gana a la de por defecto', () => {
  assert.equal(imagenDeEstudio('vertical', 'https://cdn/mia.jpg'), 'https://cdn/mia.jpg');
});

test('sin foto propia sale la de por defecto de ESE hueco', () => {
  assert.equal(imagenDeEstudio('vertical', null), IMAGENES_POR_DEFECTO.vertical[0]);
  assert.equal(imagenDeEstudio('banda', null), IMAGENES_POR_DEFECTO.banda[0]);
  assert.notEqual(imagenDeEstudio('portada', null), imagenDeEstudio('banner', null));
});

test('vacío y en blanco significan lo mismo: «pon la de por defecto»', () => {
  // Una cadena de espacios es lo que queda cuando alguien borra lo que había
  // y el cursor deja un blanco. Tratarla como URL legítima pinta una imagen rota.
  for (const nada of ['', '   ', '\n', null, undefined]) {
    assert.equal(imagenDeEstudio('portada', nada), IMAGENES_POR_DEFECTO.portada[0]);
  }
});

test('varias candidatas: gana la primera que no esté vacía', () => {
  assert.equal(imagenDeEstudio('portada', ['  ', null, 'https://cdn/b.jpg']), 'https://cdn/b.jpg');
  assert.equal(imagenDeEstudio('portada', [null, undefined]), IMAGENES_POR_DEFECTO.portada[0]);
});

test('a la URL propia se le quitan los espacios de los lados', () => {
  assert.equal(imagenDeEstudio('banda', '  https://cdn/a.jpg  '), 'https://cdn/a.jpg');
});

test('la familia de clase se adivina por el nombre, con tildes y mayúsculas', () => {
  assert.equal(familiaDeClase('Reformer Flow'), 'reformer');
  assert.equal(familiaDeClase('REFORMERS avanzado'), 'reformer');
  assert.equal(familiaDeClase('Pilates Suelo'), 'mat');
  assert.equal(familiaDeClase('Mat'), 'mat');
  assert.equal(familiaDeClase('Cadillac'), 'maquina');
  assert.equal(familiaDeClase('Torre + Barril'), 'maquina');
  assert.equal(familiaDeClase('Yoga Vinyasa'), 'yoga');
  assert.equal(familiaDeClase('Meditación guiada'), 'yoga');
  assert.equal(familiaDeClase('HIIT 45'), 'hiit');
  assert.equal(familiaDeClase('Entrenamiento funcional'), 'hiit');
});

test('lo que no reconoce cae en la genérica, nunca en una equivocada', () => {
  assert.equal(familiaDeClase('Clase abierta'), 'generica');
  assert.equal(familiaDeClase(''), 'generica');
  assert.equal(familiaDeClase(null), 'generica');
  assert.equal(familiaDeClase('Prenatal'), 'generica');
});

test('«mat» exige la palabra entera: «matinal» no es una clase de suelo', () => {
  // El motivo de que las pistas cortas sean exactas y no prefijo.
  assert.equal(familiaDeClase('Clase matinal'), 'generica');
  assert.equal(familiaDeClase('Material propio'), 'generica');
  assert.equal(familiaDeClase('Mat Pilates'), 'mat');
});

test('el orden de las pistas manda: «Reformer & Mat» es reformer', () => {
  assert.equal(familiaDeClase('Reformer & Mat'), 'reformer');
});

test('la foto del tipo de clase gana a la de su familia', () => {
  assert.equal(imagenDeClase({ fotoUrl: 'https://cdn/x.jpg', nombre: 'Yoga' }), 'https://cdn/x.jpg');
});

test('sin foto propia, la clase coge la de su familia', () => {
  assert.equal(imagenDeClase({ fotoUrl: null, nombre: 'Reformer' }), IMAGENES_CLASE.reformer);
  assert.equal(imagenDeClase({ fotoUrl: '', nombre: 'Yoga suave' }), IMAGENES_CLASE.yoga);
  assert.equal(imagenDeClase({ nombre: 'Clase abierta' }), IMAGENES_CLASE.generica);
  assert.equal(imagenDeClase(null), IMAGENES_CLASE.generica);
});

test('la variante es estable: el mismo estudio ve siempre la misma foto', () => {
  const tres = ['/a.webp', '/b.webp', '/c.webp'];
  const primera = elegirVariante(tres, 'studio-1');
  for (let i = 0; i < 50; i++) assert.equal(elegirVariante(tres, 'studio-1'), primera);
  assert.ok(tres.includes(primera));
});

test('sin semilla, o con una sola variante, sale siempre la primera', () => {
  assert.equal(elegirVariante(['/a.webp', '/b.webp'], null), '/a.webp');
  assert.equal(elegirVariante(['/solo.webp'], 'studio-1'), '/solo.webp');
});

test('todas las rutas por defecto apuntan a public/por-defecto', () => {
  // Protege el renombrado a ciegas de la carpeta: si alguien la mueve, esto
  // cae aquí y no en el portal de una socia.
  const todas = [...Object.values(IMAGENES_POR_DEFECTO).flat(), ...Object.values(IMAGENES_CLASE)];
  for (const ruta of todas) {
    assert.match(ruta, /^\/por-defecto\/[a-z-]+\.webp$/, ruta);
  }
});
