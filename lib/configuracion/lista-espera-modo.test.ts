import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTOS_PROPUESTOS, elegirModoListaEspera, listaEsperaDesdeValores, valoresDeListaEspera,
  type ListaEsperaElegida, type ValoresListaEspera,
} from './lista-espera-modo.ts';

// Un control de tres opciones sobre las dos columnas de siempre. Lo que se
// protege: que cada opción guarde EXACTAMENTE lo que guardaban los dos controles
// de antes, y que leer y volver a guardar sin tocar nada no cambie nada.

const v = (permite: boolean, plazo: number): ValoresListaEspera =>
  ({ permiteListaEspera: permite, listaEsperaPlazoAceptacionMinutos: plazo });

test('lo guardado se lee como una de las tres opciones', () => {
  assert.deepEqual(listaEsperaDesdeValores(v(false, 0)), { modo: 'sin-lista', minutos: '' });
  assert.deepEqual(listaEsperaDesdeValores(v(true, 0)), { modo: 'al-momento', minutos: '' });
  assert.deepEqual(listaEsperaDesdeValores(v(true, 15)), { modo: 'con-plazo', minutos: '15' });
  // Sin lista con un plazo guardado: se enseña «sin lista», y el plazo sigue ahí
  // por si vuelve a elegir «durante N minutos».
  assert.deepEqual(listaEsperaDesdeValores(v(false, 30)), { modo: 'sin-lista', minutos: '30' });
  // Un negativo es «al momento» para `promocionar_siguiente_espera` (plazo ≤ 0).
  assert.deepEqual(listaEsperaDesdeValores(v(true, -5)), { modo: 'al-momento', minutos: '' });
});

test('cada opción guarda las mismas dos columnas que los controles de antes', () => {
  const guardado = v(true, 20);
  assert.deepEqual(valoresDeListaEspera({ modo: 'sin-lista', minutos: '99' }, guardado), { ok: true, valores: v(false, 20) });
  assert.deepEqual(valoresDeListaEspera({ modo: 'al-momento', minutos: '99' }, guardado), { ok: true, valores: v(true, 0) });
  assert.deepEqual(valoresDeListaEspera({ modo: 'con-plazo', minutos: ' 45 ' }, guardado), { ok: true, valores: v(true, 45) });
});

test('«sin lista» no toca el plazo guardado, como apagar el interruptor de antes', () => {
  // Un tipo de clase con su propia lista encendida y sin plazo propio hereda
  // este: ponerlo a 0 al apagar la del estudio le cambiaría la regla.
  for (const plazo of [0, 10, 60]) {
    const r = valoresDeListaEspera({ modo: 'sin-lista', minutos: '' }, v(true, plazo));
    assert.deepEqual(r, { ok: true, valores: v(false, plazo) });
  }
});

test('«durante N minutos» exige una cifra entera de 1 en adelante', () => {
  for (const minutos of ['', '   ', '0', '-3', '1.5', 'abc', '15m']) {
    const r = valoresDeListaEspera({ modo: 'con-plazo', minutos }, v(true, 0));
    assert.equal(r.ok, false, `«${minutos}» no es un plazo`);
  }
  assert.deepEqual(valoresDeListaEspera({ modo: 'con-plazo', minutos: '1' }, v(true, 0)), { ok: true, valores: v(true, 1) });
});

test('leer y volver a guardar sin tocar nada deja las columnas como estaban', () => {
  for (const guardado of [v(false, 0), v(false, 30), v(true, 0), v(true, 1), v(true, 120)]) {
    const r = valoresDeListaEspera(listaEsperaDesdeValores(guardado), guardado);
    assert.deepEqual(r, { ok: true, valores: guardado });
  }
});

test('elegir «durante N minutos» sin cifra propone una que se ve antes de guardar', () => {
  const alMomento: ListaEsperaElegida = { modo: 'al-momento', minutos: '' };
  assert.deepEqual(elegirModoListaEspera(alMomento, 'con-plazo'), { modo: 'con-plazo', minutos: String(MINUTOS_PROPUESTOS) });
  // Si ya había una cifra (se guardó antes, o se tecleó), se respeta.
  assert.deepEqual(elegirModoListaEspera({ modo: 'sin-lista', minutos: '30' }, 'con-plazo'), { modo: 'con-plazo', minutos: '30' });
  // Salir de «durante N minutos» no borra lo tecleado: volver lo recupera.
  assert.deepEqual(elegirModoListaEspera({ modo: 'con-plazo', minutos: '40' }, 'al-momento'), { modo: 'al-momento', minutos: '40' });
});
