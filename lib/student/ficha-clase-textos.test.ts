import test from 'node:test';
import assert from 'node:assert/strict';
import { antetituloClase, consultaMapa, textoCancelacion, textoCreditosAlAsistir, textoCuando, textoDonde, textoPlazas } from './ficha-clase-textos.ts';

// Las frases de la ficha de una clase (P10).

test('antetítulo: solo el nivel (el tipo es el mismo campo que el nombre y salía dos veces)', () => {
  assert.equal(antetituloClase('Todos'), 'Todos los niveles');
  assert.equal(antetituloClase('Iniciación'), 'Nivel iniciación');
  assert.equal(antetituloClase('Medio'), 'Nivel medio');
  assert.equal(antetituloClase('Avanzado'), 'Nivel avanzado');
  assert.equal(antetituloClase('raro'), 'Todos los niveles');
});

test('cuándo: día, de qué hora a qué hora y cuánto dura', () => {
  assert.equal(textoCuando({ fecha: '2026-10-07', hora: '10:00', duracionMin: 50 }, '2026-10-07'), 'Hoy · 10:00 – 10:50 · 50 min');
  assert.equal(textoCuando({ fecha: '2026-10-08', hora: '18:30', duracionMin: 60 }, '2026-10-07'), 'Mañana · 18:30 – 19:30 · 60 min');
});

test('dónde: la sala delante del estudio; sin sala, el estudio; sin dirección, sin segunda línea', () => {
  assert.deepEqual(textoDonde({ nombre: 'Estudio Alma', direccion: 'Calle Larios 1' }, 'Sala 1'), { linea: 'Sala 1 · Estudio Alma', sub: 'Calle Larios 1' });
  assert.deepEqual(textoDonde({ nombre: 'Estudio Alma', direccion: 'Calle Larios 1' }, ''), { linea: 'Estudio Alma', sub: 'Calle Larios 1' });
  assert.deepEqual(textoDonde({ nombre: 'Estudio Alma', direccion: '  ' }, 'Sala 1'), { linea: 'Sala 1 · Estudio Alma', sub: null });
});

test('consultaMapa: dirección y ciudad, sin huecos', () => {
  assert.equal(consultaMapa('Calle Larios 1', 'Marbella'), 'Calle Larios 1, Marbella');
  assert.equal(consultaMapa('Calle Larios 1', ''), 'Calle Larios 1');
  assert.equal(consultaMapa('', 'Marbella'), 'Marbella');
  assert.equal(consultaMapa(null, null), '');
});

test('plazas: libres solo mientras se puede reservar; singulares', () => {
  assert.equal(textoPlazas(10, 3, false), '10 plazas · 3 libres');
  assert.equal(textoPlazas(10, 1, false), '10 plazas · 1 libre');
  assert.equal(textoPlazas(10, 3, true), '10 plazas');
  assert.equal(textoPlazas(1, 0, true), '1 plaza');
});

test('cancelación: «gratis hasta N h antes» dentro de plazo (lo busca student-ventana-cancelacion); fuera, que ya no se devuelve', () => {
  const dentro = textoCancelacion({ devolveriaCredito: true, horasVentana: 12 });
  assert.equal(dentro, 'Cancelación gratis hasta 12 h antes');
  assert.match(dentro, /gratis hasta 12 h antes/);
  assert.equal(textoCancelacion({ devolveriaCredito: false, horasVentana: 12 }), 'Ya no se devuelve la sesión si cancelas');
  // Con cuota no hay sesión que devolver: no se le habla de ella.
  assert.equal(textoCancelacion({ devolveriaCredito: false, horasVentana: 12 }, { gastaSesion: false }), 'Quedan menos de 12 h: cancelar ahora ya es tarde');
});

test('créditos al asistir, con el nombre que les da el estudio', () => {
  assert.equal(textoCreditosAlAsistir(10, 'créditos'), '+10 créditos al asistir');
  assert.equal(textoCreditosAlAsistir(5, 'puntos'), '+5 puntos al asistir');
});
