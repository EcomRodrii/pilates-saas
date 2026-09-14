import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirEstadoEstudio, tituloDecidir } from './estado-estudio.ts';

test('un rol que no ve ninguna fuente no recibe bandeja (instructora)', () => {
  const e = construirEstadoEstudio({});
  assert.equal(e.aplica, false);
  assert.equal(e.nDecidir, 0);
});

test('con permiso y todo a cero: aplica, sin líneas, y lo dice sin exagerar', () => {
  const e = construirEstadoEstudio({ reservasPorAprobar: 0, sustitucionesPorDecidir: 0, sustitucionesBuscando: 0 });
  assert.equal(e.aplica, true);
  assert.deepEqual([e.decidir, e.enMarcha, e.resuelto], [[], [], []]);
  assert.equal(e.titulo, 'Nada espera tu visto bueno');
});

test('⚠️ nunca afirma «todo bien»: solo lo que cuenta (#1401, puente con el Centro de Control)', () => {
  // El ActionCenter, justo debajo, puede estar contando recomendaciones del
  // Decision OS que aquí no entran. Un «todo en orden» contradiría esa tarjeta.
  for (const n of [0, 1, 7]) {
    assert.doesNotMatch(tituloDecidir(n), /todo|bajo control|en orden|nada pendiente/i);
  }
});

test('una consulta que falla (null) no se enseña como cero ni cuenta', () => {
  const e = construirEstadoEstudio({ recibosFallidos: null, reservasPorAprobar: 2 });
  assert.equal(e.nDecidir, 2);
  assert.ok(!e.decidir.some(l => l.id === 'recibosFallidos'));
});

test('el contador suma solo lo que espera decisión, no lo que está en marcha ni lo resuelto', () => {
  const e = construirEstadoEstudio({
    reservasPorAprobar: 2, recibosFallidos: 1,
    sustitucionesBuscando: 3, sustitucionesCubiertas24h: 4,
  });
  assert.equal(e.nDecidir, 3);
  assert.equal(e.titulo, '3 cosas esperan tu visto bueno');
  assert.equal(e.enMarcha.length, 1);
  assert.equal(e.resuelto.length, 1);
});

test('singular y plural', () => {
  const uno = construirEstadoEstudio({ sustitucionesPorDecidir: 1, sustitucionesBuscando: 1 });
  assert.equal(uno.decidir[0].texto, 'Una clase sin cubrir necesita que decidas');
  assert.equal(uno.enMarcha[0].texto, 'Buscando sustituta para una clase');
  assert.equal(uno.titulo, 'Una cosa espera tu visto bueno');
  const dos = construirEstadoEstudio({ sustitucionesPorDecidir: 2 });
  assert.equal(dos.decidir[0].texto, '2 clases sin cubrir necesitan que decidas');
});

test('el orden es el de urgencia, no el de llegada de los datos', () => {
  const e = construirEstadoEstudio({ canjesPorEntregar: 1, recibosFallidos: 1, sustitucionesPorDecidir: 1 });
  assert.deepEqual(e.decidir.map(l => l.id), ['sustitucionesPorDecidir', 'recibosFallidos', 'canjesPorEntregar']);
});

test('lo que se resuelve en una tarjeta de la home no enlaza a otra pantalla', () => {
  const e = construirEstadoEstudio({ penalizacionesPorAprobar: 1, devolucionesPorRevisar: 1, canjesPorEntregar: 1 });
  assert.ok(e.decidir.every(l => l.href === null));
});
