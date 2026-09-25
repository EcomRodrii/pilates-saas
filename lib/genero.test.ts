import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ETIQUETA_GENERO, GENEROS, esGenero, etiquetaFija, generoDe, mayuscula, trato } from './genero.ts';

test('sin indicar se habla en femenino, como siempre: activar esto no cambia ni una palabra', () => {
  for (const sinDato of [null, undefined] as const) {
    assert.equal(etiquetaFija(sinDato), 'Clienta fija');
    assert.equal(trato(sinDato).clienta, 'clienta');
    assert.equal(trato(sinDato).alumna, 'alumna');
  }
  assert.equal(etiquetaFija('MUJER'), 'Clienta fija');
});

test('un hombre: cliente fijo, alumno, socio', () => {
  assert.equal(etiquetaFija('HOMBRE'), 'Cliente fijo');
  const t = trato('HOMBRE');
  assert.deepEqual([t.clienta, t.alumna, t.socia, t.fija], ['cliente', 'alumno', 'socio', 'fijo']);
});

test('los determinantes cambian con el género, y sin «a el» ni «de el»', () => {
  const f = trato('MUJER');
  const m = trato('HOMBRE');
  assert.equal(`${f.esta} ${f.clienta}`, 'esta clienta');
  assert.equal(`${m.esta} ${m.clienta}`, 'este cliente');
  assert.equal(`${f.alA} ${f.clienta}`, 'a la clienta');
  assert.equal(`${m.alA} ${m.clienta}`, 'al cliente');
  assert.equal(`${f.deLa} ${f.clienta}`, 'de la clienta');
  assert.equal(`${m.deLa} ${m.clienta}`, 'del cliente');
  assert.equal(`${mayuscula(m.la)} ${m.clienta} no tiene email`, 'El cliente no tiene email');
  assert.equal(`${f.una} ${f.clienta}`, 'una clienta');
  assert.equal(`${m.una} ${m.clienta}`, 'un cliente');
  assert.equal(`${mayuscula(f.clienta)} actualizad${f.fin}`, 'Clienta actualizada');
  assert.equal(`${mayuscula(m.clienta)} actualizad${m.fin}`, 'Cliente actualizado');
});

test('lo que llega de la base se reduce a lo que se sabe: cualquier otra cosa es «sin indicar»', () => {
  assert.equal(generoDe('MUJER'), 'MUJER');
  assert.equal(generoDe('HOMBRE'), 'HOMBRE');
  for (const raro of [null, undefined, '', 'mujer', 'M', 'otro', 3, {}]) assert.equal(generoDe(raro), null);
  assert.equal(esGenero('HOMBRE'), true);
  assert.equal(esGenero('hombre'), false);
});

test('cada valor tiene su etiqueta para el selector', () => {
  assert.deepEqual(GENEROS.map(g => ETIQUETA_GENERO[g]), ['Mujer', 'Hombre']);
});
