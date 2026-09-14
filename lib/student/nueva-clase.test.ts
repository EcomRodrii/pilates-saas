import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aforoNuevaClase, horaFinNuevaClase, mensajeSolapeNuevaClase, resumenNuevaClase,
} from './nueva-clase.ts';
import { aforoPorDefectoDeSesion } from '../aforo-logic.ts';

test('la hora de fin suma la duración y no deja una clase que cruce la medianoche', () => {
  assert.equal(horaFinNuevaClase('10:00', 55), '10:55');
  assert.equal(horaFinNuevaClase('22:30', 89), '23:59');
  assert.equal(horaFinNuevaClase('23:30', 30), null);
  assert.equal(horaFinNuevaClase('23:30', 60), null);
  assert.equal(horaFinNuevaClase('', 55), null);
  assert.equal(horaFinNuevaClase('10:00', 0), null);
});

test('el aforo que se enseña es el mismo que usa el servidor: tipo, luego sala', () => {
  for (const [tipo, sala] of [[8, 12], [null, 12], [null, null], [6, null]] as const) {
    assert.equal(
      aforoNuevaClase({ aforo: tipo }, { capacidad: sala }),
      aforoPorDefectoDeSesion(tipo, sala),
      `tipo=${tipo} sala=${sala}`,
    );
  }
});

test('el resumen dice duración, fin y plazas, o por qué no se puede', () => {
  assert.equal(resumenNuevaClase({ duracionMin: 55, horaFin: '10:55', aforo: 8 }), '55 min · termina a las 10:55 · 8 plazas');
  assert.equal(resumenNuevaClase({ duracionMin: 55, horaFin: '10:55', aforo: 1 }), '55 min · termina a las 10:55 · 1 plaza');
  assert.match(resumenNuevaClase({ duracionMin: 60, horaFin: null, aforo: 8 }), /medianoche/);
});

test('un choque se explica según quién choca', () => {
  assert.match(mensajeSolapeNuevaClase('conflicting key value violates exclusion constraint "sesiones_instructor_sin_solape"'), /Ya tienes una clase/);
  assert.match(mensajeSolapeNuevaClase('... "sesiones_sala_sin_solape"'), /La sala está ocupada/);
  assert.match(mensajeSolapeNuevaClase('otra cosa'), /choca con otra clase/);
});
