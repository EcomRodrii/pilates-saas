import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerVimeo, urlReproductor, formatearDuracion, parsearDuracion, validarVideo, videoDeFila } from './videos.ts';

test('el enlace de Vimeo se acepta en sus tres formas', () => {
  assert.deepEqual(extraerVimeo('123456789'), { videoId: '123456789', hash: null });
  assert.deepEqual(extraerVimeo('https://vimeo.com/123456789'), { videoId: '123456789', hash: null });
  assert.deepEqual(extraerVimeo('https://vimeo.com/123456789/abcdef1234'), { videoId: '123456789', hash: 'abcdef1234' });
  assert.deepEqual(extraerVimeo('https://player.vimeo.com/video/123456789?h=abcdef1234'), { videoId: '123456789', hash: 'abcdef1234' });
  assert.deepEqual(extraerVimeo('https://player.vimeo.com/video/123456789'), { videoId: '123456789', hash: null });
});

test('lo que no es Vimeo no se acepta (ni un dominio que solo se le parece)', () => {
  for (const t of ['', 'abc', 'https://youtube.com/watch?v=123456789', 'https://vimeo.com.evil.example/123456789', 'https://evilvimeo.com/123456789', 'javascript:alert(1)', 'https://vimeo.com/canal/abc']) {
    assert.equal(extraerVimeo(t), null, t);
  }
});

test('el reproductor lleva dnt=1 y el hash solo si el vídeo es no listado', () => {
  assert.equal(urlReproductor({ videoId: '123456789', hashPrivado: null }), 'https://player.vimeo.com/video/123456789?dnt=1&autoplay=1&title=0&byline=0&portrait=0');
  assert.match(urlReproductor({ videoId: '123456789', hashPrivado: 'abcdef1234' }), /\?h=abcdef1234&dnt=1/);
});

test('la duración se enseña como m:ss', () => {
  assert.equal(formatearDuracion(245), '4:05');
  assert.equal(formatearDuracion(59), '0:59');
  assert.equal(formatearDuracion(600), '10:00');
  assert.equal(formatearDuracion(-3), '0:00');
});

const VALIDOS = new Set(['empezar/crear-tu-cuenta']);
const BUENO = { articulo: 'empezar/crear-tu-cuenta', vimeo: 'https://vimeo.com/123456789/abcdef1234', titulo: 'Crea tu estudio', duracionSeg: 180, nivel: 'principiante', resultado: 'Tu estudio creado y listo.', publicado: true };

test('un vídeo válido produce su fila', () => {
  const r = validarVideo(BUENO, VALIDOS);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.fila, {
    articulo: 'empezar/crear-tu-cuenta', video_id: '123456789', hash_privado: 'abcdef1234', titulo: 'Crea tu estudio', duracion_seg: 180,
    nivel: 'principiante', resultado: 'Tu estudio creado y listo.', destacado: false, publicado: true,
  });
  assert.equal(videoDeFila(r.fila)?.nivel, 'principiante');
});

test('se rechaza: guía inexistente, enlace malo, título corto, duración o nivel fuera de rango', () => {
  for (const cambio of [
    { articulo: 'no/existe' }, { vimeo: 'https://youtube.com/x' }, { titulo: 'ab' }, { duracionSeg: 2 }, { duracionSeg: 99999 }, { duracionSeg: 1.5 },
    { nivel: 'experto' }, { resultado: 'sí' },
  ]) {
    assert.equal(validarVideo({ ...BUENO, ...cambio }, VALIDOS).ok, false, JSON.stringify(cambio));
  }
  assert.equal(validarVideo(null, VALIDOS).ok, false);
});

test('sin marcarlo, un vídeo nace sin publicar', () => {
  const r = validarVideo({ ...BUENO, publicado: undefined }, VALIDOS);
  assert.equal(r.ok && r.fila.publicado, false);
});

test('la duración se acepta como m:ss o en segundos', () => {
  assert.equal(parsearDuracion('4:05'), 245);
  assert.equal(parsearDuracion(' 12:00 '), 720);
  assert.equal(parsearDuracion('245'), 245);
  for (const t of ['', 'abc', '4:5', '4:75', '-3', '1:2:3', '99999']) assert.equal(parsearDuracion(t), null, t);
});
