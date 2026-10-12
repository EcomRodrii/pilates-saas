import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asistenciasRecientes, constanciaDe, frecuenciaDe, nuncaCompro, textoConstancia, textoFrecuencia, tramoSaldo, usoDe,
  variosPlanes,
} from './uso.ts';

// Jueves 12-nov-2026, 18:00 en Madrid (17:00Z): semana del lunes 9.
const AHORA = new Date('2026-11-12T17:00:00Z');
/** Una clase a las 10:00 de Madrid (09:00Z en invierno) de ese día. */
const clase = (ymd: string) => `${ymd}T09:00:00.000Z`;
/** Un día de la semana `atras` semanas antes de la del 9-nov (0 = esta). */
const dia = (atras: number, dow = 2) => new Date(Date.UTC(2026, 10, 9 + dow - 7 * atras, 12)).toISOString().slice(0, 10);

test('frecuencia: alta, media y baja', () => {
  const dos = Array.from({ length: 6 }, (_, i) => [clase(dia(i + 1, 0)), clase(dia(i + 1, 2))]).flat();
  assert.equal(frecuenciaDe(usoDe(dos, AHORA)), 'ALTA');
  const una = Array.from({ length: 6 }, (_, i) => clase(dia(i + 1)));
  assert.equal(frecuenciaDe(usoDe(una, AHORA)), 'MEDIA');
  const cadaTres = [clase(dia(1)), clase(dia(4)), clase(dia(7))];
  assert.equal(frecuenciaDe(usoDe(cadaTres, AHORA)), 'BAJA');
  assert.equal(frecuenciaDe(usoDe([], AHORA)), null);
  assert.equal(frecuenciaDe(undefined), null);
});

test('los planes que más se venden caen donde toca: clase fija semanal con un festivo y bono de 8 al mes', () => {
  // 1 por semana durante 12 semanas completas, faltando una (festivo): 11/12 = 0,92.
  const fija = Array.from({ length: 12 }, (_, i) => i + 1).filter(s => s !== 5).map(s => clase(dia(s)));
  const uFija = usoDe(fija, AHORA);
  assert.equal(uFija.media, 0.9);
  assert.equal(frecuenciaDe(uFija), 'MEDIA');
  // 8 al mes: 2 por semana salvo una de cada cuatro con una sola (22/12 = 1,83).
  const ocho = Array.from({ length: 12 }, (_, i) => i + 1).flatMap(s => s % 4 === 0 ? [clase(dia(s))] : [clase(dia(s, 0)), clase(dia(s, 2))]);
  assert.equal(frecuenciaDe(usoDe(ocho, AHORA)), 'ALTA');
});

test('la semana en curso sin clases todavía no baja a nadie (un lunes por la mañana)', () => {
  // Lunes 9-nov a las 08:00 de Madrid: dos clases cada semana de las seis anteriores.
  const lunes = new Date('2026-11-09T07:00:00Z');
  const dos = Array.from({ length: 6 }, (_, i) => [clase(dia(i + 1, 0)), clase(dia(i + 1, 2))]).flat();
  const u = usoDe(dos, lunes);
  assert.equal(u.media, 2);
  assert.equal(frecuenciaDe(u), 'ALTA');
  assert.equal(constanciaDe(u), 'TODAS');
});

test('lunes a las 00:30 de Madrid (domingo en UTC) ya es la semana nueva', () => {
  const lunes0030 = new Date('2026-11-08T23:30:00Z');
  // Una clase el domingo 8 a las 20:00 de Madrid cuenta en la semana ANTERIOR.
  const u = usoDe([clase(dia(1, 6)).replace('T09:00', 'T19:00')], lunes0030);
  assert.equal(u.semanasSinVenir, 1, 'la semana en curso (vacía) y nada más');
});

test('constancia: «ha dejado de venir» (ni esta semana ni la anterior) y «todas las semanas» (al menos 4)', () => {
  const seguidas = [clase(dia(0)), clase(dia(1)), clase(dia(2)), clase(dia(3))];
  assert.equal(constanciaDe(usoDe(seguidas, AHORA)), 'TODAS');
  assert.equal(textoConstancia(usoDe(seguidas, AHORA)), 'Todas las semanas');
  const huecos = [clase(dia(0)), clase(dia(2)), clase(dia(3))];
  assert.equal(constanciaDe(usoDe(huecos, AHORA)), null, 'con huecos: en ninguna');
  const recien = [clase(dia(0)), clase(dia(1))];
  assert.equal(constanciaDe(usoDe(recien, AHORA)), null, 'empezó hace dos semanas: aún no «viene siempre»');
  const paro = [clase(dia(2)), clase(dia(3)), clase(dia(4))];
  assert.equal(constanciaDe(usoDe(paro, AHORA)), 'SIN_VENIR');
  assert.equal(textoConstancia(usoDe(paro, AHORA)), 'Lleva 2 semanas sin venir');
  assert.equal(constanciaDe(usoDe([], AHORA)), null, 'no ha venido nunca: no «ha dejado de venir»');
});

test('en el borde del cambio de hora: domingo 25-oct a las 23:30 y lunes 26 a las 00:30 de Madrid', () => {
  // Ya en horario de invierno (UTC+1): 23:30 del domingo es 22:30Z; 00:30 del lunes, 23:30Z del domingo.
  const ahora = new Date('2026-10-28T12:00:00Z');
  const domingo = usoDe(['2026-10-25T22:30:00.000Z'], ahora);
  assert.equal(domingo.semanasSinVenir, 1, 'la del domingo es de la semana del 19: esta (del 26) va vacía');
  const lunes = usoDe(['2026-10-25T23:30:00.000Z'], ahora);
  assert.equal(lunes.semanasSinVenir, 0, 'la de las 00:30 del lunes ya es de esta semana');
});

test('el cambio de hora de octubre no mueve ninguna clase de semana', () => {
  const tras = new Date('2026-10-28T12:00:00Z'); // miércoles después del 25-oct
  const u = usoDe(['2026-10-24T08:00:00.000Z', '2026-10-26T09:00:00.000Z'], tras);
  // Sábado 24 (semana del 19) y lunes 26 (semana del 26): dos semanas seguidas.
  assert.equal(u.todasLasSemanas, true);
  assert.equal(u.semanasSinVenir, 0);
});

test('sesiones que le quedan: por tramos, y sin saldo (cuota o ilimitado) en ninguno', () => {
  assert.equal(tramoSaldo(0), 'UNA_O_NINGUNA');
  assert.equal(tramoSaldo(1), 'UNA_O_NINGUNA');
  assert.equal(tramoSaldo(3), 'DOS_O_TRES');
  assert.equal(tramoSaldo(4), 'CUATRO_O_MAS');
  assert.equal(tramoSaldo(undefined), null);
});

test('nunca compró: la prueba no cuenta; una clase suelta o un plan borrado, sí; importada con historial, tampoco', () => {
  const esPrueba = (id: string) => id === 'plan-prueba';
  assert.equal(nuncaCompro([], esPrueba, false), true);
  assert.equal(nuncaCompro([{ planId: 'plan-prueba' }], esPrueba, false), true);
  assert.equal(nuncaCompro([{ planId: 'plan-suelta' }], esPrueba, false), false);
  assert.equal(nuncaCompro([{ planId: 'plan-borrado' }], esPrueba, false), false);
  assert.equal(nuncaCompro([], esPrueba, true), false);
});

test('más de un plan: la misma cuenta que el «+N» (dos planes distintos)', () => {
  assert.equal(variosPlanes(new Set(['cuota', 'bono'])), true);
  assert.equal(variosPlanes(new Set(['bono'])), false);
  assert.equal(variosPlanes(undefined), false);
});

test('las asistencias se recortan a las últimas semanas sin convertir fechas viejas, y solo ASISTIDA', () => {
  const inicios: Record<string, string> = { a: clase(dia(1)), b: clase(dia(30)), c: clase(dia(2)) };
  const { porSocia, antes } = asistenciasRecientes([
    { socioId: 'x', sesionId: 'a', estado: 'ASISTIDA' },
    { socioId: 'x', sesionId: 'b', estado: 'ASISTIDA' },
    { socioId: 'x', sesionId: 'c', estado: 'CONFIRMADA' },
    { socioId: 'y', sesionId: 'zzz', estado: 'ASISTIDA' },
  ], id => inicios[id], AHORA);
  assert.deepEqual(porSocia.get('x'), [inicios.a]);
  assert.equal(porSocia.has('y'), false);
  assert.deepEqual([...antes], ['x'], 'la de hace 30 semanas solo deja dicho que ya venía');
});

test('quien ya venía de antes cuenta desde el principio: faltar las primeras semanas no es «todas las semanas»', () => {
  // Las seis últimas semanas completas seguidas, y nada en las cinco anteriores.
  const seis = Array.from({ length: 6 }, (_, i) => clase(dia(i + 1)));
  assert.equal(constanciaDe(usoDe(seis, AHORA)), 'TODAS', 'recién llegada: cuenta desde su primera clase');
  const veterana = usoDe(seis, AHORA, true);
  assert.equal(veterana.todasLasSemanas, false);
  assert.equal(constanciaDe(veterana), null);
  assert.equal(veterana.media, 0.5, '6 clases en 11 semanas completas');
  // Lo mismo si la de antes cae en la semana justo anterior a las que se miran.
  assert.equal(usoDe([...seis, clase(dia(12))], AHORA).todasLasSemanas, false);
});

test('con menos de 4 semanas contadas no hay frecuencia ni «todas las semanas»', () => {
  const recien = [clase(dia(1, 0)), clase(dia(1, 2)), clase(dia(2, 0)), clase(dia(2, 2))];
  const u = usoDe(recien, AHORA);
  assert.equal(u.media, 2);
  assert.equal(frecuenciaDe(u), null);
  assert.equal(constanciaDe(u), null);
});

test('textos de la columna', () => {
  assert.equal(textoFrecuencia({ media: 1.5, semanasSinVenir: 0, todasLasSemanas: true, semanasContadas: 6 }), '1,5');
  assert.equal(textoFrecuencia(undefined), '—');
});
