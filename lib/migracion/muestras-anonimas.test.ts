import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cabeceraSensible, construirPromptClasificacion, enmascararMuestra } from './muestras-anonimas.ts';

// Todos los datos de estas fixtures son INVENTADOS.
//
// El listón: la muestra que sale hacia el proveedor de IA no puede llevar ni un
// solo valor personal o de salud, y aun así tiene que conservar lo que hace
// falta para mapear columnas (cabeceras y forma de cada valor).

const CABECERAS = ['Cliente', 'Correo', 'Móvil', 'DNI', 'F. nacimiento', 'Estado', 'Plan', 'Importe', 'Lesiones', 'IBAN', 'Notas', 'Hora'];
const FILAS = [
  ['Lucía Ferrández Poveda', 'lucia.ferrandez@ejemplo.test', '611 222 333', '12345678Z', '03/04/1988', 'Active', 'Bono 10', '85,00', 'Hernia discal L5', 'ES91 2100 0418 4502 0005 1332', 'Prefiere la sala 2', '10:00'],
  ['Begoña Arrieta', 'bego@ejemplo.test', '+34 699 888 777', 'X1234567L', '21/11/1979', 'Active', 'Mensual', '59', 'Embarazo 20 semanas', 'ES79 2100 0813 6101 2345 6789', 'Viene con su hija', '18:30'],
  ['Maite', 'maite@ejemplo.test', '622333444', '87654321X', '1990-01-15', 'Cancelled', 'Bono 10', '85,00', '', '', '', '09:15'],
];

const SENSIBLES = [
  'Lucía', 'Ferrández', 'Poveda', 'Begoña', 'Arrieta', 'Maite',
  'lucia.ferrandez@ejemplo.test', 'bego@ejemplo.test', 'maite@ejemplo.test',
  '611 222 333', '699 888 777', '622333444',
  '12345678Z', 'X1234567L', '87654321X',
  '03/04/1988', '21/11/1979', '1990-01-15',
  'Hernia', 'Embarazo', 'ES91', 'ES79', '2100', 'sala 2', 'hija',
];

test('ningún valor personal o de salud llega al prompt', () => {
  const prompt = construirPromptClasificacion('export.csv', CABECERAS, FILAS);
  for (const s of SENSIBLES) assert.ok(!prompt.includes(s), `el prompt no puede contener «${s}»`);
});

test('las cabeceras y la forma de cada columna sí llegan', () => {
  const prompt = construirPromptClasificacion('export.csv', CABECERAS, FILAS);
  CABECERAS.forEach((h, i) => assert.ok(prompt.includes(`${i}: ${h}`), `falta la cabecera ${h}`));
  for (const m of ['<email>', '<teléfono>', '<documento>', '<iban>', '<fecha nn/nn/aaaa>', '<fecha aaaa-nn-nn>', '<texto 22 caracteres>']) {
    assert.ok(prompt.includes(m), `falta el marcador ${m}`);
  }
});

test('se conservan categorías repetidas, importes y horas en columnas no sensibles', () => {
  const [f1, , f3] = enmascararMuestra(CABECERAS, FILAS);
  assert.equal(f1[5], 'Active');
  assert.equal(f1[7], '85,00');
  assert.equal(f1[11], '10:00');
  // «Cancelled» sale una sola vez: no se puede distinguir de un nombre propio.
  assert.equal(f3[5], '<texto 9 caracteres>');
  // Nombre de plan con espacios: forma, no valor (compromiso documentado).
  assert.equal(f1[6], '<texto 7 caracteres>');
  // Celdas vacías siguen vacías.
  assert.equal(f3[8], '');
});

test('cabeceras que no dicen nada: se enmascara por la forma del valor', () => {
  const cabeceras = ['colA', 'colB', 'colC', 'colD', 'colE'];
  const filas = [
    ['Nora Quintana', 'nora@ejemplo.test', '+34 633 444 555', 'Active', 'Lumbalgia'],
    ['Nora Quintana', 'nora@ejemplo.test', '+34 633 444 555', 'Active', 'Lumbalgia'],
  ];
  const prompt = construirPromptClasificacion('misterio.csv', cabeceras, filas);
  for (const s of ['Nora', 'Quintana', 'nora@ejemplo.test', '633 444 555', 'Lumbalgia']) {
    assert.ok(!prompt.includes(s), `el prompt no puede contener «${s}»`);
  }
  assert.ok(prompt.includes('Active'));
});

test('cabeceras sensibles en español, inglés y con tildes', () => {
  for (const h of ['Nombre', 'First Name', 'E-mail', 'Teléfono', 'Fecha de nacimiento', 'Observaciones', 'Tags', 'Alergias', 'Member']) {
    assert.ok(cabeceraSensible(h), h);
  }
  for (const h of ['Estado', 'Status', 'Importe', 'Sesiones', 'Credits Remaining', 'Expiry Date', 'Lead stage']) {
    assert.ok(!cabeceraSensible(h), h);
  }
});
