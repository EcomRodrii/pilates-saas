import test from 'node:test';
import assert from 'node:assert/strict';
import { camposVaciosARellenar } from './fusionar-lead.ts';

const vacio = { nombre: null, estudio: null, ciudad: null, mensaje: null };

test('nunca reescribe un campo que ya tenía valor', () => {
  const r = camposVaciosARellenar(
    { nombre: 'Ana', estudio: 'Estudio A', ciudad: 'Sevilla', mensaje: 'hola' },
    { nombre: 'X', estudio: 'Y', ciudad: 'Z', mensaje: 'W' },
  );
  assert.deepEqual(r, {});
});

test('rellena solo los campos vacíos que el reenvío trae', () => {
  const r = camposVaciosARellenar({ ...vacio, nombre: 'Ana' }, { nombre: 'Otra', estudio: 'Estudio B', ciudad: null, mensaje: 'quiero' });
  assert.deepEqual(r, { estudio: 'Estudio B', mensaje: 'quiero' });
});

test('una cadena vacía cuenta como vacío; un dato nuevo vacío no escribe nada', () => {
  assert.deepEqual(camposVaciosARellenar({ ...vacio, ciudad: '' }, { ...vacio, ciudad: 'Málaga' }), { ciudad: 'Málaga' });
  assert.deepEqual(camposVaciosARellenar(vacio, vacio), {});
});
