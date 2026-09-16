import test from 'node:test';
import assert from 'node:assert/strict';
import { colorMarcaDelEstudio, colorSecundarioDelEstudio } from './color-marca.ts';
import { THEME_PRESETS } from '../theme-presets.ts';

const ORIGINAL = THEME_PRESETS.find(p => p.id === 'original')!;
/** El que escribe el alta y no elige nadie. Medido: 10 de 11 estudios en prod. */
const INDIGO_DEL_ALTA = '#4F46E5';

test('manda el color que la propietaria eligió en Marca', () => {
  assert.equal(colorMarcaDelEstudio('#C2185B', ORIGINAL.primary, INDIGO_DEL_ALTA), '#C2185B');
});

test('sin tema publicado manda el preset, que es lo que ve en su panel', () => {
  // El caso de 8 de los 11 estudios de producción: su panel y su app se ven en
  // oliva y sus correos salían en índigo.
  assert.equal(colorMarcaDelEstudio(null, ORIGINAL.primary, INDIGO_DEL_ALTA), ORIGINAL.primary);
  assert.notEqual(colorMarcaDelEstudio(null, ORIGINAL.primary, INDIGO_DEL_ALTA), INDIGO_DEL_ALTA);
});

test('la columna vieja es el último recurso, no el primero', () => {
  // Si volviera a mandar, volvería el índigo a diez estudios.
  assert.equal(colorMarcaDelEstudio(null, null, '#7C9A82'), '#7C9A82');
});

test('un hex a medio escribir nunca sale del resolver', () => {
  // Un valor roto en un `style` de correo deja el fondo transparente, y no hay
  // forma de verlo hasta que llega a una clienta.
  for (const malo of ['', '  ', 'rosa', '#12345', '#GGGGGG', 42, {}, null, undefined]) {
    assert.equal(colorMarcaDelEstudio(malo, malo, malo), null, `«${String(malo)}» no debería pasar`);
  }
  // Y un valor roto en un escalón no tapa al siguiente: se sigue bajando.
  assert.equal(colorMarcaDelEstudio('rosa', ORIGINAL.primary, INDIGO_DEL_ALTA), ORIGINAL.primary);
  assert.equal(colorMarcaDelEstudio('rosa', 'medio', '#7C9A82'), '#7C9A82');
});

test('el secundario sigue el mismo orden y no tiene columna donde caer', () => {
  assert.equal(colorSecundarioDelEstudio('#B9714A', ORIGINAL.secondary), '#B9714A');
  assert.equal(colorSecundarioDelEstudio(null, ORIGINAL.secondary), ORIGINAL.secondary);
  assert.equal(colorSecundarioDelEstudio(null, null), null);
  assert.equal(colorSecundarioDelEstudio('medio', 'roto'), null);
});
