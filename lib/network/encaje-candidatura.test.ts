import test from 'node:test';
import assert from 'node:assert/strict';

import { encajeCandidaturaDe } from './encaje-candidatura.ts';
import type { PerfilParaEncaje, VacanteParaEncaje } from './encaje-candidatura.ts';

const VACANTE: VacanteParaEncaje = {
  especialidades: ['reformer'],
  horarios: ['mananas'],
  tipoTrabajo: 'freelance',
  tarifaRango: '25-30',
  estudioCiudad: 'Madrid',
};

const PERFIL_PLENO: PerfilParaEncaje = {
  ciudad: 'Madrid',
  especialidades: ['reformer', 'mat'],
  disponibilidadHorarios: ['mananas', 'tardes'],
  tipoTrabajo: ['freelance', 'sustituciones'],
  tarifaRango: '25-30',
};

test('encaje pleno: los 5 criterios cumplen, barra 100', () => {
  const e = encajeCandidaturaDe(VACANTE, PERFIL_PLENO);
  assert.equal(e.barra, 100);
  assert.equal(e.criterios.length, 5);
  assert.ok(e.criterios.every(c => c.cumple));
});

test('sin ningún dato aplicable: barra 0, lista vacía (no un 50% neutro)', () => {
  const perfilVacio: PerfilParaEncaje = {
    ciudad: null, especialidades: [], disponibilidadHorarios: [], tipoTrabajo: [], tarifaRango: null,
  };
  const e = encajeCandidaturaDe(VACANTE, perfilVacio);
  assert.equal(e.barra, 0);
  assert.deepEqual(e.criterios, []);
});

test('tarifa "a_negociar" en cualquiera de los dos lados: se excluye, no cuenta como desencaje', () => {
  const perfilNegociable: PerfilParaEncaje = { ...PERFIL_PLENO, tarifaRango: 'a_negociar' };
  const e = encajeCandidaturaDe(VACANTE, perfilNegociable);
  assert.ok(!e.criterios.some(c => c.label === 'Tarifa'));
  // Los otros 4 criterios siguen aplicando y cumplen: 100%.
  assert.equal(e.barra, 100);
});

test('ciudad distinta: criterio aplicable y no cumple', () => {
  const perfilOtraCiudad: PerfilParaEncaje = { ...PERFIL_PLENO, ciudad: 'Barcelona' };
  const e = encajeCandidaturaDe(VACANTE, perfilOtraCiudad);
  const ciudad = e.criterios.find(c => c.label === 'Ciudad');
  assert.equal(ciudad?.cumple, false);
  assert.equal(e.barra, 80); // 4 de 5
});

test('sin ciudad en el perfil: el criterio de ciudad no aplica (no penaliza)', () => {
  const perfilSinCiudad: PerfilParaEncaje = { ...PERFIL_PLENO, ciudad: null };
  const e = encajeCandidaturaDe(VACANTE, perfilSinCiudad);
  assert.ok(!e.criterios.some(c => c.label === 'Ciudad'));
  assert.equal(e.barra, 100); // 4 de 4 aplicables
});

test('especialidad: overlap parcial cuenta como cumplido, no igualdad exacta', () => {
  const perfilOtraEspecialidad: PerfilParaEncaje = { ...PERFIL_PLENO, especialidades: ['mat', 'yoga'] };
  const e = encajeCandidaturaDe(VACANTE, perfilOtraEspecialidad);
  const especialidad = e.criterios.find(c => c.label === 'Especialidad');
  assert.equal(especialidad?.cumple, false); // sin overlap con 'reformer'
});

test('tipo de trabajo no ofrecido por la candidata: criterio no cumple', () => {
  const perfilOtroTipo: PerfilParaEncaje = { ...PERFIL_PLENO, tipoTrabajo: ['jornada_completa'] };
  const e = encajeCandidaturaDe(VACANTE, perfilOtroTipo);
  const tipo = e.criterios.find(c => c.label === 'Tipo de trabajo');
  assert.equal(tipo?.cumple, false);
});
