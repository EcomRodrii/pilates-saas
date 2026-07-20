import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  equipoIncompleto, listarNombres, avisoEquipoIncompleto, motivoSinCandidatas,
} from './preparacion.ts';

const ins = (nombre: string) => ({ id: `ins-${nombre}`, nombre });

test('equipo entero configurado → no se avisa de nada', () => {
  const d = { total: 5, sinDisponibilidad: [] };
  assert.equal(equipoIncompleto(d), false);
  assert.equal(avisoEquipoIncompleto(d), null);
});

test('nadie tiene disponibilidad → se dice sin rodeos que no puede funcionar', () => {
  const d = { total: 3, sinDisponibilidad: [ins('Ana'), ins('Berta'), ins('Carla')] };
  const msg = avisoEquipoIncompleto(d)!;
  assert.match(msg, /no puedo proponerte a nadie/);
  assert.match(msg, /ninguna de tus 3 instructoras/);
});

test('una sola sin configurar → mensaje en singular y con su nombre', () => {
  const d = { total: 4, sinDisponibilidad: [ins('Meri')] };
  const msg = avisoEquipoIncompleto(d)!;
  assert.match(msg, /Meri no tiene/);
  assert.doesNotMatch(msg, /instructoras no tienen/);
});

test('caso real del estudio: 6 de 7 sin disponibilidad', () => {
  const d = {
    total: 7,
    sinDisponibilidad: ['María Soler', 'Julia Ramos', 'maria', 'Elena', 'Lucía', 'Marta'].map(ins),
  };
  const msg = avisoEquipoIncompleto(d)!;
  assert.match(msg, /6 de tus 7 instructoras/);
  assert.match(msg, /María Soler, Julia Ramos, maria y 3 más/);
});

test('listarNombres: enumera en español natural', () => {
  assert.equal(listarNombres([]), '');
  assert.equal(listarNombres(['Ana']), 'Ana');
  assert.equal(listarNombres(['Ana', 'Berta']), 'Ana y Berta');
  assert.equal(listarNombres(['Ana', 'Berta', 'Carla']), 'Ana, Berta y Carla');
  assert.equal(listarNombres(['Ana', 'Berta', 'Carla', 'Dana']), 'Ana, Berta, Carla y 1 más');
});

test('sin candidatas y con el equipo configurado → mensaje de siempre, sin culpar a nadie', () => {
  const m = motivoSinCandidatas(0);
  assert.match(m, /Ninguna candidata disponible para esta franja/);
  assert.doesNotMatch(m, /disponibilidad cargada/);
});

test('sin candidatas Y con gente sin configurar → se dice que ni se las consideró', () => {
  assert.match(motivoSinCandidatas(1), /1 instructora sin disponibilidad/);
  assert.match(motivoSinCandidatas(1), /ni considerarla/);
  assert.match(motivoSinCandidatas(5), /5 instructoras sin disponibilidad/);
  assert.match(motivoSinCandidatas(5), /ni considerarlas/);
});
