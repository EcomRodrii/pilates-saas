import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDeFicha, porQueSinCubrir, rangoDeFechas, type DatosEstadoFicha } from './estado-ficha.ts';

// Jueves 1 de octubre de 2026, 10:40 en Madrid.
const AHORA = new Date('2026-10-01T08:40:00.000Z');
const base = (p: Partial<DatosEstadoFicha> = {}): DatosEstadoFicha => ({
  estado: 'PROGRAMADA', inicio: '2026-10-01T16:00:00.000Z', fin: '2026-10-01T16:50:00.000Z',
  marca: { aviso: null, extra: null }, apuntadas: 5, asistidas: 0, sinMarcar: 5, aforo: 6, enEspera: 0, ...p,
});

test('en curso: cuánto le queda y cuántas han venido', () => {
  const e = estadoDeFicha(base({ estado: 'EN_CURSO', inicio: '2026-10-01T08:30:00.000Z', fin: '2026-10-01T09:20:00.000Z', apuntadas: 6, asistidas: 4 }), AHORA);
  assert.deepEqual(e.pastilla, { texto: 'En curso · acaba en 40 min', tono: 'exito', punto: true });
  assert.equal(e.cifra, '4 de 6 han venido');
});

test('terminada: si falta pasar lista se dice cuántas quedan por marcar', () => {
  assert.equal(estadoDeFicha(base({ estado: 'SIN_PASAR_LISTA', sinMarcar: 2 }), AHORA).pastilla?.texto, 'Terminada · falta pasar lista');
  assert.equal(estadoDeFicha(base({ estado: 'SIN_PASAR_LISTA', sinMarcar: 2 }), AHORA).cifra, '2 sin marcar');
  assert.equal(estadoDeFicha(base({ estado: 'FINALIZADA', asistidas: 5 }), AHORA).cifra, '5 de 5 vinieron');
  assert.equal(estadoDeFicha(base({ estado: 'FINALIZADA', apuntadas: 0 }), AHORA).cifra, 'Sin clientas');
});

test('una clase de más tarde no lleva pastilla; la que empieza pronto, sí', () => {
  assert.equal(estadoDeFicha(base(), AHORA).pastilla, null);
  assert.equal(estadoDeFicha(base(), AHORA).cifra, '5 de 6 plazas');
  const pronto = base({ inicio: '2026-10-01T09:00:00.000Z', fin: '2026-10-01T09:50:00.000Z', enEspera: 2 });
  assert.equal(estadoDeFicha(pronto, AHORA).pastilla?.texto, 'Empieza en 20 min');
  assert.equal(estadoDeFicha(pronto, AHORA).cifra, '5 de 6 plazas · 2 en espera');
});

test('sin cubrir dice en qué punto está, con el texto de su marca', () => {
  const e = estadoDeFicha(base({ estado: 'SIN_INSTRUCTORA', marca: { aviso: { tipo: 'buscando', texto: 'Buscando sustituta', corto: 'Buscando' }, extra: null } }), AHORA);
  assert.deepEqual(e.pastilla, { texto: 'Buscando sustituta', tono: 'peligro' });
});

test('por qué está sin cubrir, en una frase', () => {
  const sin = { instructora: 'Lucía Gómez', ausencia: null, instructoraInactiva: false, motivoBaja: null, sustitucionAbierta: false };
  assert.equal(porQueSinCubrir({ ...sin, ausencia: { tipo: 'VACACIONES', desde: '2026-10-02', hasta: '2026-10-09' } }),
    'La da Lucía Gómez, que está de vacaciones del 2 al 9 de octubre.');
  assert.equal(porQueSinCubrir({ ...sin, ausencia: { tipo: 'OTRO', desde: '2026-10-02', hasta: '2026-10-02' } }),
    'La da Lucía Gómez, que no está disponible ese día.');
  assert.equal(porQueSinCubrir({ ...sin, sustitucionAbierta: true, motivoBaja: 'enferma' }), 'Lucía Gómez no puede darla: enferma.');
  assert.equal(porQueSinCubrir({ ...sin, instructoraInactiva: true }), 'Quien la daba ya no está en el equipo.');
  assert.equal(porQueSinCubrir(sin), null);
});

test('los rangos de fechas se leen como se dicen', () => {
  assert.equal(rangoDeFechas('2026-10-02', '2026-10-09'), 'del 2 al 9 de octubre');
  assert.equal(rangoDeFechas('2026-09-28', '2026-10-03'), 'del 28 de septiembre al 3 de octubre');
  assert.equal(rangoDeFechas('2026-10-02', '2026-10-02'), 'el 2 de octubre');
});
