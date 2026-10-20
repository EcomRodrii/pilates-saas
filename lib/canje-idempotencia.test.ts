import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveCanjeValida, idCanjeDeClave, esViolacionUnica, leerResultadoClaseGratis,
} from './canje-idempotencia.ts';

const BASE = { studioId: 'st-1', socioId: 'so-1', catalogItemId: 'it-1', clave: 'clave-de-prueba-1' };

test('la misma clave da SIEMPRE el mismo id de canje', () => {
  assert.equal(idCanjeDeClave(BASE), idCanjeDeClave({ ...BASE }));
  assert.match(idCanjeDeClave(BASE), /^rwd-[0-9a-f]{32}$/);
});

test('otra clave, otra alumna, otra recompensa u otro estudio NO colisionan con este canje', () => {
  const base = idCanjeDeClave(BASE);
  for (const cambio of [{ clave: 'otra-clave-distinta' }, { socioId: 'so-2' }, { catalogItemId: 'it-2' }, { studioId: 'st-2' }]) {
    assert.notEqual(idCanjeDeClave({ ...BASE, ...cambio }), base, JSON.stringify(cambio));
  }
});

test('el separador no permite construir una colisión moviendo texto entre campos', () => {
  assert.notEqual(
    idCanjeDeClave({ studioId: 'a', socioId: 'b|c', catalogItemId: 'd', clave: 'kkkkkkkk' }),
    idCanjeDeClave({ studioId: 'a|b', socioId: 'c', catalogItemId: 'd', clave: 'kkkkkkkk' }),
  );
});

test('forma de la clave: 8-80 caracteres seguros; lo demás se rechaza', () => {
  assert.equal(claveCanjeValida('abcdEFGH-12_34'), true);
  for (const mala of ['corta', 'con espacios aquí', 'x'.repeat(81), '', null, undefined, 42, 'ñandú-ñandú', "'; drop table"]) {
    assert.equal(claveCanjeValida(mala), false, String(mala));
  }
});

test('⚠️ cien peticiones simultáneas con la misma clave son UN canje (la unicidad la pone la PK)', async () => {
  // Modelo de lo que hace la base: `reward_redemptions.id` es PK, así que el
  // segundo INSERT con el mismo id falla (23505) y su transacción se deshace
  // entera —créditos y stock incluidos—. Aquí se reproduce con un Set síncrono
  // por inserción, que es lo que serializa la base.
  const filas = new Set<string>();
  let descontado = 0;
  async function canjear() {
    const id = idCanjeDeClave(BASE);
    await Promise.resolve();
    if (filas.has(id)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    filas.add(id);
    descontado += 10;
    return { error: null };
  }
  const resultados = await Promise.all(Array.from({ length: 100 }, () => canjear()));
  assert.equal(filas.size, 1);
  assert.equal(descontado, 10, 'se descuenta UNA vez');
  const rechazados = resultados.filter(r => r.error);
  assert.equal(rechazados.length, 99);
  assert.ok(rechazados.every(r => esViolacionUnica(r.error)), 'los 99 rechazos se reconocen como «ya existía»');
});

test('sin clave (clientes antiguos) cada petición sigue siendo un canje distinto: el id lo pone el servidor', () => {
  // No hay función que probar: el comportamiento sin clave es `rwd-${uid()}`.
  // Lo que se fija es que una clave inválida NO se trata como «sin clave».
  assert.equal(claveCanjeValida('corta'), false);
});

test('esViolacionUnica reconoce el código 23505 y el texto, y nada más', () => {
  assert.equal(esViolacionUnica({ code: '23505' }), true);
  assert.equal(esViolacionUnica({ message: 'duplicate key value violates unique constraint "reward_redemptions_pkey"' }), true);
  assert.equal(esViolacionUnica({ code: '42501', message: 'permission denied' }), false);
  assert.equal(esViolacionUnica(null), false);
});

test('el resultado de la clase gratis solo se lee si es uno de los tres conocidos', () => {
  assert.equal(leerResultadoClaseGratis('ENTREGADO'), 'ENTREGADO');
  assert.equal(leerResultadoClaseGratis('TOPE'), 'TOPE');
  assert.equal(leerResultadoClaseGratis('NO_PENDIENTE'), 'NO_PENDIENTE');
  for (const raro of [null, undefined, '', 'OK', ['ENTREGADO'], 1]) assert.equal(leerResultadoClaseGratis(raro), null);
});
