import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diaLargo, esCodigoDePremioResena, esEnlaceDeResenasValido, leerPremio, LIMITES_PREMIO,
  PREFIJO_CODIGO_PREMIO_RESENA, textoDelPremio, validarAjustesResenas,
} from './premio.ts';

test('el enlace de reseñas: solo https, sin espacios, sin usuario y con dominio', () => {
  assert.equal(esEnlaceDeResenasValido('https://g.page/r/ejemplo/review'), true);
  assert.equal(esEnlaceDeResenasValido('https://www.google.com/maps/place/Estudio?hl=es#reseñas'), true);
  for (const mal of [
    'http://g.page/r/x', 'javascript:alert(1)', 'data:text/html,<b>', '//g.page/r/x', 'g.page/r/x',
    'https://google.com@otro.sitio/', 'https://user:clave@g.page/', 'https://localhost', 'https://g.page/ con espacio',
    `https://g.page/${'a'.repeat(500)}`,
  ]) assert.equal(esEnlaceDeResenasValido(mal), false, mal);
});

test('validar ajustes: sin premio y sin enlace es válido (todo apagado)', () => {
  const r = validarAjustesResenas({});
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.ajustes, { enlace: null, premioTipo: null, premioValor: null, premioDias: 30 });
});

test('validar ajustes: el enlace se recorta y un texto vacío es «sin enlace»', () => {
  const r = validarAjustesResenas({ enlace: '  https://g.page/r/ejemplo/review  ' });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.ajustes.enlace, 'https://g.page/r/ejemplo/review');
  const vacio = validarAjustesResenas({ enlace: '   ' });
  assert.ok(vacio.ok);
  if (vacio.ok) assert.equal(vacio.ajustes.enlace, null);
});

test('validar ajustes: un enlace malo se rechaza con un motivo que se entiende', () => {
  const r = validarAjustesResenas({ enlace: 'javascript:alert(1)' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /https:\/\//);
  assert.equal(validarAjustesResenas({ enlace: 42 }).ok, false);
});

test('validar ajustes: los topes del premio son los de la base de datos', () => {
  assert.equal(validarAjustesResenas({ premio: { tipo: 'PORCENTAJE', valor: LIMITES_PREMIO.PORCENTAJE.max } }).ok, true);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'PORCENTAJE', valor: LIMITES_PREMIO.PORCENTAJE.max + 1 } }).ok, false);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'PORCENTAJE', valor: 0 } }).ok, false);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'IMPORTE_FIJO', valor: 200 } }).ok, true);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'IMPORTE_FIJO', valor: 201 } }).ok, false);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'IMPORTE_FIJO', valor: 12.5 } }).ok, true);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'IMPORTE_FIJO', valor: 12.345 } }).ok, false);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'IMPORTE_FIJO', valor: Number.NaN } }).ok, false);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'IMPORTE_FIJO', valor: '10' } }).ok, false);
  assert.equal(validarAjustesResenas({ premio: { tipo: 'REGALO', valor: 10 } }).ok, false);
  assert.equal(validarAjustesResenas({ premio: 'mucho' }).ok, false);
});

test('validar ajustes: los días de vigencia, de 7 a 365 y enteros', () => {
  const ok = validarAjustesResenas({ premio: { tipo: 'PORCENTAJE', valor: 10, dias: 60 } });
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.ajustes.premioDias, 60);
  for (const d of [6, 366, 10.5, Number.NaN, '30']) {
    assert.equal(validarAjustesResenas({ premio: { tipo: 'PORCENTAJE', valor: 10, dias: d } }).ok, false, String(d));
  }
});

test('leer el premio de la base: solo si está entero', () => {
  const p = leerPremio({ codigo: 'GRACIAS-AB12CD', tipo: 'PORCENTAJE', valor: 10, expira: '2026-12-19', vigente: true, canjeado: false, nuevo: true });
  assert.deepEqual(p, { codigo: 'GRACIAS-AB12CD', tipo: 'PORCENTAJE', valor: 10, expira: '2026-12-19', vigente: true, canjeado: false, nuevo: true });
  // `valor` llega de un numeric de Postgres, a veces como texto.
  assert.equal(leerPremio({ codigo: 'GRACIAS-X', tipo: 'IMPORTE_FIJO', valor: '15.00' })?.valor, 15);
  for (const mal of [null, undefined, 'x', {}, { codigo: '' , tipo: 'PORCENTAJE', valor: 10 }, { codigo: 'A', tipo: 'OTRO', valor: 10 }, { codigo: 'A', tipo: 'PORCENTAJE', valor: 0 }]) {
    assert.equal(leerPremio(mal), null);
  }
  // Sin «vigente» no se da por vigente: mejor decir que no se sabe que prometer un código muerto.
  assert.equal(leerPremio({ codigo: 'A', tipo: 'PORCENTAJE', valor: 10 })?.vigente, false);
});

test('el premio dicho con palabras', () => {
  assert.equal(textoDelPremio({ tipo: 'PORCENTAJE', valor: 10 }), '10 % de descuento');
  assert.equal(textoDelPremio({ tipo: 'IMPORTE_FIJO', valor: 15 }), '15 € de descuento');
  assert.equal(textoDelPremio({ tipo: 'IMPORTE_FIJO', valor: 12.5 }), '12,5 € de descuento');
  assert.equal(diaLargo('2026-12-19'), '19 de diciembre de 2026');
  assert.equal(diaLargo('2026-01-05'), '5 de enero de 2026');
  assert.equal(diaLargo('mañana'), 'mañana');
});

test('los códigos de premio se reconocen por su prefijo, sin importar mayúsculas', () => {
  assert.equal(PREFIJO_CODIGO_PREMIO_RESENA, 'GRACIAS-');
  assert.equal(esCodigoDePremioResena({ codigo: 'GRACIAS-AB12CD' }), true);
  assert.equal(esCodigoDePremioResena({ codigo: ' gracias-ab12cd ' }), true);
  assert.equal(esCodigoDePremioResena({ codigo: 'VUELVE-AB12' }), false);
  assert.equal(esCodigoDePremioResena({ codigo: 'BIENVENIDA10' }), false);
});

test('el resumen de la fila de Configuración dice cómo está de un vistazo', async () => {
  const { resumenResenas } = await import('./premio.ts');
  assert.equal(resumenResenas({ enlace: null, premioTipo: null, premioValor: null }), 'Sin enlace · sin premio');
  assert.equal(resumenResenas({ enlace: 'https://g.page/r/x', premioTipo: null, premioValor: null }), 'Enlace puesto · sin premio');
  assert.equal(resumenResenas({ enlace: 'https://g.page/r/x', premioTipo: 'PORCENTAJE', premioValor: 10 }), 'Enlace puesto · premio de 10 % de descuento');
  assert.equal(resumenResenas({ enlace: null, premioTipo: 'IMPORTE_FIJO', premioValor: 12.5 }), 'Sin enlace · premio de 12,5 € de descuento');
});

test('leer la respuesta del servidor: con otra forma no rompe nada, es «no se pudo leer»', async () => {
  const { leerRespuestaResenas } = await import('./premio.ts');
  for (const raro of [null, undefined, 'x', 42, {}, { ajustes: null }, { ajustes: 'x' }, []]) {
    assert.equal(leerRespuestaResenas(raro), null, JSON.stringify(raro));
  }
  const ok = leerRespuestaResenas({ ajustes: { enlace: 'https://g.page/r/x', premioTipo: 'PORCENTAJE', premioValor: 10, premioDias: 45 }, regalados: 7, canjeados: 2 });
  assert.deepEqual(ok, { ajustes: { enlace: 'https://g.page/r/x', premioTipo: 'PORCENTAJE', premioValor: 10, premioDias: 45 }, regalados: 7, canjeados: 2, slug: null, embudo: { valoraciones: 0, mostrados: 0, clicsApp: 0, clicsQr: 0 } });
  const conEmbudo = leerRespuestaResenas({ ajustes: {}, slug: 'mi-estudio', embudo: { valoraciones: 12, mostrados: 5, clicsApp: 3, clicsQr: 'x' } });
  assert.equal(conEmbudo?.slug, 'mi-estudio');
  assert.deepEqual(conEmbudo?.embudo, { valoraciones: 12, mostrados: 5, clicsApp: 3, clicsQr: 0 });
  assert.equal(leerRespuestaResenas({ ajustes: {}, slug: 'https://malo.example/' })?.slug, null);
  // Cifras que no son cifras → 0; días raros → el de serie; enlace que no es https → ninguno.
  const sucio = leerRespuestaResenas({ ajustes: { enlace: 'javascript:1', premioDias: 'x' }, regalados: 'mucho', canjeados: -3 });
  assert.deepEqual(sucio, { ajustes: { enlace: null, premioTipo: null, premioValor: null, premioDias: 30 }, regalados: 0, canjeados: 0, slug: null, embudo: { valoraciones: 0, mostrados: 0, clicsApp: 0, clicsQr: 0 } });
  // Tipo sin valor, o valor sin tipo: no es un premio.
  assert.equal(leerRespuestaResenas({ ajustes: { premioTipo: 'PORCENTAJE', premioValor: null } })?.ajustes.premioTipo, null);
  assert.equal(leerRespuestaResenas({ ajustes: { premioTipo: null, premioValor: 10 } })?.ajustes.premioValor, null);
});

test('el momento de pedir: 20 min tras la clase y hasta 48 h, nunca antes', async () => {
  const { limitesDeBarrido, ESPERA_TRAS_CLASE_MS, VENTANA_VALORACION_MS, rutaEnlaceResenas } = await import('./momento.ts');
  const ahora = Date.parse('2026-11-21T12:00:00Z');
  const l = limitesDeBarrido(ahora);
  assert.equal(l.hastaISO, '2026-11-21T11:40:00.000Z');
  assert.equal(l.desdeISO, '2026-11-19T12:00:00.000Z');
  assert.equal(ESPERA_TRAS_CLASE_MS, 20 * 60 * 1000);
  assert.equal(VENTANA_VALORACION_MS, 48 * 60 * 60 * 1000);
  // Una clase que terminó hace 10 min aún NO se pide; una de hace 21 min, sí.
  const fin = (minAtras: number) => new Date(ahora - minAtras * 60_000).toISOString();
  assert.ok(fin(10) > l.hastaISO);
  assert.ok(fin(21) < l.hastaISO && fin(21) > l.desdeISO);
  assert.equal(rutaEnlaceResenas('mi-estudio', 'app'), '/resena/mi-estudio?o=app');
  assert.equal(rutaEnlaceResenas('mi-estudio', 'qr'), '/resena/mi-estudio');
});

test('solo se pinta una ruta de reseñas de ESTA app, nunca una URL entera', async () => {
  const { esRutaDeResenas } = await import('./premio.ts');
  for (const bien of ['/resena/mi-estudio', '/resena/mi-estudio?o=app', '/resena/a']) assert.equal(esRutaDeResenas(bien), true, bien);
  for (const mal of ['https://evil.example/resena/x', '//evil.example', '/resena/', '/resena/../admin', '/resena/x?o=app&y=1', '/resena/X', 'javascript:alert(1)', '', null, 42, undefined]) {
    assert.equal(esRutaDeResenas(mal), false, String(mal));
  }
});
