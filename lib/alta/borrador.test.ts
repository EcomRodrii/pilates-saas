import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BORRADOR_ALTA, validarPaso, MIN_CLAVE, type BorradorAlta } from './borrador.ts';

const lleno: BorradorAlta = {
  estudio: 'Estudio Tentare',
  ciudad: 'Madrid',
  plan: 'ESTUDIO',
  persona: 'María García',
  email: 'maria@miestudio.com',
  contrasena: 'una-contrasena',
  comoNosConocio: '',
};

test('paso 1: hace falta el nombre del estudio, y nada más', () => {
  assert.equal(validarPaso(1, { ...BORRADOR_ALTA }), 'Escribe el nombre de tu estudio.');
  assert.equal(validarPaso(1, { ...BORRADOR_ALTA, estudio: 'A' }), 'Escribe el nombre de tu estudio.');
  // La ciudad es opcional a propósito: la BD no la exige y no hace falta para
  // empezar. Pedirla como obligatoria sería fricción sin contrapartida.
  assert.equal(validarPaso(1, { ...BORRADOR_ALTA, estudio: 'Estudio Tentare' }), null);
});

test('paso 1: un nombre larguísimo se rechaza aquí y no en la base', () => {
  const largo = { ...BORRADOR_ALTA, estudio: 'x'.repeat(121) };
  assert.match(validarPaso(1, largo) ?? '', /demasiado largo/);
});

test('paso 2: el plan por defecto ya es válido', () => {
  assert.equal(validarPaso(2, BORRADOR_ALTA), null);
});

test('paso 2: un plan manipulado en localStorage no pasa', () => {
  // El selector no deja elegir basura, pero el borrador se puede editar a mano
  // desde las herramientas del navegador.
  const trucado = { ...lleno, plan: 'GRATIS_PARA_SIEMPRE' as BorradorAlta['plan'] };
  assert.equal(validarPaso(2, trucado), 'Elige un plan para continuar.');
});

test('paso 3: nombre, email y contraseña', () => {
  assert.equal(validarPaso(3, lleno), null);
  assert.equal(validarPaso(3, { ...lleno, persona: '' }), 'Escribe tu nombre.');
  assert.match(validarPaso(3, { ...lleno, email: 'maria-arroba-nada' }) ?? '', /email/);
  assert.match(validarPaso(3, { ...lleno, email: '' }) ?? '', /email/);
});

test('paso 3: la contraseña corta se rechaza ANTES de llamar a Supabase', () => {
  // Sin esto, el error llega de gotrue en inglés y después de un viaje de red
  // de varios segundos (más los ~5 s del captcha, que se gasta igualmente).
  const corta = { ...lleno, contrasena: 'a'.repeat(MIN_CLAVE - 1) };
  assert.match(validarPaso(3, corta) ?? '', new RegExp(String(MIN_CLAVE)));
  assert.equal(validarPaso(3, { ...lleno, contrasena: 'a'.repeat(MIN_CLAVE) }), null);
});

test('el plan por defecto es ESTUDIO: durante la prueba se ve el producto entero', () => {
  assert.equal(BORRADOR_ALTA.plan, 'ESTUDIO');
});

test('los espacios sobrantes no cuentan como contenido', () => {
  assert.equal(validarPaso(1, { ...BORRADOR_ALTA, estudio: '   ' }), 'Escribe el nombre de tu estudio.');
  assert.equal(validarPaso(3, { ...lleno, persona: '  ' }), 'Escribe tu nombre.');
});
