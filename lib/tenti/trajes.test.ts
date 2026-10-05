// La temporada de los trajes, en hora de Madrid. Los bordes son los que se
// equivocan: el primer y el último segundo del día en Madrid caen en otro día
// en UTC, y el 25-oct-2026 Madrid pasa de CEST (+2) a CET (+1) en mitad de la
// temporada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAVE_TRAJE, SIN_TRAJE, TRAJES, enTemporada, esTraje, mesDiaEnMadrid, trajeDeTemporada, trajeElegido, type DefTraje } from './trajes.ts';

const en = (iso: string) => trajeDeTemporada(new Date(iso));

test('la temporada del gorro: del 5 de octubre al 1 de noviembre, ambos incluidos', () => {
  assert.deepEqual(TRAJES.bruja.temporada, { desde: '10-05', hasta: '11-01' });
});

test('empieza a las 00:00 del 5 de octubre en Madrid (22:00 UTC del 4, en verano)', () => {
  assert.equal(en('2026-10-04T21:59:59Z'), null, '23:59:59 CEST del 4 de octubre: aún no');
  assert.equal(en('2026-10-04T22:00:00Z'), 'bruja', '00:00 CEST del 5 de octubre');
  assert.equal(en('2026-10-05T12:00:00Z'), 'bruja');
});

test('el cambio de hora del 25 de octubre no lo saca de la temporada', () => {
  // 03:00 CEST → 02:00 CET: la hora repetida, y los minutos de alrededor.
  for (const iso of ['2026-10-25T00:30:00Z', '2026-10-25T01:00:00Z', '2026-10-25T01:30:00Z', '2026-10-25T02:30:00Z']) {
    assert.equal(en(iso), 'bruja', iso);
  }
  assert.equal(mesDiaEnMadrid(new Date('2026-10-24T22:30:00Z')), '10-25', '00:30 CEST del 25 ya es 25 en Madrid');
});

test('acaba a las 23:59:59 del 1 de noviembre en Madrid (22:59:59 UTC, ya en invierno)', () => {
  assert.equal(en('2026-11-01T22:59:59Z'), 'bruja', '23:59:59 CET del 1 de noviembre');
  assert.equal(en('2026-11-01T23:00:00Z'), null, '00:00 CET del 2 de noviembre');
  // En UTC el 1-nov a las 23:30 aún sería «día 1»: la cuenta es la de Madrid.
  assert.equal(en('2026-11-01T23:30:00Z'), null);
});

test('fuera de temporada, sin traje', () => {
  for (const iso of ['2026-01-15T12:00:00Z', '2026-07-01T12:00:00Z', '2026-09-30T12:00:00Z', '2026-12-24T12:00:00Z']) {
    assert.equal(en(iso), null, iso);
  }
});

test('otro año, los mismos bordes', () => {
  // 2027: el cambio de hora es el 31 de octubre.
  assert.equal(en('2027-10-04T21:59:59Z'), null);
  assert.equal(en('2027-10-04T22:00:00Z'), 'bruja');
  assert.equal(en('2027-10-31T01:30:00Z'), 'bruja');
  assert.equal(en('2027-11-01T22:59:59Z'), 'bruja');
  assert.equal(en('2027-11-01T23:00:00Z'), null);
});

test('una temporada que cruza el año (de prueba: 15-dic → 6-ene) funciona', () => {
  const navidad = { desde: '12-15', hasta: '01-06' } as const;
  for (const md of ['12-15', '12-31', '01-01', '01-06']) assert.ok(enTemporada(md, navidad), md);
  for (const md of ['12-14', '01-07', '07-01']) assert.ok(!enTemporada(md, navidad), md);
  const trajes: Record<string, DefTraje> = { navidad: { etiqueta: 'Gorro de Navidad', temporada: navidad, colores: { a: '#000001', b: '#000002' } } };
  assert.equal(trajeDeTemporada(new Date('2026-12-31T23:30:00Z'), trajes), 'navidad', '00:30 del 1-ene en Madrid');
  assert.equal(trajeDeTemporada(new Date('2027-01-06T22:59:59Z'), trajes), 'navidad');
  assert.equal(trajeDeTemporada(new Date('2027-01-06T23:00:00Z'), trajes), null);
});

test("lo que elige este navegador: 'ninguno', un traje (en cualquier época) o el de temporada", () => {
  const fuera = new Date('2026-07-01T12:00:00Z');
  const dentro = new Date('2026-10-20T12:00:00Z');
  assert.equal(CLAVE_TRAJE, 'tenti-traje');
  assert.equal(trajeElegido(SIN_TRAJE, dentro), null, "'ninguno' quita el de temporada");
  assert.equal(trajeElegido('bruja', fuera), 'bruja', 'forzado, también fuera de temporada');
  for (const otro of [null, undefined, '', 'basura', 'toString', '__proto__']) {
    assert.equal(trajeElegido(otro, dentro), 'bruja', `${String(otro)} → el de temporada`);
    assert.equal(trajeElegido(otro, fuera), null, `${String(otro)} fuera de temporada → ninguno`);
  }
  assert.ok(esTraje('bruja'));
  assert.ok(!esTraje('constructor'), 'un nombre heredado de Object no es un traje');
});
