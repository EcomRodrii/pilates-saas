import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hayQuePreguntarQuien, nombreDeInstructora, quienContestado } from './quien-da-las-clases.ts';

test('con el equipo vacío y permiso para crear, se pregunta', () => {
  assert.equal(hayQuePreguntarQuien({ puedeCrear: true, sinEquipo: true, instructoraYaElegida: null }), true);
});

test('con alguien en el equipo, o sin permiso, o ya elegida, no se pregunta', () => {
  assert.equal(hayQuePreguntarQuien({ puedeCrear: true, sinEquipo: false, instructoraYaElegida: null }), false);
  assert.equal(hayQuePreguntarQuien({ puedeCrear: false, sinEquipo: true, instructoraYaElegida: null }), false);
  assert.equal(hayQuePreguntarQuien({ puedeCrear: true, sinEquipo: true, instructoraYaElegida: 'Marta' }), false);
});

test('el nombre se limpia y se acota', () => {
  assert.equal(nombreDeInstructora('  Marta   López '), 'Marta López');
  assert.equal(nombreDeInstructora('M'), null);
  assert.equal(nombreDeInstructora('   '), null);
  assert.equal(nombreDeInstructora('x'.repeat(81)), null);
  assert.equal(nombreDeInstructora('x'.repeat(80)), 'x'.repeat(80));
});

test('«otra persona» no vale sin un nombre; «yo» y «luego» sí', () => {
  assert.equal(quienContestado(null, 'Marta'), false);
  assert.equal(quienContestado('otra', ''), false);
  assert.equal(quienContestado('otra', 'Marta'), true);
  assert.equal(quienContestado('yo', ''), true);
  assert.equal(quienContestado('luego', ''), true);
});
