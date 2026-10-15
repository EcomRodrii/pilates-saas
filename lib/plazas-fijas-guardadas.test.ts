import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoLimiteSemanal, enumerar, textoClasesFijasGuardadas, textoPlazaGuardada, textoYaGuardadas,
  type ClaseFijaGuardada, type PlazaFijaGuardada,
} from './plazas-fijas-guardadas.ts';

const resultado = (o: Partial<PlazaFijaGuardada> = {}): PlazaFijaGuardada => ({
  ok: true,
  plaza: {} as PlazaFijaGuardada['plaza'],
  creadas: 6, primeraFecha: '2026-08-06', hayClaseProgramada: true, canceladas: [],
  ...o,
});
const guardada = (clase: string, o: Partial<PlazaFijaGuardada> = {}): ClaseFijaGuardada => ({ clase, resultado: resultado(o) });

test('enumerar: una, dos y tres partes', () => {
  assert.equal(enumerar([]), '');
  assert.equal(enumerar(['a']), 'a');
  assert.equal(enumerar(['a', 'b']), 'a y b');
  assert.equal(enumerar(['a', 'b', 'c']), 'a, b y c');
});

test('una sola guardada dice exactamente lo de siempre', () => {
  const g = guardada('jueves 18:00');
  assert.equal(textoClasesFijasGuardadas([g], false), textoPlazaGuardada(g.resultado, false));
  assert.equal(textoClasesFijasGuardadas([g], false), 'Clase fija guardada · ya tiene reservada la clase del 6 de agosto');
  assert.equal(
    textoClasesFijasGuardadas([guardada('martes 10:00', { canceladas: ['r1', 'r2'] })], true),
    'Clase fija cambiada · ya tiene reservada la clase del 6 de agosto · 2 clases del horario anterior canceladas',
  );
});

test('dos a la vez (la cuota de «2 días a la semana»): cuántas y qué clases tiene ya reservadas, por fecha', () => {
  // En el orden de la semana (martes, jueves); las fechas, en el del calendario.
  assert.equal(
    textoClasesFijasGuardadas([
      guardada('martes 10:00', { primeraFecha: '2026-08-11' }),
      guardada('jueves 18:00', { primeraFecha: '2026-08-06' }),
    ], false),
    '2 clases fijas guardadas · ya tiene reservadas las clases del 6 de agosto y del 11 de agosto',
  );
});

test('varias: las que aún no tienen reserva se nombran una a una, con su motivo', () => {
  assert.equal(
    textoClasesFijasGuardadas([
      guardada('lunes 10:00', { primeraFecha: '2026-08-10' }),
      guardada('miércoles 18:00', { primeraFecha: null, hayClaseProgramada: true }),
      guardada('viernes 9:00', { primeraFecha: null, hayClaseProgramada: false }),
    ], false),
    '3 clases fijas guardadas · ya tiene reservada la clase del 10 de agosto'
      + ' · miércoles 18:00: la próxima clase no se le ha podido reservar (llena o cerrada)'
      + ' · viernes 9:00: se le reservará sola en cuanto haya una clase programada en ese horario',
  );
});

test('ninguna guardada: nada que decir', () => {
  assert.equal(textoClasesFijasGuardadas([], false), '');
});

test('si falla a mitad, se dice cuáles ya están guardadas', () => {
  assert.equal(textoYaGuardadas([]), null);
  assert.equal(textoYaGuardadas(['martes 10:00']), 'Ya guardada: martes 10:00.');
  assert.equal(textoYaGuardadas(['martes 10:00', 'jueves 18:00']), 'Ya guardadas: martes 10:00 y jueves 18:00.');
});

test('límite semanal: sin límite en la cuota no se avisa nunca, elija las que elija', () => {
  // Una cuota «2 días a la semana» sin `limite_semanal` puesto: para Tentare no tiene tope.
  assert.equal(avisoLimiteSemanal(null, 0, 2), null);
  assert.equal(avisoLimiteSemanal(0, 3, 4), null);
});

test('límite semanal: avisa antes de guardar solo si lo elegido se pasa', () => {
  assert.equal(avisoLimiteSemanal(2, 0, 2), null);
  assert.equal(avisoLimiteSemanal(2, 1, 1), null);
  assert.equal(avisoLimiteSemanal(2, 0, 0), null);
  assert.equal(avisoLimiteSemanal(2, 0, 3), 'Su cuota es de 2 clases por semana y has elegido 3: te pediremos confirmarlo al asignar.');
  assert.equal(
    avisoLimiteSemanal(1, 1, 1),
    'Su cuota es de 1 clase por semana, ya tiene 1 y con estas serían 2: te pediremos confirmarlo al asignar.',
  );
});
