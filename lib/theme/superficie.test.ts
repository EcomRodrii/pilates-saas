import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoSobre, coloresDe, conOpacidad } from './superficie.ts';

const TEMA = { ink: '#2A2E22', muted: '#7C8070' }; // Oliva

test('sin fondo propio: exactamente el comportamiento de siempre', () => {
  // La mayoría de bloques no tienen fondo. No pueden cambiar ni un píxel.
  assert.deepEqual(coloresDe(undefined, TEMA), TEMA);
  assert.deepEqual(coloresDe({}, TEMA), TEMA);
  assert.deepEqual(coloresDe({ fondo: null }, TEMA), TEMA);
});

test('regla 1 — un color de texto explícito gana siempre, aunque no contraste', () => {
  // La propietaria manda: si elige un color, no se lo corregimos por detrás.
  const r = coloresDe({ fondo: '#000000', color: '#111111' }, TEMA);
  assert.equal(r.ink, '#111111');
});

test('regla 2 — con fondo claro se CONSERVA el color del tema, no salta a negro', () => {
  // Es lo que hace que esto no se note cuando no hace falta: un fondo crema
  // sobre Oliva sigue escribiendo en su verde oscuro.
  const r = coloresDe({ fondo: '#F5F3ED' }, TEMA);
  assert.equal(r.ink, TEMA.ink);
  assert.equal(r.muted, TEMA.muted, 'y el secundario tampoco cambia');
});

test('regla 3 — con fondo oscuro el texto salta a claro en vez de quedarse ilegible', () => {
  // El bug que arregla la etapa: fondo oscuro + texto del tema oscuro.
  const r = coloresDe({ fondo: '#1E2B22' }, TEMA);
  assert.notEqual(r.ink, TEMA.ink);
  assert.equal(textoSobre('#1E2B22', TEMA.ink), r.ink);
  assert.match(r.muted, /^rgba\(/, 'el secundario se deriva del principal, no se hereda oscuro');
});

test('el secundario derivado NO arrastra el muted del tema cuando el principal ha saltado', () => {
  // Si el principal tuvo que irse a claro, un secundario oscuro heredado sería
  // AÚN menos legible que el principal — el fallo silencioso más probable.
  const r = coloresDe({ fondo: '#17201A' }, TEMA);
  assert.notEqual(r.muted, TEMA.muted);
});

test('conOpacidad convierte hex a rgba, y deja pasar lo que no entiende', () => {
  assert.equal(conOpacidad('#FF8FB1', 0.5), 'rgba(255, 143, 177, 0.5)');
  // Un color a medio teclear en el editor no puede dejar el texto sin color.
  assert.equal(conOpacidad('#FF8', 0.5), '#FF8');
  assert.equal(conOpacidad('', 0.5), '');
});

test('textoSobre es estable: aplicarlo dos veces no cambia el resultado', () => {
  // Importa porque el anidamiento lo aplica por nivel: sección → grupo →
  // tarjeta. Si no fuera estable, cada nivel iría desviando el color.
  const uno = textoSobre('#1E2B22', TEMA.ink);
  assert.equal(textoSobre('#1E2B22', uno), uno);
});
