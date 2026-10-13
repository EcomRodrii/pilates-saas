import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonaDelEstudio, normalizarLugar } from './zona-del-estudio.ts';

test('el código postal manda: sus dos primeras cifras son la provincia', () => {
  assert.equal(zonaDelEstudio({ codigoPostal: '08201' }), 'CATALUNA'); // Sabadell
  assert.equal(zonaDelEstudio({ codigoPostal: '17001' }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ codigoPostal: '25001' }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ codigoPostal: '43001' }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ codigoPostal: '28013' }), 'MADRID');
  for (const cp of ['04001', '11001', '14001', '18001', '21001', '23001', '29001', '41001']) {
    assert.equal(zonaDelEstudio({ codigoPostal: cp }), 'ANDALUCIA', cp);
  }
  assert.equal(zonaDelEstudio({ codigoPostal: ' 28 013 ' }), 'MADRID', 'espacios fuera');
});

test('un código postal de otra comunidad no se corrige con la ciudad', () => {
  // Valencia (46): no hay calendario cargado → sin aviso, aunque la ciudad
  // se llame igual que una de la lista.
  assert.equal(zonaDelEstudio({ codigoPostal: '46001', ciudad: 'Madrid' }), null);
  assert.equal(zonaDelEstudio({ codigoPostal: '07001' }), null); // Baleares
});

test('un código postal mal escrito no cuenta y se mira la ciudad', () => {
  assert.equal(zonaDelEstudio({ codigoPostal: '8201', ciudad: 'Sabadell' }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ codigoPostal: '99999', ciudad: 'Sevilla' }), 'ANDALUCIA');
  assert.equal(zonaDelEstudio({ codigoPostal: 'abcde', ciudad: 'Getafe' }), 'MADRID');
});

test('un único código postal dentro de la dirección vale; dos números de cinco cifras, no', () => {
  assert.equal(zonaDelEstudio({ direccion: 'Calle Mayor 1, 28013 Madrid' }), 'MADRID');
  assert.equal(zonaDelEstudio({ direccion: 'Polígono 12345, nave 28013' }), null);
});

test('la ciudad, con acentos, mayúsculas, artículos y la provincia entre paréntesis', () => {
  assert.equal(zonaDelEstudio({ ciudad: 'Sant Cugat del Vallès' }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ ciudad: "L'Hospitalet de Llobregat" }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ ciudad: 'MÁLAGA' }), 'ANDALUCIA');
  assert.equal(zonaDelEstudio({ ciudad: 'Rivas-Vaciamadrid' }), 'MADRID');
  assert.equal(zonaDelEstudio({ ciudad: 'Vélez-Málaga' }), 'ANDALUCIA');
  assert.equal(zonaDelEstudio({ ciudad: 'Algún pueblo (Barcelona)' }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ ciudad: 'Algún pueblo, Sevilla' }), 'ANDALUCIA');
  assert.equal(zonaDelEstudio({ ciudad: 'Almuñécar' }), 'ANDALUCIA');
  assert.equal(zonaDelEstudio({ ciudad: 'bcn' }), 'CATALUNA', 'la abreviatura de siempre');
  assert.equal(zonaDelEstudio({ ciudad: 'Elda, Alicante' }), null);
});

test('sin coincidencia, null: nunca se adivina', () => {
  assert.equal(zonaDelEstudio({}), null);
  assert.equal(zonaDelEstudio({ ciudad: 'Valencia' }), null);
  assert.equal(zonaDelEstudio({ ciudad: 'Bilbao' }), null);
  assert.equal(zonaDelEstudio({ ciudad: '   ' }), null);
});

test('el Valle de Arán tiene su calendario aunque su código postal sea de Lleida', () => {
  assert.equal(zonaDelEstudio({ ciudad: 'Vielha', codigoPostal: '25530' }), 'ARAN');
  assert.equal(zonaDelEstudio({ ciudad: 'Naut Aran' }), 'ARAN');
  assert.equal(zonaDelEstudio({ ciudad: 'Lleida', codigoPostal: '25001' }), 'CATALUNA');
  // Un «Les» con código postal de Madrid no es Arán: manda el código postal.
  assert.equal(zonaDelEstudio({ ciudad: 'Les', codigoPostal: '28013' }), 'MADRID');  // Un código postal del Pirineo de Lleida sin ciudad: puede ser Arán o no. No se adivina.
  assert.equal(zonaDelEstudio({ codigoPostal: '25530' }), null);
  assert.equal(zonaDelEstudio({ codigoPostal: '25599', ciudad: 'Baqueira' }), 'ARAN');
  assert.equal(zonaDelEstudio({ ciudad: 'Vielha-Mijaran' }), 'ARAN');
  assert.equal(zonaDelEstudio({ codigoPostal: '25001' }), 'CATALUNA', 'Lleida ciudad sí es Cataluña');
});

test('fuera de la hora peninsular no hay calendario (un 08xxx también existe en Francia)', () => {
  assert.equal(zonaDelEstudio({ codigoPostal: '08000', zonaHoraria: 'Europe/Paris' }), null);
  assert.equal(zonaDelEstudio({ codigoPostal: '08201', zonaHoraria: 'Europe/Madrid' }), 'CATALUNA');
  assert.equal(zonaDelEstudio({ codigoPostal: '08201', zonaHoraria: null }), 'CATALUNA');
});

test('normalizarLugar', () => {
  assert.equal(normalizarLugar("  L'Hospitalet  de Llobregat "), 'l hospitalet de llobregat');
  assert.equal(normalizarLugar('Vélez-Málaga'), 'velez malaga');
});
