import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTextoLegal } from './legal-hash.ts';
import { configLegalDe, textoLegalCompleto } from './legal-textos.ts';

// La cadena completa de la aceptación por compra, sin base de datos:
// datos del estudio → texto legal efectivo → huella.
//
// Lo que se protege aquí es que el texto que FIRMA la clienta en el portal y el
// que se SELLA al pagar salgan de la misma regla. Vivían en dos ficheros
// distintos —`configLegalDe` estaba en `studio-context.tsx`, que es de cliente,
// así que el servidor no podía usarlo— y la tentación era duplicarla. Dos
// reglas para decidir qué firmó alguien es exactamente lo que no puede pasar.

const ESTUDIO = { nombre: 'Pilates Centro', nif: 'B00000000', direccion: 'Calle Falsa 1', ciudad: 'Málaga', email: 'hola@x.es' };

test('sin textos propios, el sello usa los de por defecto CON los datos del estudio', () => {
  const c = configLegalDe(ESTUDIO, { politicaPrivacidad: null, terminosServicio: null });
  const texto = textoLegalCompleto(c);
  // El fallback antiguo decía "el responsable es el estudio de pilates", sin
  // identificar a nadie: lo que se firmaba no servía como prueba.
  assert.ok(texto.includes('Pilates Centro'), 'el nombre del estudio tiene que estar en lo que se firma');
  assert.ok(texto.includes('B00000000'), 'y su NIF');
  assert.equal(hashTextoLegal(texto).length, 64);
});

test('si el estudio reescribe sus condiciones, la huella cambia', () => {
  const antes = hashTextoLegal(textoLegalCompleto(configLegalDe(ESTUDIO, { politicaPrivacidad: null, terminosServicio: null })));
  const despues = hashTextoLegal(textoLegalCompleto(configLegalDe(ESTUDIO, {
    politicaPrivacidad: null, terminosServicio: 'Cancelación gratuita hasta 48 horas antes.',
  })));
  assert.notEqual(antes, despues, 'una compra anterior no puede apuntar al texto nuevo');
});

test('dos estudios distintos NO comparten huella aunque no hayan escrito nada', () => {
  // Porque el texto por defecto lleva SUS datos: si compartieran huella, la
  // prueba de uno serviría para el otro.
  const a = hashTextoLegal(textoLegalCompleto(configLegalDe(ESTUDIO, {})));
  const b = hashTextoLegal(textoLegalCompleto(configLegalDe({ ...ESTUDIO, nombre: 'Otro Estudio', nif: 'B11111111' }, {})));
  assert.notEqual(a, b);
});

test('la misma configuración da SIEMPRE la misma huella', () => {
  // Si no, cada compra generaría una versión nueva y la tabla crecería sin que
  // nadie hubiera cambiado una condición.
  const uno = hashTextoLegal(textoLegalCompleto(configLegalDe(ESTUDIO, {})));
  const dos = hashTextoLegal(textoLegalCompleto(configLegalDe(ESTUDIO, {})));
  assert.equal(uno, dos);
});

// ── Lo que el SERVIDOR manda al portal ───────────────────────────────────────
//
// `studioPublico` enviaba los textos CRUDOS con la nota «null = el cliente usa
// el texto por defecto». Ese contrato no se podía cumplir: componer el respaldo
// exige el NIF y la dirección, y esa lista blanca los excluye a propósito. El
// portal acababa componiendo dos vacíos.
//
// Medido en producción antes de arreglarlo: 10 de 11 estudios sin política
// propia, ninguno con términos propios, y en `socios.aceptacion_version` las
// altas de PORTAL guardaban 41 caracteres frente a 2170 las de MOSTRADOR. Esos
// 41 son EXACTAMENTE el separador entre dos textos vacíos.

test('componer desde dos vacíos da solo el separador: 41 caracteres de nada', () => {
  // Este es el bug, escrito como test para que no vuelva por otra puerta.
  const vacio = textoLegalCompleto({ politicaPrivacidad: '', terminosServicio: '' });
  assert.equal(vacio.trim().replace(/─/g, ''), '', 'no queda ni una palabra');
  assert.ok(vacio.length < 60, `un documento legal no cabe en ${vacio.length} caracteres`);
});

test('con los datos del estudio, lo que se firma identifica a alguien', () => {
  // La diferencia entre las dos filas de producción, en una aserción.
  const bueno = textoLegalCompleto(configLegalDe(ESTUDIO, { politicaPrivacidad: null, terminosServicio: null }));
  assert.ok(bueno.length > 1000, `esperaba un documento de verdad, salieron ${bueno.length} caracteres`);
  assert.ok(bueno.includes('Pilates Centro') && bueno.includes('B00000000'));
});
