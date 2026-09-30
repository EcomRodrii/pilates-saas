import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estaArchivado, frasesImpactoArchivar, impactoDeArchivar, tiposActivos, tiposConVida, tiposParaProgramar,
} from './orden-y-archivo.ts';

// Fechas con desfase explícito: en Madrid el 1-oct-2026 es +02:00.
const AHORA = Date.parse('2026-10-01T10:00:00+02:00');
const ARCHIVADO = '2026-09-30T18:00:00+02:00';

const reformer = { id: 'tc-reformer', nombre: 'Reformer' };
const mat = { id: 'tc-mat', nombre: 'Mat', archivadoEn: null };
const circuito = { id: 'tc-circuito', nombre: 'Mat + Circuito', archivadoEn: ARCHIVADO };
const tipos = [reformer, mat, circuito];

const ses = (id: string, tipoClaseId: string, inicio: string, extra: { cancelada?: boolean; serieId?: string | null } = {}) =>
  ({ id, tipoClaseId, inicio, cancelada: false, serieId: null, ...extra });

test('estaArchivado: ausente y null son activo; con fecha, archivado', () => {
  assert.equal(estaArchivado(reformer), false);
  assert.equal(estaArchivado(mat), false);
  assert.equal(estaArchivado(circuito), true);
  assert.equal(estaArchivado(null), false);
});

test('tiposActivos y tiposParaProgramar dejan fuera los archivados', () => {
  assert.deepEqual(tiposActivos(tipos).map(t => t.id), ['tc-reformer', 'tc-mat']);
  assert.deepEqual(tiposParaProgramar(tipos).map(t => t.id), ['tc-reformer', 'tc-mat']);
});

test('tiposParaProgramar con el tipo actual: editar una clase de un tipo archivado lo sigue enseñando', () => {
  assert.deepEqual(tiposParaProgramar(tipos, 'tc-circuito').map(t => t.id), ['tc-reformer', 'tc-mat', 'tc-circuito']);
  // Un activo como «actual» no duplica nada.
  assert.deepEqual(tiposParaProgramar(tipos, 'tc-mat').map(t => t.id), ['tc-reformer', 'tc-mat']);
  assert.deepEqual(tiposParaProgramar(tipos, null).map(t => t.id), ['tc-reformer', 'tc-mat']);
});

test('tiposConVida: un archivado sale solo mientras le queden clases por dar', () => {
  const futura = ses('s1', 'tc-circuito', '2026-10-02T10:00:00+02:00');
  const pasada = ses('s2', 'tc-circuito', '2026-09-29T10:00:00+02:00');
  const cancelada = ses('s3', 'tc-circuito', '2026-10-05T10:00:00+02:00', { cancelada: true });
  assert.deepEqual(tiposConVida(tipos, [futura], AHORA).map(t => t.id), ['tc-reformer', 'tc-mat', 'tc-circuito']);
  assert.deepEqual(tiposConVida(tipos, [pasada, cancelada], AHORA).map(t => t.id), ['tc-reformer', 'tc-mat']);
  // Un activo sale siempre, tenga clases o no.
  assert.deepEqual(tiposConVida(tipos, [], AHORA).map(t => t.id), ['tc-reformer', 'tc-mat']);
});

test('tiposConVida: la clase que empieza justo ahora ya no cuenta como «por dar»', () => {
  const ahoraMismo = ses('s1', 'tc-circuito', new Date(AHORA).toISOString());
  assert.deepEqual(tiposConVida(tipos, [ahoraMismo], AHORA).map(t => t.id), ['tc-reformer', 'tc-mat']);
});

test('impactoDeArchivar cuenta clases futuras, alumnas distintas, series y la última fecha', () => {
  const sesiones = [
    ses('f1', 'tc-mat', '2026-10-02T18:00:00+02:00', { serieId: 'serie-a' }),
    ses('f2', 'tc-mat', '2026-10-09T18:00:00+02:00', { serieId: 'serie-a' }),
    ses('f3', 'tc-mat', '2026-10-20T09:00:00+02:00'),
    ses('pasada', 'tc-mat', '2026-09-25T18:00:00+02:00', { serieId: 'serie-vieja' }),
    ses('cancelada', 'tc-mat', '2026-10-30T18:00:00+02:00', { cancelada: true, serieId: 'serie-b' }),
    ses('otro', 'tc-reformer', '2026-10-02T18:00:00+02:00'),
  ];
  const reservas = [
    { sesionId: 'f1', socioId: 'a', estado: 'CONFIRMADA' },
    { sesionId: 'f2', socioId: 'a', estado: 'CONFIRMADA' }, // la misma alumna: cuenta una vez
    { sesionId: 'f2', socioId: 'b', estado: 'LISTA_ESPERA' },
    { sesionId: 'f3', socioId: 'c', estado: 'PENDIENTE_APROBACION' },
    { sesionId: 'f3', socioId: 'd', estado: 'CANCELADA' }, // ya no está
    { sesionId: 'pasada', socioId: 'e', estado: 'ASISTIDA' }, // historial: no cuenta
    { sesionId: 'otro', socioId: 'f', estado: 'CONFIRMADA' }, // otro tipo
  ];
  const i = impactoDeArchivar({ tipoId: 'tc-mat', tipos, sesiones, reservas, planes: [], ahora: AHORA });
  assert.equal(i.clasesFuturas, 3);
  assert.equal(i.ultimaClase, '2026-10-20T09:00:00+02:00');
  assert.equal(i.alumnas, 3);
  assert.equal(i.series, 1);
  assert.deepEqual(i.planesSoloDeEste, []);
});

test('impactoDeArchivar: un plan solo sirve «solo para este» si no cubre ningún otro activo', () => {
  const planes = [
    { nombre: 'Bono Mat', activo: true, tiposClaseIds: ['tc-mat'] },
    { nombre: 'Mat y Circuito', activo: true, tiposClaseIds: ['tc-mat', 'tc-circuito'] }, // el otro ya está archivado
    { nombre: 'Mat y Reformer', activo: true, tiposClaseIds: ['tc-mat', 'tc-reformer'] }, // sigue sirviendo
    { nombre: 'Todas', activo: true, tiposClaseIds: [] }, // para todas: sigue sirviendo
    { nombre: 'Bono Mat viejo', activo: false, tiposClaseIds: ['tc-mat'] }, // no está a la venta
    { nombre: 'Bono Reformer', activo: true, tiposClaseIds: ['tc-reformer'] }, // no es de este tipo
  ];
  const i = impactoDeArchivar({ tipoId: 'tc-mat', tipos, sesiones: [], reservas: [], planes, ahora: AHORA });
  assert.deepEqual(i.planesSoloDeEste, ['Bono Mat', 'Mat y Circuito']);
});

test('frasesImpactoArchivar: sin clases lo dice, y no inventa series ni planes', () => {
  const f = frasesImpactoArchivar({ clasesFuturas: 0, ultimaClase: null, alumnas: 0, series: 0, planesSoloDeEste: [] });
  assert.deepEqual(f, ['No tiene clases programadas.']);
});

test('frasesImpactoArchivar: con cifras, fecha en hora de Madrid y en singular/plural', () => {
  const f = frasesImpactoArchivar({
    clasesFuturas: 3, ultimaClase: '2026-10-20T23:30:00+02:00', alumnas: 1, series: 2, planesSoloDeEste: ['Bono Mat'],
  });
  assert.equal(f[0], 'Tiene 3 clases programadas, la última el 20 de octubre, con 1 alumna apuntada. Se quedan como están y se pueden seguir reservando.');
  assert.match(f[1], /^Sus 2 clases que se repiten dejan de renovarse/);
  assert.match(f[2], /^«Bono Mat» solo sirve para este tipo/);
  assert.match(f[2], /desactívalo en Paquetes\.$/);

  const una = frasesImpactoArchivar({ clasesFuturas: 1, ultimaClase: '2026-10-02T18:00:00+02:00', alumnas: 0, series: 1, planesSoloDeEste: ['A', 'B'] });
  assert.match(una[0], /^Tiene 1 clase programada, la última el 2 de octubre, sin alumnas apuntadas todavía\./);
  assert.match(una[1], /^Su clase que se repite deja de renovarse/);
  assert.match(una[2], /^«A» y «B» solo sirven para este tipo/);
});
