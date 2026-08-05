import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTES_PORTAL, DEFAULT_VARIANTES, resolveVariantes, type EjeVariante } from './theme-variantes.ts';

// El contrato del que cuelga todo: si el primer valor de un eje dejara de ser
// el aspecto de HOY, un estudio sin tema (o con classic/geometric/editorial)
// cambiaría de aspecto sin que nadie lo pida. Es la garantía de no-op.
test('el PRIMER valor de cada eje es el aspecto de siempre, y ése es el default', () => {
  assert.equal(VARIANTES_PORTAL.cabeceraInicio[0], 'clasica');
  assert.equal(VARIANTES_PORTAL.accesosRapidos[0], 'filas');
  assert.equal(VARIANTES_PORTAL.barra[0], 'soloActiva');
  assert.equal(VARIANTES_PORTAL.retos[0], 'neutro');
  assert.equal(VARIANTES_PORTAL.bienvenida[0], 'ninguna');
  for (const eje of Object.keys(VARIANTES_PORTAL) as EjeVariante[]) {
    assert.equal(DEFAULT_VARIANTES[eje], VARIANTES_PORTAL[eje][0], `el default de "${eje}" no es su primer valor`);
  }
});

test('resolveVariantes: sin nada (tema guardado antes de esta fase) → todo al aspecto de hoy', () => {
  assert.deepEqual(resolveVariantes(undefined), DEFAULT_VARIANTES);
  assert.deepEqual(resolveVariantes(null), DEFAULT_VARIANTES);
  assert.deepEqual(resolveVariantes({}), DEFAULT_VARIANTES);
  // Basura que no es objeto tampoco puede tumbarlo.
  assert.deepEqual(resolveVariantes('rejilla'), DEFAULT_VARIANTES);
  assert.deepEqual(resolveVariantes(42), DEFAULT_VARIANTES);
});

test('resolveVariantes: siempre devuelve el objeto COMPLETO — ningún componente necesita su propio ?? ', () => {
  const r = resolveVariantes({ accesosRapidos: 'circulos' });
  for (const eje of Object.keys(VARIANTES_PORTAL) as EjeVariante[]) {
    assert.ok(r[eje] !== undefined, `falta el eje "${eje}"`);
  }
  assert.equal(r.accesosRapidos, 'circulos');
});

// Ésta es la razón de existir de resolveVariantes en vez de confiar solo en el
// zod `.strict()` del schema: un valor corrupto en un eje NO puede llevarse por
// delante los otros cuatro.
test('resolveVariantes: un valor inválido cae solo ESE eje, no arrastra a los demás', () => {
  const r = resolveVariantes({ accesosRapidos: 'rejilla', retos: 'fucsia-brillante' });
  assert.equal(r.accesosRapidos, 'rejilla');
  assert.equal(r.retos, 'neutro');
});

test('resolveVariantes: una clave desconocida se ignora y el resto se conserva', () => {
  const r = resolveVariantes({ accesosRapidos: 'circulos', ejeDelFuturo: 'loQueSea' });
  assert.equal(r.accesosRapidos, 'circulos');
  assert.deepEqual(
    { ...r, accesosRapidos: 'filas' },
    DEFAULT_VARIANTES,
    'una clave desconocida no debe cambiar ningún otro eje',
  );
});

test('resolveVariantes: un valor de OTRO eje no cuela (los enums no se mezclan)', () => {
  // 'circulos' es válido en accesosRapidos, pero no en barra.
  const r = resolveVariantes({ barra: 'circulos' });
  assert.equal(r.barra, 'soloActiva');
});

test('resolveVariantes: no muta el objeto de entrada ni DEFAULT_VARIANTES', () => {
  const entrada = { accesosRapidos: 'rejilla' as const };
  const antes = { ...DEFAULT_VARIANTES };
  resolveVariantes(entrada);
  assert.deepEqual(entrada, { accesosRapidos: 'rejilla' });
  assert.deepEqual(DEFAULT_VARIANTES, antes);
});
