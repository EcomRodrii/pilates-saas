import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlServida, srcSetServido, srcSetPorAncho, esTransformable } from './imagen-servida.ts';

const SUPA = 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/avatars/clase-7';

test('reescribe una URL de Storage al endpoint que redimensiona', () => {
  const u = urlServida(SUPA, 420);
  assert.ok(u.includes('/storage/v1/render/image/public/avatars/clase-7'));
  assert.ok(u.includes('width=420'));
  assert.ok(u.includes('quality=70'));
});

test('deja intacta la foto por defecto: es un estático de Next, no Storage', () => {
  // Intentar transformarla devolvería un 404 y la alumna vería un hueco.
  assert.equal(esTransformable('/por-defecto/estudio-hero.webp'), false);
  assert.equal(urlServida('/por-defecto/estudio-hero.webp', 420), '/por-defecto/estudio-hero.webp');
  assert.equal(srcSetServido('/por-defecto/estudio-hero.webp', 420), null);
});

test('deja intacta una URL ajena que haya pegado el estudio', () => {
  assert.equal(urlServida('https://ejemplo.com/foto.jpg', 420), 'https://ejemplo.com/foto.jpg');
});

test('CONSERVA el rompe-cachés que ya trajera la URL', () => {
  // `subirFotoClase` sobrescribe siempre el mismo path y distingue versiones
  // con `?v=`. Perderlo deja a la propietaria cambiando una foto que nadie
  // vuelve a ver.
  const u = urlServida(`${SUPA}?v=1736500000000`, 420);
  assert.ok(u.includes('v=1736500000000'), u);
  assert.ok(u.includes('width=420'), u);
});

test('no pide más ancho del que existe: ampliar pesa MÁS que el original', () => {
  assert.ok(urlServida(SUPA, 9000).includes('width=1600'));
});

test('el srcset ofrece densidades, no anchos', () => {
  const s = srcSetServido(SUPA, 200)!;
  assert.ok(s.includes('width=200') && s.includes(' 1x'));
  assert.ok(s.includes('width=400') && s.includes(' 2x'));
  assert.ok(s.includes('width=600') && s.includes(' 3x'));
});

test('sin opciones reales, no hay srcset', () => {
  // A 1600 ya está el tope: 1x, 2x y 3x serían la MISMA imagen, y ofrecer tres
  // candidatas idénticas solo engorda el HTML y confunde al navegador.
  assert.equal(srcSetServido(SUPA, 1600), null);
});

test('un ancho absurdo no genera una URL inválida', () => {
  assert.ok(urlServida(SUPA, 0).includes('width=16'));
  assert.ok(urlServida(SUPA, -5).includes('width=16'));
  assert.ok(urlServida(SUPA, 33.4).includes('width=33'));
});

test('el srcset por ANCHO ofrece la escalera completa', () => {
  const s = srcSetPorAncho(SUPA)!;
  assert.ok(s.includes('width=390') && s.includes(' 390w'));
  assert.ok(s.includes('width=1600') && s.includes(' 1600w'));
});

test('una foto por defecto tampoco entra en la escalera', () => {
  assert.equal(srcSetPorAncho('/por-defecto/estudio-hero.webp'), null);
});
