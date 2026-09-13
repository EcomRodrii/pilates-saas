import { test } from 'node:test';
import assert from 'node:assert/strict';

import { avisoPorAlumna } from './avisos-serie.ts';

test('una alumna en las 4 clases de la serie recibe UN aviso, en la primera', () => {
  const r = avisoPorAlumna(
    ['s1', 's2', 's3', 's4'],
    new Map([['s1', ['laura']], ['s2', ['laura']], ['s3', ['laura']], ['s4', ['laura']]]),
  );
  assert.equal(r.size, 1);
  assert.deepEqual(r.get('laura'), { sesionId: 's1', masClases: true });
});

test('quien solo está en una clase posterior se avisa en esa, sin «y las siguientes»', () => {
  const r = avisoPorAlumna(
    ['s1', 's2', 's3'],
    new Map([['s1', ['laura']], ['s3', ['marta']]]),
  );
  assert.deepEqual(r.get('laura'), { sesionId: 's1', masClases: false });
  assert.deepEqual(r.get('marta'), { sesionId: 's3', masClases: false });
});

test('el orden manda: la primera clase suya es la más próxima, no la primera del mapa', () => {
  const r = avisoPorAlumna(
    ['s2', 's1'],
    new Map([['s1', ['elena']], ['s2', ['elena']]]),
  );
  assert.deepEqual(r.get('elena'), { sesionId: 's2', masClases: true });
});

test('una clase sin apuntadas no avisa a nadie', () => {
  assert.equal(avisoPorAlumna(['s1'], new Map()).size, 0);
});

test('la misma alumna repetida en una clase no cuenta como otra clase', () => {
  const r = avisoPorAlumna(['s1'], new Map([['s1', ['laura', 'laura']]]));
  assert.deepEqual(r.get('laura'), { sesionId: 's1', masClases: false });
});
