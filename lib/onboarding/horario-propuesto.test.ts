import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  proponerHorario, horasPropuestas, resumirPropuesta, SEMANAS_A_CREAR, DIAS_SEMANA,
} from './horario-propuesto.ts';

const BASE = {
  dias: [1, 3, 5],
  horaApertura: '09:00:00',
  horaCierre: '21:00:00',
  duracionMinutos: 50,
  tiposClase: ['Reformer', 'Mat'],
  salas: ['Sala'],
  aforoPorSala: 8,
};

test('el caso normal: tres días, dos tipos, franja de mañana y tarde', () => {
  const p = proponerHorario(BASE);
  assert.ok(p.length > 0);
  // Solo los días que dijo.
  assert.deepEqual([...new Set(p.map(c => c.diaSemana))].sort(), [1, 3, 5]);
  // Solo los tipos que dijo.
  for (const c of p) assert.ok(BASE.tiposClase.includes(c.clase));
  // Todo dentro de la franja.
  for (const c of p) {
    assert.ok(c.horaInicio >= '09:00', c.horaInicio);
    assert.ok(c.horaFin <= '21:00', c.horaFin);
  }
  // La duración se respeta.
  assert.equal(p[0].horaFin, '09:50');
});

// Un estudio nuevo que se encuentra 40 clases inventadas no ve un favor, ve un
// destrozo que hay que limpiar — y descarta la propuesta entera.
test('la propuesta es MODESTA: como mucho 4 clases por día', () => {
  const p = proponerHorario({ ...BASE, dias: [1, 2, 3, 4, 5, 6, 0] });
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    const delDia = p.filter(c => c.diaSemana === dow);
    assert.ok(delDia.length <= 4, `${dow} tiene ${delDia.length}`);
  }
});

// Rotando dentro del día, un estudio con dos tipos tendría todos los días
// idénticos. Rotando por hueco, la semana se ve como un horario de verdad.
test('los tipos de clase rotan por la semana, no se repiten día a día', () => {
  const p = proponerHorario(BASE);
  const lunes = p.filter(c => c.diaSemana === 1).map(c => c.clase).join(',');
  const miercoles = p.filter(c => c.diaSemana === 3).map(c => c.clase).join(',');
  assert.notEqual(lunes, miercoles);
});

test('se ordena de lunes a domingo, no en el orden en que los tocó', () => {
  const p = proponerHorario({ ...BASE, dias: [6, 1, 3] });
  const orden = [...new Set(p.map(c => c.diaSemana))];
  assert.deepEqual(orden, [1, 3, 6]);
});

// Mismo criterio que planificarConfiguracion: sin respuesta no se inventa nada.
test('sin alguna pieza imprescindible no se propone NADA, ni a medias', () => {
  assert.deepEqual(proponerHorario({ ...BASE, dias: [] }), []);
  assert.deepEqual(proponerHorario({ ...BASE, tiposClase: [] }), []);
  assert.deepEqual(proponerHorario({ ...BASE, duracionMinutos: undefined }), []);
  assert.deepEqual(proponerHorario({ ...BASE, horaApertura: undefined }), []);
  assert.deepEqual(proponerHorario({ ...BASE, horaCierre: undefined }), []);
});

test('una franja imposible no produce clases fuera de hora', () => {
  // Cierre antes que apertura.
  assert.deepEqual(proponerHorario({ ...BASE, horaApertura: '21:00', horaCierre: '09:00' }), []);
  // La clase no cabe en la franja.
  assert.deepEqual(proponerHorario({ ...BASE, horaApertura: '09:00', horaCierre: '09:30', duracionMinutos: 50 }), []);
});

// Una franja corta da menos huecos, y eso es correcto: son menos horas.
test('una franja de solo mañanas propone menos clases que una de todo el día', () => {
  const manana = proponerHorario({ ...BASE, horaApertura: '07:00', horaCierre: '15:00' });
  const todoElDia = proponerHorario({ ...BASE, horaApertura: '07:00', horaCierre: '22:00' });
  assert.ok(manana.length > 0);
  assert.ok(todoElDia.length >= manana.length);
});

// `sesiones_sala_sin_solape` es una exclusion constraint real: dos clases a la
// misma hora en la misma sala harían fallar la importación entera.
test('nunca hay dos clases a la misma hora el mismo día', () => {
  const p = proponerHorario({ ...BASE, dias: [1, 2, 3, 4, 5], tiposClase: ['Reformer', 'Mat', 'Prenatal'] });
  const vistos = new Set<string>();
  for (const c of p) {
    const k = `${c.diaSemana}-${c.horaInicio}`;
    assert.ok(!vistos.has(k), `dos clases en ${k}`);
    vistos.add(k);
  }
});

test('días repetidos o inválidos no duplican ni rompen', () => {
  const p = proponerHorario({ ...BASE, dias: [1, 1, 1, 9, -2] });
  assert.deepEqual([...new Set(p.map(c => c.diaSemana))], [1]);
});

test('la sala y el aforo salen de lo que ya contestó', () => {
  const p = proponerHorario(BASE);
  for (const c of p) {
    assert.equal(c.sala, 'Sala');
    assert.equal(c.aforo, 8);
  }
});

// Con varias salas se usa UNA: dos clases a la vez en salas distintas es una
// decisión de aforo que ella no ha tomado.
test('con varias salas la propuesta usa solo la primera', () => {
  const p = proponerHorario({ ...BASE, salas: ['Sala 1', 'Sala 2', 'Sala 3'] });
  assert.deepEqual([...new Set(p.map(c => c.sala))], ['Sala 1']);
});

// Este caso afirmaba lo contrario: que la última clase empezaba en
// `cierre - duración`. Para 09:00–21:00 eso daba las 20:10, y para 07:00–22:00
// las 21:10 — horas que ningún estudio tiene. Se cambió a horas EN PUNTO tras
// imprimir la propuesta y ver el resultado.
test('todas las horas propuestas son en punto', () => {
  for (const [ap, ci] of [[9 * 60, 21 * 60], [7 * 60, 22 * 60], [15 * 60, 22 * 60]] as const) {
    for (const h of horasPropuestas(ap, ci, 50)) {
      assert.equal(h % 60, 0, `${h} no es una hora en punto`);
      assert.ok(h >= ap && h + 50 <= ci, `${h} se sale de la franja`);
    }
  }
});

// Antes se amontonaban en los extremos exactos: «07:00, 07:50, 21:10», con
// trece horas muertas en medio. Un estudio real trabaja en dos picos.
test('en una franja larga hay bloque de mañana y bloque de tarde', () => {
  const h = horasPropuestas(7 * 60, 22 * 60, 50);
  assert.ok(h.some(x => x < 12 * 60), 'falta la mañana');
  assert.ok(h.some(x => x >= 18 * 60), 'falta la tarde');
});

// Con dos tipos y cuatro huecos, una rotación sin desplazar vuelve a la misma
// fase cada día y la semana entera sale idéntica.
test('los días no salen todos iguales', () => {
  const p = proponerHorario({ ...BASE, dias: [1, 2, 3, 4, 5] });
  const lunes = p.filter(c => c.diaSemana === 1).map(c => c.clase).join(',');
  const martes = p.filter(c => c.diaSemana === 2).map(c => c.clase).join(',');
  assert.notEqual(lunes, martes);
});

test('el resumen cuenta las clases de las cuatro semanas, no las de una', () => {
  const p = proponerHorario(BASE);
  const r = resumirPropuesta(p);
  assert.equal(r.porSemana, p.length);
  assert.equal(r.clases, p.length * SEMANAS_A_CREAR);
  assert.equal(r.dias, 3);
});

test('DIAS_SEMANA empieza en lunes y usa el DOW de Postgres (domingo = 0)', () => {
  assert.equal(DIAS_SEMANA[0].dow, 1);
  assert.equal(DIAS_SEMANA[DIAS_SEMANA.length - 1].dow, 0);
  assert.equal(DIAS_SEMANA.length, 7);
});
