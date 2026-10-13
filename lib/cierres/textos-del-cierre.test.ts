import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consecuenciasDelCierre, textoTrasCerrar } from './dias-de-cierre.ts';

test('«Cerrar el centro» dice lo mismo que antes, letra a letra', () => {
  assert.equal(
    consecuenciasDelCierre({ cuando: 'Del 3 al 9 de agosto', dias: 7, devuelveSesion: true, notaSolapes: true }),
    'Del 3 al 9 de agosto nadie podrá reservar. Se cancelan sus clases avisando a quien tenía reserva, que recupera la sesión del bono, '
      + 'y los bonos y recuperaciones de todas tus alumnas duran 7 días más. Si alguno de esos días ya lo habías cerrado antes, no se suma dos veces.',
  );
  assert.match(consecuenciasDelCierre({ cuando: 'Del 3', dias: 1, devuelveSesion: false }), /, sin devolverle la sesión, .* duran 1 día más\.$/);
});

test('un festivo: con sus clases contadas y sin la nota de solapes', () => {
  assert.equal(
    consecuenciasDelCierre({ cuando: 'El martes 8 de diciembre', dias: 1, devuelveSesion: true, clases: 6 }),
    'El martes 8 de diciembre nadie podrá reservar. Se cancelan sus 6 clases avisando a quien tenía reserva, que recupera la sesión del bono, '
      + 'y los bonos y recuperaciones de todas tus alumnas duran 1 día más.',
  );
  assert.match(consecuenciasDelCierre({ cuando: 'El', dias: 1, devuelveSesion: true, clases: 1 }), /Se cancelan su clase avisando/);
});

test('tras cerrar: las cifras del servidor, y las incidencias no se esconden', () => {
  assert.equal(textoTrasCerrar({ dias: 1, clasesCanceladas: 6, bonosAmpliados: 30, diasYaProrrogados: 0, incidencias: [] }),
    '1 día cerrado · 6 clases canceladas · 30 bonos prorrogados');
  assert.equal(textoTrasCerrar({ dias: 2, clasesCanceladas: 0, incidencias: ['Clase x: fallo'] }), '2 días cerrados · con avisos: Clase x: fallo');
  assert.match(textoTrasCerrar({ dias: 1, diasYaProrrogados: 1 }), /los bonos ya tenían esos días de más/);
});
