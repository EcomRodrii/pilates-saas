import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirEstadoEstudio, contarConCandidatosNetwork, tituloDecidir } from './estado-estudio.ts';

const SUFIJO = 'te proponemos profesionales de Tentare Network';

test('Network: sufijo en la MISMA línea de clases sin cubrir, sin sumar al contador ni crear otra', () => {
  const e = construirEstadoEstudio({ sustitucionesPorDecidir: 3, sustitucionesConNetwork: 2, reservasPorAprobar: 1 });
  assert.deepEqual(e.decidir.map(l => l.id), ['sustitucionesPorDecidir', 'reservasPorAprobar']);
  assert.equal(e.decidir[0].texto, `3 clases sin cubrir necesitan que decidas — en 2 ${SUFIJO}`);
  assert.equal(e.decidir[0].n, 3);
  assert.equal(e.nDecidir, 4);
  assert.equal(e.titulo, '4 cosas esperan tu visto bueno');
});

test('Network: singular y plural del sufijo (cuenta clases, nunca nombres)', () => {
  const una = construirEstadoEstudio({ sustitucionesPorDecidir: 1, sustitucionesConNetwork: 1 });
  assert.equal(una.decidir[0].texto, `Una clase sin cubrir necesita que decidas — ${SUFIJO}`);
  assert.equal(una.nDecidir, 1);
  const enUna = construirEstadoEstudio({ sustitucionesPorDecidir: 3, sustitucionesConNetwork: 1 });
  assert.equal(enUna.decidir[0].texto, `3 clases sin cubrir necesitan que decidas — en 1 ${SUFIJO}`);
  assert.equal(enUna.nDecidir, 3);
});

test('Network: sin sufijo con 0, undefined (sin permiso) o null (falló)', () => {
  for (const sustitucionesConNetwork of [0, undefined, null]) {
    const e = construirEstadoEstudio({ sustitucionesPorDecidir: 2, sustitucionesConNetwork });
    assert.equal(e.decidir[0].texto, '2 clases sin cubrir necesitan que decidas');
    assert.equal(e.nDecidir, 2);
  }
});

test('Network: nunca dice «en 3» de 2 clases, y sin clases por decidir no crea nada', () => {
  const e = construirEstadoEstudio({ sustitucionesPorDecidir: 2, sustitucionesConNetwork: 5 });
  assert.equal(e.decidir[0].texto, `2 clases sin cubrir necesitan que decidas — en 2 ${SUFIJO}`);
  const vacio = construirEstadoEstudio({ sustitucionesPorDecidir: 0, sustitucionesConNetwork: 1 });
  assert.deepEqual(vacio.decidir, []);
  assert.equal(vacio.nDecidir, 0);
  assert.doesNotMatch(vacio.titulo, /todo|bajo control|en orden|nada pendiente/i);
});

test('Network: solo cuenta arrays jsonb NO vacíos (NULL = no se buscó)', () => {
  assert.equal(contarConCandidatosNetwork([
    { candidatos_network: null },
    { candidatos_network: [] },
    { candidatos_network: [{ perfilId: 'p1' }] },
    { candidatos_network: {} },
    {},
  ]), 1);
});

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
  const e = construirEstadoEstudio({ penalizacionesPorAprobar: 1, devolucionesPorRevisar: 1, canjesPorEntregar: 1, bajasPorRevisar: 1 });
  assert.ok(e.decidir.every(l => l.href === null));
});

test('las bajas de última hora del equipo esperan decisión, van las últimas y sin palabras de sanción', () => {
  const e = construirEstadoEstudio({ bajasPorRevisar: 2, sustitucionesPorDecidir: 1, canjesPorEntregar: 1 });
  assert.deepEqual(e.decidir.map(l => l.id), ['sustitucionesPorDecidir', 'canjesPorEntregar', 'bajasPorRevisar']);
  assert.equal(e.nDecidir, 4);
  const linea = e.decidir.find(l => l.id === 'bajasPorRevisar')!;
  assert.equal(linea.texto, '2 bajas de última hora del equipo por revisar');
  assert.doesNotMatch(linea.texto, /sanci|penaliz|falta|justific/i);
  assert.equal(construirEstadoEstudio({ bajasPorRevisar: 1 }).decidir[0].texto, 'Una baja de última hora del equipo por revisar');
});
