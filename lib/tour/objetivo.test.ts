import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPERA_OBJETIVO_MS, empezarRastro, medirRastro, type RastroObjetivo } from './objetivo.ts';

/** Mide una serie de instantes (ms desde 0) diciendo si el elemento estaba; devuelve lo último que tocó. */
function recorrer(medidas: readonly [number, boolean][]) {
  let rastro: RastroObjetivo = empezarRastro(0);
  let ultimo = { sinFoco: false, avisar: false };
  let avisos = 0;
  for (const [t, esta] of medidas) {
    const m = medirRastro(rastro, esta, t);
    rastro = m.rastro;
    ultimo = { sinFoco: m.sinFoco, avisar: m.avisar };
    if (m.avisar) avisos += 1;
  }
  return { ...ultimo, avisos };
}

test('lo que nunca aparece: pasado el plazo, la tarjeta lo dice Y se avisa a Sentry', () => {
  assert.deepEqual(recorrer([[0, false], [ESPERA_OBJETIVO_MS, false]]), { sinFoco: false, avisar: false, avisos: 0 }, 'en el plazo, aún se espera');
  const r = recorrer([[0, false], [ESPERA_OBJETIVO_MS + 1, false]]);
  assert.equal(r.sinFoco, true);
  assert.equal(r.avisar, true);
});

test('lo que se vio y se fue (pulsar la fila, irse de la pantalla) NO es un fallo de la visita: nunca va a Sentry', () => {
  // JAVASCRIPT-NEXTJS-3J: la fila estuvo 10 s y la persona la pulsó. Antes, a los 30 ms ya se avisaba.
  const justoAlIrse = recorrer([[0, true], [10_000, true], [10_030, false]]);
  assert.deepEqual(justoAlIrse, { sinFoco: false, avisar: false, avisos: 0 });
  // Y aunque siga sin estar mucho rato: la tarjeta acaba diciendo que no lo ve (con su «Llévame»), sin aviso.
  const mucho = recorrer([[0, true], [10_000, false], [10_000 + ESPERA_OBJETIVO_MS + 1, false], [60_000, false]]);
  assert.equal(mucho.sinFoco, true);
  assert.equal(mucho.avisos, 0);
});

test('el plazo de «se fue» cuenta desde que se fue, no desde que empezó el paso', () => {
  const r = recorrer([[0, true], [20_000, false], [20_000 + ESPERA_OBJETIVO_MS - 1, false]]);
  assert.equal(r.sinFoco, false);
});

test('si vuelve, deja de estar «sin foco»', () => {
  const r = recorrer([[0, false], [ESPERA_OBJETIVO_MS + 1, false], [ESPERA_OBJETIVO_MS + 500, true]]);
  assert.deepEqual(r, { sinFoco: false, avisar: false, avisos: 1 });
});
