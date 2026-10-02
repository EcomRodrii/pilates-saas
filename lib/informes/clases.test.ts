import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesDelTramo, puntosDeDiferencia, sesionesDelTramo } from './clases.ts';
import { clientasDelTramo, nuevasEnTramo } from './clientas.ts';
import { cuandoEmpezoCadaClienta } from './cohortes.ts';

// Octubre de 2026: Madrid en UTC+2 hasta el 25, luego UTC+1.
const OCT = { desde: '2026-10-01', hasta: '2026-10-31' };
const AHORA = new Date('2026-10-15T10:00:00Z'); // 12:00 en Madrid

const ses = (id: string, inicio: string, extra: Record<string, unknown> = {}) => ({
  id, tipoClaseId: 'reformer', instructorId: 'ins-1', inicio, aforoMaximo: 4, cancelada: false, ...extra,
});
const res = (sesionId: string, socioId: string | null, estado: string) => ({ sesionId, socioId, estado });

test('qué clases entran: días del estudio, no canceladas y ya empezadas', () => {
  const sesiones = [
    ses('madrugada-del-1', '2026-09-30T22:30:00Z'), // 00:30 del 1 de octubre en Madrid: SÍ
    ses('noche-del-30', '2026-09-30T21:30:00Z'), // 23:30 del 30 de septiembre en Madrid: NO
    ses('cancelada', '2026-10-05T08:00:00Z', { cancelada: true }),
    ses('esta-manana', '2026-10-15T07:00:00Z'),
    ses('esta-tarde', '2026-10-15T16:00:00Z'), // aún no ha empezado
  ];
  assert.deepEqual(sesionesDelTramo(sesiones, OCT, AHORA).map(s => s.id), ['madrugada-del-1', 'esta-manana']);
});

test('ocupación = vinieron + faltaron + sin pasar lista, sobre el aforo; por tipo y por franja', () => {
  const sesiones = [
    ses('m1', '2026-10-06T16:00:00Z'), // martes 18:00
    ses('m2', '2026-10-13T16:00:00Z'), // martes 18:00
    ses('j1', '2026-10-08T07:00:00Z'), // jueves 09:00
    ses('mat', '2026-10-07T08:00:00Z', { tipoClaseId: 'mat', aforoMaximo: 10 }),
  ];
  const reservas = [
    res('m1', 'a', 'ASISTIDA'), res('m1', 'b', 'NO_ASISTIO'), res('m1', 'c', 'CONFIRMADA'), res('m1', 'd', 'CANCELADA'),
    res('m2', 'a', 'ASISTIDA'), res('m2', 'e', 'LISTA_ESPERA'),
    res('j1', 'a', 'ASISTIDA'), res('j1', 'b', 'ASISTIDA'), res('j1', null, 'ASISTIDA'), res('j1', 'c', 'ASISTIDA'),
    res('mat', 'b', 'PENDIENTE_APROBACION'),
  ];
  const c = clasesDelTramo(sesiones, reservas, OCT, AHORA);
  assert.equal(c.nClases, 4);
  assert.equal(c.aforo, 4 + 4 + 4 + 10);
  assert.equal(c.ocupadas, 3 + 1 + 4);
  assert.equal(c.pct, Math.round((8 / 22) * 100));
  assert.equal(c.vinieron, 6);
  assert.equal(c.sinPasarLista, false);

  const [reformer, mat] = c.tipos;
  assert.equal(reformer.tipoClaseId, 'reformer');
  assert.equal(reformer.pct, Math.round((8 / 12) * 100));
  // Franjas en hora de Madrid, de lunes a domingo.
  assert.deepEqual(reformer.franjas.map(f => [f.texto, f.nClases, f.ocupadas, f.pct]), [['Martes 18:00', 2, 4, 50], ['Jueves 09:00', 1, 4, 100]]);
  assert.deepEqual(reformer.franjas[0].sesiones.map(s => [s.sesionId, s.ocupadas, s.vinieron]), [['m1', 3, 1], ['m2', 1, 1]]);
  assert.equal(mat.pct, 0);
});

test('la misma clase semanal no se parte en dos franjas al cambiar la hora', () => {
  const sesiones = [ses('verano', '2026-10-20T16:00:00Z'), ses('invierno', '2026-10-27T17:00:00Z')]; // 18:00 las dos
  const c = clasesDelTramo(sesiones, [], OCT, new Date('2026-11-01T00:00:00Z'));
  assert.deepEqual(c.tipos[0].franjas.map(f => f.texto), ['Martes 18:00']);
});

test('sin pasar lista: ninguna asistida pero sí reservas en clases pasadas', () => {
  const sesiones = [ses('s1', '2026-10-06T16:00:00Z')];
  assert.equal(clasesDelTramo(sesiones, [res('s1', 'a', 'CONFIRMADA')], OCT, AHORA).sinPasarLista, true);
  assert.equal(clasesDelTramo(sesiones, [res('s1', 'a', 'NO_ASISTIO')], OCT, AHORA).sinPasarLista, true);
  assert.equal(clasesDelTramo(sesiones, [], OCT, AHORA).sinPasarLista, false, 'sin reservas no hay lista que pasar');
});

test('diferencia de ocupación en puntos', () => {
  assert.equal(puntosDeDiferencia({ nClases: 1, aforo: 10, ocupadas: 7, pct: 70 }, { nClases: 1, aforo: 10, ocupadas: 5, pct: 50 }), 20);
  assert.equal(puntosDeDiferencia({ nClases: 1, aforo: 10, ocupadas: 7, pct: 70 }, { nClases: 0, aforo: 0, ocupadas: 0, pct: null }), null);
});

test('clientas: las que vinieron y las que más vienen cuentan solo lo ASISTIDO', () => {
  const sesiones = [ses('s1', '2026-10-06T16:00:00Z'), ses('s2', '2026-10-08T16:00:00Z'), ses('futura', '2026-10-20T16:00:00Z')];
  const reservas = [
    res('s1', 'ana', 'ASISTIDA'), res('s2', 'ana', 'ASISTIDA'), res('futura', 'ana', 'CONFIRMADA'),
    res('s1', 'bea', 'ASISTIDA'), res('s2', 'bea', 'NO_ASISTIO'),
    res('futura', 'carla', 'CONFIRMADA'), res('futura', 'carla', 'CONFIRMADA'), res('futura', 'carla', 'CONFIRMADA'),
    res('s1', null, 'ASISTIDA'), // plataforma: sin clienta
  ];
  const c = clientasDelTramo(sesiones, reservas, OCT, AHORA);
  assert.equal(c.vinieron, 2);
  assert.deepEqual(c.lasQueMasVienen, [{ socioId: 'ana', clases: 2 }, { socioId: 'bea', clases: 1 }]);
});

test('nuevas en el tramo: la misma regla que las cohortes', () => {
  const empezaron = cuandoEmpezoCadaClienta({
    socios: [{ id: 'a' }, { id: 'b' }, { id: 'imp', leadStage: 'ACTIVA' }, { id: 'c' }],
    suscripciones: [
      { socioId: 'a', planId: 'bono', fechaInicio: '2026-10-03' },
      { socioId: 'b', planId: 'bono', fechaInicio: '2026-09-20' },
      { socioId: 'imp', planId: 'bono', fechaInicio: '2026-10-05' }, // importada con historial
      { socioId: 'c', planId: 'prueba', fechaInicio: '2026-10-05' }, // solo prueba
    ],
    planesTarifa: [{ id: 'bono', esPrueba: false }, { id: 'prueba', esPrueba: true }],
    reservas: [], sesiones: [],
  } as Parameters<typeof cuandoEmpezoCadaClienta>[0], '2026-10-15');
  assert.equal(nuevasEnTramo(empezaron, OCT), 1);
  assert.equal(nuevasEnTramo(empezaron, { desde: '2026-09-01', hasta: '2026-09-30' }), 1);
});
