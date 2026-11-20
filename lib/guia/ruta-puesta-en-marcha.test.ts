import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASOS_RUTA, hrefPaso, pasoPedido, rutaPuestaEnMarcha, siguienteBase, type DatosRuta } from './ruta-puesta-en-marcha.ts';
import { calcularOnboarding, type DatosOnboarding } from '../onboarding.ts';

const nada: DatosRuta = {
  salas: false, instructoras: false, tipos: false, horario: false, tarifas: false,
  cobros: false, marca: false, alumnas: false, compartir: false, primeraReserva: false,
};

test('un estudio recién creado: diez pasos, ninguno hecho, el primero es la sala', () => {
  const r = rutaPuestaEnMarcha(nada);
  assert.equal(r.total, 10);
  assert.equal(r.hechos, 0);
  assert.equal(r.ahora?.id, 'salas');
  assert.equal(r.etiqueta, 'Paso 1 de 10');
  assert.deepEqual(r.faltanBases.map(p => p.id), ['salas', 'instructoras', 'tipos']);
  assert.equal(siguienteBase(r)?.id, 'salas');
});

test('el siguiente es el primero sin hacer, no el último', () => {
  const r = rutaPuestaEnMarcha({ ...nada, salas: true, tipos: true });
  assert.equal(r.ahora?.id, 'instructoras');
  assert.equal(r.etiqueta, 'Paso 2 de 10');
  assert.equal(siguienteBase(r)?.id, 'instructoras');
});

test('saltar un paso saltable pasa al siguiente pero NO lo da por hecho', () => {
  const base = { ...nada, salas: true, instructoras: true, tipos: true, horario: true };
  const r = rutaPuestaEnMarcha({ ...base, saltados: ['tarifas'] });
  assert.equal(r.ahora?.id, 'cobros');
  assert.equal(r.pasos.find(p => p.id === 'tarifas')?.estado, 'saltado');
  assert.equal(r.hechos, 4);
});

test('lo que no se puede saltar no se salta aunque lo pidan', () => {
  const r = rutaPuestaEnMarcha({ ...nada, saltados: ['salas', 'alumnas'] });
  assert.equal(r.ahora?.id, 'salas');
});

test('todo hecho: terminada y sin siguiente', () => {
  const r = rutaPuestaEnMarcha({
    salas: true, instructoras: true, tipos: true, horario: true, tarifas: true,
    cobros: true, marca: true, alumnas: true, compartir: true, primeraReserva: true,
  });
  assert.equal(r.terminada, true);
  assert.equal(r.ahora, null);
  assert.equal(r.etiqueta, '10 de 10 hechos');
  assert.equal(siguienteBase(r), null);
});

test('pasoPedido: el de la dirección, y si no existe, el que toca', () => {
  const r = rutaPuestaEnMarcha({ ...nada, salas: true });
  assert.equal(pasoPedido(r, 'marca')?.id, 'marca');
  assert.equal(pasoPedido(r, 'inventado')?.id, 'instructoras');
  assert.equal(pasoPedido(r, null)?.id, 'instructoras');
});

test('los textos caben y son honestos: una frase, dos o tres líneas, enlaces del panel', () => {
  const ids = new Set<string>();
  for (const p of PASOS_RUTA) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(p.titulo.length <= 40, p.titulo);
    assert.ok(p.que.length <= 130, `«que» largo: ${p.id}`);
    assert.ok(p.porque.length <= 130, `«porque» largo: ${p.id}`);
    assert.ok(p.como.length >= 2 && p.como.length <= 3, p.id);
    if (p.boton && 'href' in p.boton) assert.ok(p.boton.href.startsWith('/'), p.id);
    assert.ok(hrefPaso(p.id).includes(p.id));
    // Lo que se puede saltar dice qué pasa si se salta; lo que no, no lo promete.
    assert.equal(!!p.siSaltas, p.saltable, p.id);
  }
});

test('cada paso con datos se marca con un paso que calcularOnboarding conoce (mismas fuentes)', () => {
  const vacio: DatosOnboarding = {
    nif: null, stripeAccountId: null, slug: 'estudio', colorPrimario: null, temaPortal: null, logoUrl: null,
    numInstructores: 0, numInstructoresConCuenta: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0, numSalas: 0,
    numPlanesTarifa: 0, numSuscripcionesActivas: 0, numReservas: 0, hayTarjetaEnLaApp: false, automatizacionesActivas: new Set(),
  };
  const ids = new Set(calcularOnboarding(vacio).categorias.flatMap(c => c.pasos.map(p => p.id)));
  for (const id of ['salas', 'instructor', 'clase', 'horario', 'bonos', 'stripe', 'marca', 'clientes']) assert.ok(ids.has(id), id);
});
