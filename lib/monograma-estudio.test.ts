import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicialDe, coloresMonograma, tamanoValido, urlMonograma, COLOR_MONOGRAMA_POR_DEFECTO } from './monograma-estudio.ts';

test('la inicial se pone en mayúscula', () => {
  assert.equal(inicialDe('estudio aurora'), 'E');
  assert.equal(inicialDe('Pilates Boutique'), 'P');
});

test('sin nombre, o solo espacios, sale un interrogante — nunca undefined en el PNG', () => {
  for (const nada of [null, undefined, '', '   ']) assert.equal(inicialDe(nada), '?');
});

test('un nombre que empieza por emoji no se corte a la mitad', () => {
  // `nombre[0]` de un emoji fuera del plano básico da la mitad del carácter
  // (un signo de interrogación en rombo). `Array.from` respeta el code point.
  assert.equal(inicialDe('🧘 Estudio Zen'), '🧘');
});

test('un color de marca válido se respeta tal cual', () => {
  assert.equal(coloresMonograma('#663399').fondo, '#663399');
});

test('un color inválido cae al oliva de marca, no a un icono roto', () => {
  for (const malo of [null, undefined, '', 'no-es-un-color', 'rgb(1,2,3)']) {
    assert.equal(coloresMonograma(malo).fondo, COLOR_MONOGRAMA_POR_DEFECTO);
  }
});

test('el texto es el que más contraste hace sobre el fondo', () => {
  assert.equal(coloresMonograma('#FFFFFF').texto, '#131313'); // fondo claro → texto oscuro
  assert.equal(coloresMonograma('#131313').texto, '#FFFFFF'); // fondo oscuro → texto claro
});

test('solo 192 y 512 son tamaños válidos; cualquier otra cosa cae a 512', () => {
  assert.equal(tamanoValido('192'), 192);
  assert.equal(tamanoValido('512'), 512);
  for (const raro of ['1024', '0', '-1', 'nan', null, '']) assert.equal(tamanoValido(raro), 512);
});

test('la URL cambia si cambia el color: cachear por URL no deja iconos viejos', () => {
  const a = urlMonograma('Estudio Aurora', '#663399', 192);
  const b = urlMonograma('Estudio Aurora', '#B76E79', 192);
  assert.notEqual(a, b);
  assert.match(a, /inicial=E/);
  assert.match(a, /color=%23663399/);
  assert.match(a, /size=192/);
});
