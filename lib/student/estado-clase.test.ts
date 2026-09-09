import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estaEnCurso, yaTermino } from './estado-clase.ts';
import { enCursoEn } from '../calendario-estado.ts';

// El caso de la petición, literal: clase de 16:00 a 16:55 (hora de Madrid, que
// en agosto es UTC+2) y la alumna abre la app a las 16:30.
const CLASE = { inicio: '2026-08-12T14:00:00.000Z', fin: '2026-08-12T14:55:00.000Z' };
const enPunto = (hhmm: string) => new Date(`2026-08-12T${hhmm}:00.000Z`).getTime();

test('estaEnCurso: a media clase, sí', () => {
  assert.equal(estaEnCurso(CLASE, enPunto('14:30')), true); // 16:30 en el estudio
});

test('estaEnCurso: el minuto de inicio ya cuenta', () => {
  assert.equal(estaEnCurso(CLASE, enPunto('14:00')), true);
});

test('estaEnCurso: un minuto antes de empezar, no', () => {
  assert.equal(estaEnCurso(CLASE, enPunto('13:59')), false);
});

// El fin es EXCLUSIVO a propósito: si fuera inclusivo, a las 16:55 la clase
// saldría a la vez como «en curso» y como «terminada».
test('estaEnCurso: en el instante del fin ya NO está en curso', () => {
  assert.equal(estaEnCurso(CLASE, enPunto('14:55')), false);
  assert.equal(yaTermino(CLASE, enPunto('14:55')), true);
});

test('estaEnCurso: el último minuto todavía cuenta', () => {
  assert.equal(estaEnCurso(CLASE, enPunto('14:54')), true);
});

test('yaTermino: durante la clase, no', () => {
  assert.equal(yaTermino(CLASE, enPunto('14:30')), false);
});

// ⚠️ El contrato de `useAhoraMs`: `null` es «todavía no hay reloj» (el servidor
// no pinta hora), NO «hace mucho». Las dos funciones tienen que decir `false`,
// porque lo contrario haría que el servidor pintase un estado temporal y el
// cliente otro — el desajuste de hidratación que este reloj existe para evitar.
test('sin reloj (null) no se afirma nada: ni en curso ni terminada', () => {
  assert.equal(estaEnCurso(CLASE, null), false);
  assert.equal(yaTermino(CLASE, null), false);
});

// La regla es UNA. Si alguien la duplicase en la app de la alumna, este test
// seguiría pasando pero el de abajo dejaría de tener sentido: se comprueba que
// el resultado es literalmente el de `enCursoEn`, la que usa el panel.
test('la alumna y el panel usan la MISMA regla', () => {
  for (const hhmm of ['13:30', '13:59', '14:00', '14:30', '14:54', '14:55', '15:30']) {
    const ms = enPunto(hhmm);
    assert.equal(
      estaEnCurso(CLASE, ms),
      enCursoEn(CLASE.inicio, CLASE.fin, new Date(ms)),
      `discrepan a las ${hhmm}`,
    );
  }
});

// Una clase que cruza la medianoche del estudio no es un caso raro inventado:
// `claveFranjaDe` ya documenta que existen clases de 00:30. Con instantes no hay
// nada que resolver, que es justo el motivo de llevarlos en vez de fecha+hora.
test('clase que cruza la medianoche: los instantes lo resuelven solos', () => {
  const nocturna = { inicio: '2026-08-12T22:30:00.000Z', fin: '2026-08-12T23:20:00.000Z' };
  assert.equal(estaEnCurso(nocturna, new Date('2026-08-12T22:50:00.000Z').getTime()), true);
  assert.equal(estaEnCurso(nocturna, new Date('2026-08-12T23:30:00.000Z').getTime()), false);
});
