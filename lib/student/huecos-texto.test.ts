import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuerpoSinHuecosHoy } from './huecos-texto.ts';

test('cuerpoSinHuecosHoy: cuenta las de mañana con plaza, y no promete nada más', () => {
  const hoy = '2026-10-04';
  const clases = [
    { fecha: '2026-10-05', plazasLibres: 3 },
    { fecha: '2026-10-05', plazasLibres: 0 },
    { fecha: '2026-10-05', plazasLibres: 1 },
    { fecha: '2026-10-06', plazasLibres: 9 },
    { fecha: '2026-10-04', plazasLibres: 9 },
  ];
  assert.equal(cuerpoSinHuecosHoy(clases, hoy), 'Mañana hay 2 clases con plaza libre.');
  assert.equal(cuerpoSinHuecosHoy(clases.slice(0, 2), hoy), 'Mañana hay 1 clase con plaza libre.');
  const texto = cuerpoSinHuecosHoy([{ fecha: '2026-10-05', plazasLibres: 0 }], hoy);
  assert.equal(texto, 'Mira el horario de los próximos días.');
  assert.doesNotMatch(texto, /por la mañana|suele/);
});
