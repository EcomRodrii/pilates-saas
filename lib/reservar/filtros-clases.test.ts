import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  opcionesDe, cuantosFiltros, vaLaPena, SIN_FILTROS, type ClaseFiltrable,
} from './filtros-clases.ts';

const CLASES: ClaseFiltrable[] = [
  { instructorNombre: 'Laura', nivel: 'TODOS', tipoClaseId: 'reformer' },
  { instructorNombre: 'Laura', nivel: 'TODOS', tipoClaseId: 'reformer' },
  { instructorNombre: 'Laura', nivel: 'AVANZADO', tipoClaseId: 'reformer' },
  { instructorNombre: 'Ana', nivel: 'TODOS', tipoClaseId: 'mat' },
];

test('las opciones salen de las clases que HAY, no del catálogo', () => {
  // Una instructora dada de alta pero sin clase esta semana no puede aparecer:
  // sería un callejón sin salida.
  const ins = opcionesDe(CLASES, (c) => c.instructorNombre);
  assert.deepEqual(ins.map((o) => o.valor), ['Laura', 'Ana']);
  assert.deepEqual(ins.map((o) => o.cuantas), [3, 1]);
});

test('ordena por frecuencia y desempata alfabéticamente', () => {
  // Sin desempate estable la lista baila entre renders y se pincha lo que no es.
  const clases: ClaseFiltrable[] = [
    { instructorNombre: 'Zoe' }, { instructorNombre: 'Ana' },
    { instructorNombre: 'Marta' }, { instructorNombre: 'Marta' },
  ];
  assert.deepEqual(opcionesDe(clases, (c) => c.instructorNombre).map((o) => o.valor), ['Marta', 'Ana', 'Zoe']);
});

test('los valores vacíos o ausentes no crean una opción fantasma', () => {
  const clases: ClaseFiltrable[] = [
    { instructorNombre: null }, { instructorNombre: undefined }, { instructorNombre: '' },
    { instructorNombre: 'Laura' },
  ];
  assert.deepEqual(opcionesDe(clases, (c) => c.instructorNombre).map((o) => o.valor), ['Laura']);
});

test('se puede reetiquetar sin perder el valor que filtra', () => {
  // El nivel se guarda como 'TODOS' y se enseña como 'Todos los niveles'.
  const niveles = opcionesDe(CLASES, (c) => c.nivel, (v) => (v === 'TODOS' ? 'Todos los niveles' : v));
  assert.equal(niveles[0].valor, 'TODOS');
  assert.equal(niveles[0].etiqueta, 'Todos los niveles');
});

test('un filtro con una sola opción NO se pinta: no filtra nada', () => {
  // Todas las clases la cumplen, así que el desplegable es inerte — y uno
  // inerte hace dudar de si está roto.
  assert.equal(vaLaPena(opcionesDe(CLASES, (c) => c.tipoClaseId)), true); // reformer + mat
  assert.equal(vaLaPena(opcionesDe([{ instructorNombre: 'Laura' }], (c) => c.instructorNombre)), false);
  assert.equal(vaLaPena([]), false);
});

test('los días cuentan como UN filtro, por muchos que se marquen', () => {
  // «Lunes y martes» no es el doble de restrictivo que «lunes»: es un criterio.
  assert.equal(cuantosFiltros(SIN_FILTROS), 0);
  assert.equal(cuantosFiltros({ ...SIN_FILTROS, dias: [1] }), 1);
  assert.equal(cuantosFiltros({ ...SIN_FILTROS, dias: [1, 2, 3] }), 1);
  assert.equal(cuantosFiltros({ ...SIN_FILTROS, tipo: 'reformer', nivel: 'TODOS', dias: [1, 2] }), 3);
});
