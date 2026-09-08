import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirRecompensas, SUGERENCIAS } from './recompensas-sugeridas.ts';

test('el coste sale de lo que ESE estudio paga por clase, no de un número fijo', () => {
  // El mismo premio cuesta distinto según la regla del estudio: con 10 por
  // clase, la clase invitada son 120; con 50, son 600. Un número fijo habría
  // propuesto premios absurdos a la mitad de los estudios.
  const con10 = sugerirRecompensas(10);
  const con50 = sugerirRecompensas(50);
  const invitada = (l: typeof con10) => l.find((s) => s.efecto === 'CLASE_GRATIS')!.costeCreditos;
  assert.equal(invitada(con10), 120);
  assert.equal(invitada(con50), 600);
});

test('sin regla activa no se sugiere nada', () => {
  // Proponer recompensas cuando no se gana ningún crédito sería enseñar una
  // tienda a la que nadie puede entrar.
  assert.deepEqual(sugerirRecompensas(0), []);
  assert.deepEqual(sugerirRecompensas(null), []);
  assert.deepEqual(sugerirRecompensas(undefined), []);
});

test('los costes se leen como precios: redondeados a la decena y nunca por debajo de 10', () => {
  for (const s of sugerirRecompensas(3)) {
    assert.equal(s.costeCreditos % 10, 0, `${s.nombre} no está redondeado`);
    assert.ok(s.costeCreditos >= 10);
  }
});

test('el orden va de más caro a más barato, que es como se lee un escaparate', () => {
  const l = sugerirRecompensas(10);
  assert.ok(l.length >= 3);
  assert.ok(l[0].costeCreditos > l[l.length - 1].costeCreditos);
});

test('solo UNA se entrega sola, y es la clase', () => {
  // Las demás las da alguien en recepción: si varias dijeran «automático» sin
  // tener nada detrás, el estudio prometería entregas que no ocurren.
  const auto = SUGERENCIAS.filter((s) => s.efecto === 'CLASE_GRATIS');
  assert.equal(auto.length, 1);
  assert.match(auto[0].nombre, /clase/i);
});
