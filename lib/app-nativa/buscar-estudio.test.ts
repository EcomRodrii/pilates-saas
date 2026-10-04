import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coincideEstudio, sinTildes, textoBusquedaEstudio, vocalesComodin } from './buscar-estudio.ts';

test('menos de 3 letras no busca: devolvería medio catálogo', () => {
  assert.equal(textoBusquedaEstudio(''), null);
  assert.equal(textoBusquedaEstudio('  ab '), null);
  assert.equal(textoBusquedaEstudio(null), null);
});

test('limpia espacios y corta a 60', () => {
  assert.equal(textoBusquedaEstudio('  zen   pilates '), 'zen pilates');
  assert.equal(textoBusquedaEstudio('x'.repeat(80))?.length, 60);
});

test('sin tildes ni mayúsculas: «nucleo» encuentra «Núcleo Reformer» y al revés', () => {
  assert.equal(coincideEstudio('Núcleo Reformer', 'nucleo'), true);
  assert.equal(coincideEstudio('Nucleo Reformer', 'NÚCLEO'), true);
  assert.equal(coincideEstudio('Pilates Ñandú', 'ñandu'), true);
  assert.equal(coincideEstudio('Núcleo Reformer', 'nuclea'), false);
});

test('las vocales pasan a comodín de una letra, y lo escapado se queda escapado', () => {
  assert.equal(vocalesComodin('nucleo'), 'n_cl__');
  assert.equal(vocalesComodin('NÚCLEO'), 'N_CL__');
  assert.equal(vocalesComodin('50\\%'), '50\\%');
  assert.equal(sinTildes('Ñandú'), 'nandu');
});
