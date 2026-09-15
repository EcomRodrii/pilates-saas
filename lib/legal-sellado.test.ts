import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashTextoLegal } from './legal-hash.ts';
import {
  configLegalDe, configLegalDeFila, textoLegalCompleto, datosLegalesDeFila, textoLegalVigenteDeFila,
} from './legal-textos.ts';

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

// ── 27ª pasada (8 sep 2026), L-1 ────────────────────────────────────────────
// El sello certificaba un texto DISTINTO del que veía la compradora: a
// `configLegalDe` se le pasaba la fila de `studios` en snake_case y, como
// `DatosEstudioLegal` tiene todos los campos opcionales, TypeScript lo aceptaba
// y se perdían en silencio la razón social, el código postal, la ventana de
// cancelación y la cláusula de penalización.
//
// Este test ancla la FORMA, no la función: el test anterior («salen de la misma
// función») pasaba tan campante mientras el documento sellado y el mostrado
// eran distintos, porque a las dos llamadas se les daba la misma forma.
test('el sello se compone con los MISMOS datos que ve la compradora en el portal', () => {
  const fila = {
    nombre: 'Pilates Boutique',
    razon_social: 'Pilates Boutique SL',
    nif: 'B12345678',
    direccion: 'Calle Larios 1',
    ciudad: 'Málaga',
    codigo_postal: '29005',
    email: 'hola@ejemplo.es',
    cancelacion_ventana_horas: 24,
    penalizacion_importe_eur: 8,
    politica_privacidad: null,
    terminos_servicio: null,
  };
  // Lo que el portal le pasa a configLegalDe (lib/studio-context.tsx): camelCase.
  const comoLoVeLaCompradora = {
    nombre: 'Pilates Boutique', razonSocial: 'Pilates Boutique SL', nif: 'B12345678',
    direccion: 'Calle Larios 1', ciudad: 'Málaga', codigoPostal: '29005',
    email: 'hola@ejemplo.es', cancelacionVentanaHoras: 24, penalizacionImporteEur: 8,
  };
  assert.deepEqual(datosLegalesDeFila(fila), comoLoVeLaCompradora);

  const delServidor = textoLegalCompleto(configLegalDe(datosLegalesDeFila(fila), { politicaPrivacidad: null, terminosServicio: null }));
  const delPortal = textoLegalCompleto(configLegalDe(comoLoVeLaCompradora, { politicaPrivacidad: null, terminosServicio: null }));
  assert.equal(hashTextoLegal(delServidor), hashTextoLegal(delPortal));

  // Y que de verdad lleva lo que se perdía: razón social, CP y las dos reglas.
  assert.match(delServidor, /Pilates Boutique SL/);
  assert.match(delServidor, /29005/);
  assert.match(delServidor, /24/);
});

// ── Lo que lee la alumna que se da de alta sola = lo que se sella ───────────
//
// El test de arriba rehace a mano lo que ve la compradora, y por eso no veía el
// hueco: `studioPublico` (portal, `/reservar`, widget) componía los términos SIN
// ventana de cancelación ni importe. La alumna leía «12 horas» y ningún cargo, y
// `componerTextoLegalVigente` sellaba como aceptado el texto CON la cláusula.
// Aquí se usa la función que usan los dos, y se comprueba que la usan.

const FILA_CON_CARGO = {
  nombre: 'Estudio de prueba', razon_social: 'Estudio de prueba SL', nif: 'B00000000',
  direccion: 'Calle Falsa 1', ciudad: 'Ciudad', codigo_postal: '00000', email: 'hola@example.com',
  cancelacion_ventana_horas: 24, penalizacion_importe_eur: 7.5,
  politica_privacidad: null, terminos_servicio: null,
};

test('los términos del payload público son EXACTAMENTE el texto que se sella, con la cláusula y la ventana real', () => {
  const publico = configLegalDeFila(FILA_CON_CARGO);        // lo que pone `studioPublico`
  const sellado = textoLegalVigenteDeFila(FILA_CON_CARGO);  // lo que devuelve `componerTextoLegalVigente`

  // Registro del portal y widget: los dos campos del payload, tal cual.
  assert.equal(textoLegalCompleto({ politicaPrivacidad: publico.politicaPrivacidad, terminosServicio: publico.terminosServicio }), sellado);
  // `studio-context` y la compra del portal: `configLegalDe(studio, studio)` sobre el payload.
  const studio = { ...datosLegalesDeFila(FILA_CON_CARGO), ...publico };
  assert.equal(textoLegalCompleto(configLegalDe(studio, studio)), sellado);
  assert.equal(hashTextoLegal(textoLegalCompleto(publico)), hashTextoLegal(sellado));

  assert.match(publico.terminosServicio, /7\.50 €/, 'la cláusula de cargo tiene que estar en lo que lee');
  assert.match(publico.terminosServicio, /menos de 24 horas/);
  assert.doesNotMatch(publico.terminosServicio, /menos de 12 horas/);
});

test('componer como lo hacía `studioPublico` (sin ventana ni importe) da OTRO texto: el que se enseñaba', () => {
  const comoAntes = textoLegalCompleto(configLegalDe({
    nombre: FILA_CON_CARGO.nombre, razonSocial: FILA_CON_CARGO.razon_social, nif: FILA_CON_CARGO.nif,
    direccion: FILA_CON_CARGO.direccion, ciudad: FILA_CON_CARGO.ciudad, codigoPostal: FILA_CON_CARGO.codigo_postal,
    email: FILA_CON_CARGO.email,
  }, { politicaPrivacidad: null, terminosServicio: null }));
  assert.notEqual(comoAntes, textoLegalVigenteDeFila(FILA_CON_CARGO));
  assert.match(comoAntes, /menos de 12 horas/);
  assert.doesNotMatch(comoAntes, /€/);
});

test('`studioPublico` y `componerTextoLegalVigente` componen con el mismo dueño, no a mano', () => {
  const admin = readFileSync(join(import.meta.dirname, 'db/supabase-data-admin.ts'), 'utf8');
  const ini = admin.indexOf('function studioPublico(');
  const cuerpo = admin.slice(ini, admin.indexOf('\n}\n', ini));
  assert.ok(ini > 0 && cuerpo.length > 0, 'no encuentro studioPublico');
  assert.match(cuerpo, /configLegalDeFila\(r\b/);
  assert.doesNotMatch(cuerpo, /configLegalDe\(\s*\{/, 'nada de componer los datos legales a mano');
  assert.match(cuerpo, /penalizacionImporteEur: r\.penalizacion_importe_eur/);

  const sellado = readFileSync(join(import.meta.dirname, 'legal-sellado.ts'), 'utf8');
  const desde = sellado.indexOf('export async function componerTextoLegalVigente(');
  const funcion = sellado.slice(desde, sellado.indexOf('\n}\n', desde));
  assert.ok(desde > 0);
  assert.match(funcion, /return textoLegalVigenteDeFila\(/);
  for (const col of ['razon_social', 'codigo_postal', 'cancelacion_ventana_horas', 'penalizacion_importe_eur', 'politica_privacidad', 'terminos_servicio']) {
    assert.ok(funcion.includes(col), `el select del sello tiene que traer ${col}`);
  }
});

test('pasar la fila CRUDA produce un texto distinto — que es lo que ocurría', () => {
  const fila = {
    nombre: 'Pilates Boutique', razon_social: 'Pilates Boutique SL', nif: 'B12345678',
    direccion: 'Calle Larios 1', ciudad: 'Málaga', codigo_postal: '29005', email: 'hola@ejemplo.es',
    cancelacion_ventana_horas: 24, penalizacion_importe_eur: 8,
  };
  const bien = textoLegalCompleto(configLegalDe(datosLegalesDeFila(fila), { politicaPrivacidad: null, terminosServicio: null }));
  const comoAntes = textoLegalCompleto(configLegalDe(fila as never, { politicaPrivacidad: null, terminosServicio: null }));
  assert.notEqual(hashTextoLegal(bien), hashTextoLegal(comoAntes));
});
