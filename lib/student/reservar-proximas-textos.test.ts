import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaOcurrencia, resumenFinal, resumenPrevio, cancelacion, clase, sesion } from './reservar-proximas-textos.ts';
import { CODIGOS_CLASIFICADOS, clasificarCodigo } from '../reservas/proximas-reglas.ts';

test('singular y plural', () => {
  assert.equal(clase(1), '1 clase'); assert.equal(clase(4), '4 clases');
  assert.equal(sesion(1), '1 sesión'); assert.equal(sesion(3), '3 sesiones');
});

test('resumenPrevio: cuántas clases, cuántas sesiones se descontarán y cuántas le quedan; sin nada, lo dice', () => {
  assert.equal(
    resumenPrevio({ reservadas: 4, descontadas: 4, bono: { plan: 'Bono 8 sesiones', saldoDespues: 1 } }),
    'Se reservarán 4 clases y se descontarán 4 sesiones de tu «Bono 8 sesiones»: te quedarán 1.',
  );
  assert.equal(resumenPrevio({ reservadas: 1, descontadas: 1, bono: { plan: 'Bono', saldoDespues: 0 } }), 'Se reservarán 1 clase y se descontarán 1 sesión de tu «Bono»: te quedarán 0.');
  assert.equal(resumenPrevio({ reservadas: 3, descontadas: 0, bono: null }), 'Se reservarán 3 clases.', 'con cuota no se descuenta nada: no se dice');
  assert.equal(resumenPrevio({ reservadas: 0, descontadas: 0, bono: null }), 'Ahora mismo no se puede reservar ninguna de estas clases.');
});

test('resumenFinal: reservadas X de N, lo descontado de verdad y por qué se paró', () => {
  assert.equal(resumenFinal({ reservadas: 4, pedidas: 4, descontadas: 4, saldoDespues: 1, paro: null }), 'Reservadas 4 de 4 · se han descontado 4 sesiones de tu bono; te quedan 1.');
  assert.equal(resumenFinal({ reservadas: 3, pedidas: 4, descontadas: 3, saldoDespues: 0, paro: { motivo: 'SIN_DERECHO' } }),
    'Reservadas 3 de 4 · se han descontado 3 sesiones de tu bono; te quedan 0 · tu bono se ha quedado sin sesiones: no se reservaron las últimas.');
  assert.equal(resumenFinal({ reservadas: 1, pedidas: 4, descontadas: 1, saldoDespues: 5, paro: null }), 'Reservadas 1 de 4 · se ha descontado 1 sesión de tu bono; te quedan 5.');
  assert.equal(resumenFinal({ reservadas: 0, pedidas: 2, descontadas: 0, saldoDespues: null, paro: { motivo: 'ERROR' } }), 'Reservadas 0 de 2 · se ha parado antes de acabar.');
});

test('cancelacion: nombra la ventana real y no promete más', () => {
  assert.equal(cancelacion(12), 'Cada clase se cancela como cualquier otra: gratis hasta 12 h antes (se te devuelve la sesión).');
});

test('etiquetaOcurrencia: cada resultado dice algo distinto y nunca el código técnico', () => {
  const resultados = ['RESERVADA', 'SE_RESERVARA', 'YA_RESERVADA', 'COMPLETA', 'SIN_DERECHO', 'SUPERA_TOPE', 'FUERA_DE_VENTANA', 'CONFLICTO', 'CERRADA', 'EN_ESPERA', 'NO_INTENTADA', 'ERROR'] as const;
  const textos = resultados.map(r => etiquetaOcurrencia({ resultado: r }));
  assert.equal(new Set(textos).size, resultados.length);
  for (const t of textos) assert.doesNotMatch(t, /[A-Z]{4,}_[A-Z]|-/);
  // Con motivo concreto, lo dice.
  assert.equal(etiquetaOcurrencia({ resultado: 'SUPERA_TOPE', codigo: 'max-por-dia' }), 'Ya tienes clase ese día');
  assert.equal(etiquetaOcurrencia({ resultado: 'SIN_DERECHO', codigo: 'impago' }), 'Tienes un pago pendiente');
  assert.equal(etiquetaOcurrencia({ resultado: 'FUERA_DE_VENTANA', codigo: 'fuera-ventana-maxima' }), 'Aún no se puede reservar');
});

test('todo código de reserva clasificado tiene una etiqueta que la alumna entiende', () => {
  for (const c of CODIGOS_CLASIFICADOS) {
    const t = etiquetaOcurrencia({ ...clasificarCodigo(c), codigo: c });
    assert.ok(t.length > 3 && !/[a-z]+-[a-z]+/.test(t), `${c} → «${t}»`);
  }
});
