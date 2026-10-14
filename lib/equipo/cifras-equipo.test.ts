import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausenciasProximas, quienMasClases, repartoSemana, sinTarifaConHoras, textoRangoAusencia, type MiembroParaCifras } from './cifras-equipo.ts';

const miembro = (m: Partial<MiembroParaCifras> & { id: string }): MiembroParaCifras => ({
  nombre: m.id, activo: true, esYo: false, semana: [0, 0, 0, 0, 0, 0, 0], horasMes: null, costeMes: null, ...m,
});

test('el reparto va de más a menos clases y deja fuera a quien no tiene ninguna', () => {
  const r = repartoSemana([
    miembro({ id: 'a', nombre: 'Lucía', semana: [1, 0, 1, 0, 0, 0, 0] }),
    miembro({ id: 'b', nombre: 'Ana', semana: [2, 1, 1, 0, 1, 0, 0] }),
    miembro({ id: 'c', nombre: 'Carla' }),
    // A igualdad de clases, por nombre.
    miembro({ id: 'd', nombre: 'Berta', semana: [0, 0, 0, 0, 0, 1, 1] }),
  ]);
  assert.deepEqual(r.map(f => [f.miembro.nombre, f.clases]), [['Ana', 5], ['Berta', 2], ['Lucía', 2]]);
});

test('quien más clases da, y cuántas más empatan con ella', () => {
  assert.equal(quienMasClases([miembro({ id: 'a' })]), null);
  assert.equal(quienMasClases([]), null);
  assert.deepEqual(
    quienMasClases([
      miembro({ id: 'a', nombre: 'Marta', semana: [3, 0, 0, 0, 0, 0, 0] }),
      miembro({ id: 'b', nombre: 'Alba', semana: [1, 1, 1, 0, 0, 0, 0] }),
      miembro({ id: 'c', nombre: 'Eva', semana: [1, 0, 0, 0, 0, 0, 0] }),
    ]),
    { nombre: 'Alba', clases: 3, empatadas: 1 },
  );
});

test('sin tarifa con horas: solo quien tiene horas este mes, está activa y no eres tú', () => {
  assert.equal(sinTarifaConHoras([
    miembro({ id: 'con-tarifa', horasMes: 10, costeMes: 200 }),
    miembro({ id: 'sin-tarifa', horasMes: 6, costeMes: null }),
    miembro({ id: 'sin-horas', horasMes: 0, costeMes: null }),
    miembro({ id: 'recepcion', horasMes: null, costeMes: null }),
    miembro({ id: 'yo', esYo: true, horasMes: 8, costeMes: null }),
    miembro({ id: 'de-baja', activo: false, horasMes: 4, costeMes: null }),
  ]), 1);
});

test('ausencias próximas: las que siguen hoy y las que empiezan dentro del plazo, por fecha', () => {
  const hoy = '2026-10-14';
  const r = ausenciasProximas([
    { id: 'pasada', instructorId: 'a', desde: '2026-10-01', hasta: '2026-10-13' },
    { id: 'acaba-hoy', instructorId: 'b', desde: '2026-10-10', hasta: '2026-10-14' },
    { id: 'lejos', instructorId: 'c', desde: '2026-11-14', hasta: '2026-11-20' },
    { id: 'en-plazo', instructorId: 'd', desde: '2026-11-13', hasta: '2026-11-20' },
    { id: 'semana-que-viene', instructorId: 'e', desde: '2026-10-20', hasta: '2026-10-24' },
  ], hoy);
  assert.deepEqual(r.map(a => a.id), ['acaba-hoy', 'semana-que-viene', 'en-plazo']);
});

test('el rango de una ausencia se dice según dónde cae respecto a hoy', () => {
  const hoy = '2026-10-14';
  assert.equal(textoRangoAusencia('2026-10-10', '2026-10-14', hoy), 'Hasta hoy');
  assert.equal(textoRangoAusencia('2026-10-14', '2026-10-14', hoy), 'Hoy');
  assert.equal(textoRangoAusencia('2026-10-10', '2026-10-20', hoy), 'Hasta el 20 oct');
  assert.equal(textoRangoAusencia('2026-10-20', '2026-10-20', hoy), 'El 20 oct');
  assert.equal(textoRangoAusencia('2026-10-20', '2026-10-24', hoy), 'Del 20 al 24 oct');
  assert.equal(textoRangoAusencia('2026-10-30', '2026-11-02', hoy), 'Del 30 oct al 2 nov');
  // Cruzando de año, con el año en la que no es la de hoy.
  assert.equal(textoRangoAusencia('2026-12-28', '2027-01-03', hoy), 'Del 28 dic al 3 ene 2027');
});
