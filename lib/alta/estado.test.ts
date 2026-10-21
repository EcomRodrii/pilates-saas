import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVISO_SIN_CLASE_AL_COMPARTIR, avisoAlCompartir, leerEstadoAlta, type EstadoAlta } from './estado.ts';
import { AVISO_SIN_CLASE_FUTURA, DONDE_SE_ARREGLA, avisoDeClase } from './aviso-clase.ts';
import { AVISO_VENTA_SIN_STRIPE } from '../onboarding.ts';
import { hrefDeTarjeta } from '../configuracion/destino.ts';

// Lo que contesta GET /api/alta/estado (PR-5), leído sin dar nada por hecho, y
// el aviso de «qué falta para poder reservar».

const BUENO: EstadoAlta = {
  claseReservable: false,
  avisoClase: null,
  enlaceCompartido: true,
  alumnas: false,
  primeraReserva: false,
  recorridoVisto: true,
  planEnsenado: false,
  sedesAbiertas: 1,
  foundingGratis: true,
};

test('una respuesta buena se lee tal cual', () => {
  assert.deepEqual(leerEstadoAlta(BUENO), BUENO);
});

test('lo que no es nuestra respuesta es «no se sabe»: ni marca nada ni da nada por visto', () => {
  // Los e2e mockean /api/** como {}: no puede dar el recorrido por visto ni el plan por enseñado.
  assert.equal(leerEstadoAlta({}), null);
  assert.equal(leerEstadoAlta(null), null);
  assert.equal(leerEstadoAlta([]), null);
  assert.equal(leerEstadoAlta('sí'), null);
  assert.equal(leerEstadoAlta({ error: 'No autorizado' }), null);
});

test('cada campo, solo con su forma: lo raro cuenta como «no»', () => {
  const raro = leerEstadoAlta({ claseReservable: true, enlaceCompartido: 'true', alumnas: 1, sedesAbiertas: -3, avisoClase: { texto: 'x', href: 'https://fuera' } });
  assert.ok(raro);
  assert.equal(raro.enlaceCompartido, false);
  assert.equal(raro.alumnas, false);
  assert.equal(raro.sedesAbiertas, 1);
  assert.equal(raro.avisoClase, null, 'un enlace que no es del panel no se pinta');
  // Con la clase reservable, ningún aviso de «qué falta».
  const conSi = leerEstadoAlta({ ...BUENO, claseReservable: true, avisoClase: { texto: 'Algo', href: '/calendario' } });
  assert.equal(conSi!.avisoClase, null);
});

test('antes de compartir: si no se puede reservar, se dice por qué; si no se sabe, nada', () => {
  assert.equal(avisoAlCompartir(undefined), null);
  assert.equal(avisoAlCompartir(null), null);
  assert.equal(avisoAlCompartir({ ...BUENO, claseReservable: true }), null);
  assert.equal(avisoAlCompartir(BUENO), AVISO_SIN_CLASE_AL_COMPARTIR);
  assert.equal(avisoAlCompartir({ ...BUENO, avisoClase: { texto: 'La página está oculta.', href: '/x' } }), 'La página está oculta.');
});

test('el aviso de la clase es la frase de «¡Listo!» y lleva a donde se arregla', () => {
  assert.equal(avisoDeClase({ estado: 'SI' }), null);
  assert.equal(avisoDeClase({ estado: 'SIN_COMPROBAR' }), null, 'sin poder preguntar no se inventa nada');
  assert.deepEqual(avisoDeClase({ estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' }), {
    texto: AVISO_VENTA_SIN_STRIPE, href: hrefDeTarjeta('integracion-stripe'),
  });
  assert.equal(avisoDeClase({ estado: 'NO', motivo: 'SIN_CLASE_FUTURA' })!.texto, AVISO_SIN_CLASE_FUTURA);
  assert.equal(avisoDeClase({ estado: 'NO', motivo: 'CIERRE' })!.href, '/calendario');
  assert.equal(avisoDeClase({ estado: 'SIN_COMPROBAR', motivo: 'STRIPE' })!.href, hrefDeTarjeta('integracion-stripe'));
});

test('los enlaces de «dónde se arregla» son los del catálogo de Configuración', () => {
  assert.equal(DONDE_SE_ARREGLA.PAGINA_OCULTA, hrefDeTarjeta('pagina-publica'));
  assert.equal(DONDE_SE_ARREGLA.STRIPE_SIN_CUENTA, hrefDeTarjeta('integracion-stripe'));
  for (const href of Object.values(DONDE_SE_ARREGLA)) assert.ok(href.startsWith('/'), href);
});
