import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCLA_DECIDIR, construirEstadoEstudio, contarConCandidatosNetwork, tituloDecidir } from './estado-estudio.ts';

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
  const e = construirEstadoEstudio({ reservasPorAprobar: 1, penalizacionesPorAprobar: 1, devolucionesPorRevisar: 1, canjesPorEntregar: 1, bajasPorRevisar: 1 });
  assert.equal(e.decidir.length, 5);
  assert.ok(e.decidir.every(l => l.href === null));
});

test('las reservas por aprobar se deciden en la bandeja: sin enlace a /calendario y con ancla a su tarjeta', () => {
  const e = construirEstadoEstudio({ reservasPorAprobar: 2, sustitucionesPorDecidir: 1 });
  const linea = e.decidir.find(l => l.id === 'reservasPorAprobar')!;
  assert.equal(linea.href, null);
  assert.equal(linea.texto, '2 reservas esperan tu aprobación');
  assert.equal(ANCLA_DECIDIR.reservasPorAprobar, 'decidir-reservas');
  // Sigue contando como decisión, y sigue sin afirmar «todo bien».
  assert.equal(e.nDecidir, 3);
  assert.doesNotMatch(e.titulo, /todo|bajo control|en orden|nada pendiente/i);
});

test('ninguna línea de «Decidir» sin enlace se queda sin tarjeta a la que saltar', () => {
  const todas = construirEstadoEstudio({
    sustitucionesPorDecidir: 1, reservasPorAprobar: 1, recibosFallidos: 1, penalizacionesPorAprobar: 1,
    devolucionesPorRevisar: 1, automatizacionesEsperando: 1, canjesPorEntregar: 1, bajasPorRevisar: 1,
    seriesPorRenovar: 1, alertasApertura: 1,
  });
  const sinEnlace = todas.decidir.filter(l => l.href === null);
  assert.ok(sinEnlace.length > 0);
  for (const l of sinEnlace) assert.ok(ANCLA_DECIDIR[l.id], `«${l.id}» no tiene enlace ni tarjeta`);
  const anclas = Object.values(ANCLA_DECIDIR);
  assert.equal(new Set(anclas).size, anclas.length, 'dos tarjetas no pueden compartir ancla');
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

test('las clases que se repiten y se acaban esperan decisión en su tarjeta, antes que los canjes', () => {
  const e = construirEstadoEstudio({ seriesPorRenovar: 2, canjesPorEntregar: 1, automatizacionesEsperando: 1 });
  assert.deepEqual(e.decidir.map(l => l.id), ['automatizacionesEsperando', 'seriesPorRenovar', 'canjesPorEntregar']);
  const linea = e.decidir.find(l => l.id === 'seriesPorRenovar')!;
  assert.equal(linea.href, null);
  assert.equal(linea.texto, '2 clases que se repiten están a punto de terminar');
  assert.equal(ANCLA_DECIDIR.seriesPorRenovar, 'decidir-series');
  assert.equal(construirEstadoEstudio({ seriesPorRenovar: 1 }).decidir[0].texto, 'Una clase que se repite está a punto de terminar');
});

test('las alertas de apertura esperan a la propietaria y saltan a su tarjeta de Resumen', () => {
  const e = construirEstadoEstudio({ alertasApertura: 2, recibosFallidos: 1 });
  assert.deepEqual(e.decidir.map(l => l.id), ['alertasApertura', 'recibosFallidos']);
  assert.equal(e.decidir[0].texto, 'Tu apertura tiene 2 avisos');
  assert.equal(construirEstadoEstudio({ alertasApertura: 1 }).decidir[0].texto, 'Tu apertura tiene un aviso');
  assert.equal(ANCLA_DECIDIR.alertasApertura, 'decidir-apertura');
});

test('jornadas del equipo sin cerrar: van a Decidir, cuentan en el contador y llevan a Tiempo trabajado', () => {
  const e = construirEstadoEstudio({ jornadasPorRevisar: 2 });
  assert.equal(e.nDecidir, 2);
  assert.deepEqual(e.decidir, [{ id: 'jornadasPorRevisar', n: 2, href: '/equipo/tiempo-trabajado', texto: '2 jornadas del equipo sin cerrar por revisar' }]);
  assert.equal(construirEstadoEstudio({ jornadasPorRevisar: 1 }).decidir[0].texto, 'Una jornada del equipo sin cerrar por revisar');
  // Falló o no lo puede ver: ni línea ni cifra.
  assert.equal(construirEstadoEstudio({ jornadasPorRevisar: null, recibosFallidos: 1 }).nDecidir, 1);
  assert.equal(construirEstadoEstudio({ jornadasPorRevisar: undefined }).aplica, false);
});


test('clases que el equipo dijo no dar: van a decidir y llevan a Tiempo trabajado', () => {
  const e = construirEstadoEstudio({ clasesNoDadasPorRevisar: 3 });
  assert.deepEqual(e.decidir, [{ id: 'clasesNoDadasPorRevisar', n: 3, href: '/equipo/tiempo-trabajado', texto: '3 clases que el equipo dijo no dar' }]);
  assert.equal(construirEstadoEstudio({ clasesNoDadasPorRevisar: 1 }).decidir[0].texto, 'Una clase que una instructora dijo no dar');
  assert.equal(construirEstadoEstudio({ clasesNoDadasPorRevisar: undefined }).aplica, false);
});
