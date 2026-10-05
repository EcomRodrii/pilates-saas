import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarParaFiltro, palabrasNoPermitidas, pasaElFiltro } from './filtro.ts';
import { VERSION_NORMAS, versionValida } from './normas.ts';

test('para los insultos, el odio y lo sexual explícito', () => {
  for (const t of ['eres una zorra', 'Gilipollas', 'menudo IMBÉCIL', 'maricón', 'vamos a follar', 'you bitch']) {
    assert.equal(pasaElFiltro(t), false, t);
  }
});

test('no se lo saltan los disfraces de siempre', () => {
  for (const t of ['put4', 'p.u.t.a', 'p u t a', 'puuuuta', 'PÚTA', 'g1lip0llas', 'z0rr4']) {
    assert.equal(pasaElFiltro(t), false, `${t} → ${normalizarParaFiltro(t)}`);
  }
});

test('las amenazas, como frase', () => {
  assert.deepEqual(palabrasNoPermitidas('Como vuelvas te voy a matar'), ['te voy a matar']);
  assert.equal(pasaElFiltro('Ojalá te mueras'), false);
  // «matar» a secas no: «matar el tiempo».
  assert.equal(pasaElFiltro('Vengo a matar el tiempo antes de clase'), true);
});

test('lo normal de un estudio pasa: palabras que contienen otras, tacos de exclamación y frases inocentes', () => {
  for (const t of [
    '¿Queda sitio en la de mañana a las 10?',
    'La clase va retrasada, ¿la movemos?',
    'Hoy traigo la computadora para enseñarte el vídeo',
    'Fue una disputa tonta, ya está arreglado',
    'Joder, qué agujetas tengo',
    'Coño, se me ha olvidado la toalla',
    'Qué idiota soy, me equivoqué de día',
    'Mi perra se ha puesto mala, no puedo ir',
    'Llamaré mañana, perdona',
    'A las 5 y 4 minutos llego',
    '',
  ]) {
    assert.equal(pasaElFiltro(t), true, `${t} → ${normalizarParaFiltro(t)}`);
  }
});

test('las normas se aceptan por versión', () => {
  assert.equal(versionValida(VERSION_NORMAS), true);
  assert.equal(versionValida('2020-01-01'), false);
  assert.equal(versionValida(undefined), false);
});
