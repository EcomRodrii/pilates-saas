import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  huecosDeSesiones, mesDe, rangoDePlazasLibres, resumirFranjas, semanaDe, textoFranja,
  type ReservaParaHuecos, type SesionParaHuecos,
} from './plazas-libres.ts';
import type { PlazaFija } from '../types.ts';

// Martes de noviembre de 2026 a las 18:00 de Madrid (17:00Z, ya en horario de invierno).
const MARTES = ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24'];
const AHORA = Date.parse('2026-10-13T10:00:00Z');

const sesion = (id: string, ymd: string, extra: Partial<SesionParaHuecos> = {}): SesionParaHuecos => ({
  id, inicio: `${ymd}T17:00:00.000Z`, fin: `${ymd}T17:50:00.000Z`, salaId: 'sala-r', tipoClaseId: 'tc-reformer',
  aforoMaximo: 8, cancelada: false, ...extra,
});
const res = (sesionId: string, socioId: string | null, estado = 'CONFIRMADA'): ReservaParaHuecos => ({ sesionId, socioId, estado });
const fija = (socioId: string, extra: Partial<PlazaFija> = {}): PlazaFija => ({
  id: `pf-${socioId}`, studioId: 's', socioId, diaSemana: 2, horaInicio: '18:00:00', salaId: 'sala-r', tipoClaseId: 'tc-reformer',
  spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', ...extra,
});
const sinApartadas = new Map<string, number>();

test('libres ahora: aforo − ocupadas − apartadas, nunca menos de 0; la espera y las pendientes no ocupan', () => {
  const s = sesion('a', MARTES[0]);
  const reservas = [
    ...['x1', 'x2', 'x3', 'x4', 'x5'].map(x => res('a', x)),
    res('a', 'e1', 'LISTA_ESPERA'), res('a', 'e2', 'LISTA_ESPERA'), res('a', 'p1', 'PENDIENTE_APROBACION'), res('a', 'c1', 'CANCELADA'),
  ];
  const [h] = huecosDeSesiones({ sesiones: [s], reservas, plazas: [], apartadas: new Map([['a', 2]]), ahoraMs: AHORA });
  assert.deepEqual([h.aforo, h.ocupadas, h.apartadas, h.libres, h.enEspera, h.porAprobar], [8, 5, 2, 1, 2, 1]);
  const [lleno] = huecosDeSesiones({ sesiones: [s], reservas, plazas: [], apartadas: new Map([['a', 9]]), ahoraMs: AHORA });
  assert.equal(lleno.libres, 0);
});

test('para una clase fija: resta las fijas que aún no tienen su reserva, nunca las ya reservadas', () => {
  const s = sesion('a', MARTES[0]);
  // Ana ya tiene su reserva de la clase fija (res-pf-…): está en «ocupadas» y no se cuenta dos veces.
  const reservas = [res('a', 'ana'), res('a', 'x')];
  const plazas = [fija('ana'), fija('bea'), fija('carla')];
  const [h] = huecosDeSesiones({ sesiones: [s], reservas, plazas, apartadas: sinApartadas, ahoraMs: AHORA });
  assert.equal(h.libres, 6);
  assert.equal(h.fijasPorVenir, 2, 'Bea y Carla aún no tienen su reserva');
  assert.equal(h.paraFija, 4);
});

test('una alumna con clase fija que canceló esa semana no resta (ya tiene su fila)', () => {
  const s = sesion('a', MARTES[0]);
  const [h] = huecosDeSesiones({ sesiones: [s], reservas: [res('a', 'bea', 'CANCELADA')], plazas: [fija('bea')], apartadas: sinApartadas, ahoraMs: AHORA });
  assert.equal(h.fijasPorVenir, 0);
  assert.equal(h.paraFija, 8);
});

test('pausas: con fechas no resta esas semanas; PAUSADA (soltó el sitio) resta desde el día siguiente a su vuelta', () => {
  const sesiones = MARTES.map((d, i) => sesion(`s${i}`, d));
  const plazas = [
    fija('ana', { pausaDesde: '2026-11-01', pausaHasta: '2026-11-12' }),
    fija('bea', { estado: 'PAUSADA', pausaDesde: '2026-10-01', pausaHasta: '2026-11-17' }),
  ];
  const h = huecosDeSesiones({ sesiones, reservas: [], plazas, apartadas: sinApartadas, ahoraMs: AHORA });
  assert.deepEqual(h.map(x => x.fijasPorVenir), [0, 0, 1, 2], 'Ana vuelve el 17; Bea, el 24');
  assert.deepEqual(h.map(x => x.vuelvenDePausa), [0, 0, 0, 1]);
  // PAUSADA sin fechas: el peor caso, cuenta siempre.
  const sinFechas = huecosDeSesiones({ sesiones, reservas: [], plazas: [fija('carla', { estado: 'PAUSADA' })], apartadas: sinApartadas, ahoraMs: AHORA });
  assert.deepEqual(sinFechas.map(x => x.fijasPorVenir), [1, 1, 1, 1]);
});

test('la vigencia y el tipo: ni antes de «desde», ni después de «hasta», ni en otro tipo de clase; BAJA nunca', () => {
  const sesiones = MARTES.map((d, i) => sesion(`s${i}`, d));
  const plazas = [
    fija('ana', { vigenciaDesde: '2026-11-10', vigenciaHasta: '2026-11-17' }),
    fija('bea', { tipoClaseId: 'tc-mat' }),
    fija('carla', { estado: 'BAJA' }),
  ];
  const h = huecosDeSesiones({ sesiones, reservas: [], plazas, apartadas: sinApartadas, ahoraMs: AHORA });
  assert.deepEqual(h.map(x => x.fijasPorVenir), [0, 1, 1, 0]);
});

test('solo las clases que aún no han empezado, en orden; una cancelada no tiene plazas libres', () => {
  const sesiones = [sesion('b', MARTES[1]), sesion('pasada', '2026-10-06'), sesion('a', MARTES[0], { cancelada: true })];
  const h = huecosDeSesiones({ sesiones, reservas: [], plazas: [], apartadas: sinApartadas, ahoraMs: AHORA });
  assert.deepEqual(h.map(x => x.id), ['a', 'b']);
  assert.equal(h[0].libres, 0);
});

test('por franja: «sitio en todas», «a partir del…», «en 2 de 4» y «sin sitio», con las canceladas fuera', () => {
  const sesiones = MARTES.map((d, i) => sesion(`s${i}`, d, { aforoMaximo: 2 }));
  const lleno = (ids: string[]) => ids.flatMap(id => [res(id, `${id}-1`), res(id, `${id}-2`)]);
  const resumir = (reservas: ReservaParaHuecos[], extra: SesionParaHuecos[] = sesiones) =>
    resumirFranjas(huecosDeSesiones({ sesiones: extra, reservas, plazas: [], apartadas: sinApartadas, ahoraMs: AHORA }), { hasta: '2026-11-30' })[0];

  const todas = resumir([]);
  assert.equal(todas.estado, 'TODAS');
  assert.equal(textoFranja(todas), 'Sitio en todas sus clases (mín. 2)');

  const desde = resumir(lleno(['s0', 's1']));
  assert.equal(desde.estado, 'DESDE');
  assert.equal(desde.desde, '2026-11-17');
  assert.equal(textoFranja(desde), 'Sitio del 17/11 al 24/11', 'con sus dos extremos: no «para siempre»');

  const algunas = resumir(lleno(['s1', 's3']));
  assert.equal(algunas.estado, 'ALGUNAS');
  assert.equal(textoFranja(algunas), 'Sitio en 2 de sus 4 clases');

  const nada = resumir(lleno(['s0', 's1', 's2', 's3']));
  assert.equal(textoFranja(nada), 'Sin sitio para otra clase fija', 'nunca «completa»: puede quedar sitio para una reserva suelta');

  // Una cancelada (un festivo) no rompe «todas»: no cuenta.
  const conFestivo = resumir([], sesiones.map((s, i) => (i === 1 ? { ...s, cancelada: true } : s)));
  assert.equal(conFestivo.estado, 'TODAS');
  assert.equal(conFestivo.n, 3);
  assert.equal(conFestivo.clases.length, 4);
});

test('si la franja deja de tener clases antes del final del rango, se dice hasta cuándo las hay', () => {
  const sesiones = MARTES.slice(0, 2).map((d, i) => sesion(`s${i}`, d));
  const [f] = resumirFranjas(huecosDeSesiones({ sesiones, reservas: [], plazas: [], apartadas: sinApartadas, ahoraMs: AHORA }), { hasta: '2026-11-30' });
  assert.equal(f.programadasHasta, '2026-11-10');
  assert.equal(textoFranja(f), 'Sitio en sus 2 clases (hasta el 10/11)', '«todas» con 2 clases se leía como «todo el mes»');
  const [g] = resumirFranjas(huecosDeSesiones({ sesiones: MARTES.map((d, i) => sesion(`s${i}`, d)), reservas: [], plazas: [], apartadas: sinApartadas, ahoraMs: AHORA }), { hasta: '2026-11-30' });
  assert.equal(g.programadasHasta, null);
});

test('el martes de las 18:00 es una sola franja al cruzar el cambio de hora (16:00Z en octubre, 17:00Z en noviembre)', () => {
  const sesiones = [
    sesion('oct', '2026-10-20', { inicio: '2026-10-20T16:00:00.000Z' }),
    sesion('nov', '2026-11-03'),
  ];
  const f = resumirFranjas(huecosDeSesiones({ sesiones, reservas: [], plazas: [], apartadas: sinApartadas, ahoraMs: AHORA }), { hasta: '2026-11-30' });
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].dow, f[0].hora, f[0].n], [2, '18:00', 2]);
});

test('una clase a las 00:30 de Madrid cae en su día de Madrid', () => {
  // Miércoles 4-nov a las 00:30 de Madrid = martes 3-nov a las 23:30Z.
  const [f] = resumirFranjas(huecosDeSesiones({
    sesiones: [sesion('n', '2026-11-03', { inicio: '2026-11-03T23:30:00.000Z' })], reservas: [], plazas: [], apartadas: sinApartadas, ahoraMs: AHORA,
  }), { hasta: '2026-11-30' });
  assert.deepEqual([f.dow, f.hora, f.clases[0].fecha], [3, '00:30', '2026-11-04']);
});

test('semana y mes del estudio, sin el reloj del navegador', () => {
  assert.deepEqual(semanaDe('2026-11-04'), { desde: '2026-11-02', hasta: '2026-11-08' });
  assert.deepEqual(semanaDe('2026-11-08'), { desde: '2026-11-02', hasta: '2026-11-08' });
  assert.deepEqual(mesDe('2026-11-15'), { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(mesDe('2028-02-10'), { desde: '2028-02-01', hasta: '2028-02-29' });
});

test('el rango: fechas reales, en orden, como mucho 31 días, y recortado a hoy', () => {
  const hoy = '2026-10-13';
  assert.deepEqual(rangoDePlazasLibres('2026-11-01', '2026-11-30', hoy), { ok: true, desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(rangoDePlazasLibres('2026-10-01', '2026-10-31', hoy), { ok: true, desde: '2026-10-13', hasta: '2026-10-31' });
  assert.equal(rangoDePlazasLibres('2027-02-30', '2027-03-02', hoy).ok, false);
  assert.equal(rangoDePlazasLibres('2026-11-30', '2026-11-01', hoy).ok, false);
  assert.equal(rangoDePlazasLibres('2026-11-01', '2026-12-15', hoy).ok, false);
  assert.equal(rangoDePlazasLibres('2026-09-01', '2026-09-30', hoy).ok, false);
  assert.equal(rangoDePlazasLibres('2028-01-01', '2028-01-31', hoy).ok, false);
  assert.equal(rangoDePlazasLibres(undefined, '2026-11-01', hoy).ok, false);
});

test('una plaza ofrecida a la lista de espera: ocupa solo si el estudio lo eligió y mientras corre su plazo', () => {
  const s = sesion('a', MARTES[0]);
  const reservas = [
    res('a', 'x'),
    { sesionId: 'a', socioId: 'e1', estado: 'LISTA_ESPERA', ofertaExpiraEn: '2026-10-13T12:00:00Z' }, // oferta viva
    { sesionId: 'a', socioId: 'e2', estado: 'LISTA_ESPERA', ofertaExpiraEn: '2026-10-13T09:00:00Z' }, // caducada
    res('a', 'e3', 'LISTA_ESPERA'),
  ];
  const [sin] = huecosDeSesiones({ sesiones: [s], reservas, plazas: [], apartadas: sinApartadas, ahoraMs: AHORA });
  assert.deepEqual([sin.ocupadas, sin.enEspera, sin.libres], [1, 3, 7]);
  const [con] = huecosDeSesiones({ sesiones: [s], reservas, plazas: [], apartadas: sinApartadas, ahoraMs: AHORA, ofertaOcupa: true });
  assert.deepEqual([con.ocupadas, con.enEspera, con.libres], [2, 2, 6]);
  assert.equal(sin.ofrecidas, 1);
  assert.equal(con.ofrecidas, 1, 'se cuenta aparte, para decir por qué ocupa');
});

test('una franja con una sola clase dice cuántos sitios tiene su única clase', () => {
  const [f] = resumirFranjas(huecosDeSesiones({ sesiones: [sesion('a', MARTES[3], { aforoMaximo: 3 })], reservas: [], plazas: [], apartadas: sinApartadas, ahoraMs: AHORA }), { hasta: '2026-11-30' });
  assert.equal(textoFranja(f), '3 sitios en su única clase');
});

test('una fecha que pasa la forma pero no existe (mes 13, día 32) da «no válida», sin lanzar', () => {
  for (const f of ['2026-13-01', '2026-00-10', '2026-12-32']) assert.equal(rangoDePlazasLibres(f, f, '2026-10-13').ok, false, f);
});

test('una clase cancelada no guarda el sitio de nadie', () => {
  const [h] = huecosDeSesiones({ sesiones: [sesion('a', MARTES[0], { cancelada: true })], reservas: [], plazas: [fija('bea')], apartadas: sinApartadas, ahoraMs: AHORA });
  assert.equal(h.fijasPorVenir, 0);
});

test('sitio solo en la última clase: «sitio solo el 24/11», no «del 24/11 al 24/11»', () => {
  const sesiones = MARTES.map((d, i) => sesion(`s${i}`, d, { aforoMaximo: 1 }));
  const reservas = ['s0', 's1', 's2'].map(id => res(id, `${id}-x`));
  const [f] = resumirFranjas(huecosDeSesiones({ sesiones, reservas, plazas: [], apartadas: sinApartadas, ahoraMs: AHORA }), { hasta: '2026-11-30' });
  assert.equal(textoFranja(f), 'Sitio solo el 24/11');
});
