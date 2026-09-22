import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faltaParaCrearClase } from './falta-para-crear-clase.ts';

const base = { tipoClaseId: 't', salaId: 's', instructorId: 'i', hayTipos: true, haySalas: true, hayInstructoras: true, exigeInstructora: true };

test('sin nada que falte, nada que decir', () => {
  assert.equal(faltaParaCrearClase(base), null);
});

test('sin instructoras en el estudio: lleva a Equipo, no a Configuración, y habla de «ella»', () => {
  const r = faltaParaCrearClase({ ...base, instructorId: '', hayInstructoras: false })!;
  assert.deepEqual(r.faltan, ['una instructora']);
  assert.deepEqual(r.porCrear, [{ texto: 'Todavía no tienes ninguna instructora en tu equipo.', enlace: 'Añádela en Equipo', href: '/equipo?nuevo=1' }]);
});

test('cada cosa sin crear, su sitio: tipo y sala en Configuración', () => {
  const r = faltaParaCrearClase({ ...base, tipoClaseId: '', salaId: '', hayTipos: false, haySalas: false })!;
  assert.deepEqual(r.porCrear.map((x) => x.href), ['/configuracion?tab=clases&abrir=tipos-de-clase', '/configuracion?tab=estudio&abrir=salas']);
  assert.deepEqual(r.porCrear.map((x) => x.enlace), ['Créalo en Configuración', 'Créala en Configuración']);
});

test('si existen pero no se ha elegido: pide elegir, sin mandar a ningún sitio', () => {
  const r = faltaParaCrearClase({ ...base, instructorId: '', salaId: '' })!;
  assert.deepEqual(r.faltan, ['elegir la sala', 'elegir la instructora']);
  assert.equal(r.porCrear.length, 0);
});

test('al editar no se exige instructora (el horario propuesto deja clases sin ella)', () => {
  assert.equal(faltaParaCrearClase({ ...base, instructorId: '', hayInstructoras: false, exigeInstructora: false }), null);
});
