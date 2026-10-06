import test from 'node:test';
import assert from 'node:assert/strict';
import { saldoBono, textoCaduca, textoSaldoBono, textoTopes } from './saldo-bono.ts';

// Lo que le queda y hasta cuándo, una vez para toda la app (la tarjeta del bono, la ficha, Perfil y Bonos).

const HOY = '2026-10-07';
const bono = (o: Record<string, unknown> = {}) => ({
  creditosTotales: 8, creditosUsados: 3, tipoPlan: 'BONO', sesionesDelPlan: 8, renovado: false,
  expiraEn: '2026-12-31', estado: 'activo', ...o,
});

test('saldoBono: «de 8» solo en un bono de un ciclo y sin más de las que trae su plan', () => {
  assert.deepEqual(saldoBono(bono()), { quedan: 5, de: 8, ilimitado: false });
  // Renovado: renovar SUMA al mismo bono, «de 8» ya no es verdad.
  assert.equal(saldoBono(bono({ creditosTotales: 8, creditosUsados: 1, renovado: true })).de, null);
  // Con más de las que trae su plan (11 de un bono de 8): la cifra sí, «de 8» no.
  assert.deepEqual(saldoBono(bono({ creditosTotales: 11, creditosUsados: 0 })), { quedan: 11, de: null, ilimitado: false });
  // Sin plan que diga cuántas trae.
  assert.equal(saldoBono(bono({ sesionesDelPlan: null, creditosTotales: 2, creditosUsados: 0 })).de, null);
  // Sin límite.
  assert.deepEqual(saldoBono(bono({ creditosTotales: Infinity, creditosUsados: 0 })), { quedan: Infinity, de: null, ilimitado: true });
});

test('textoCaduca: hoy, mañana, una fecha, sin caducidad y caducado; nada en pausa ni cancelado', () => {
  assert.equal(textoCaduca({ expiraEn: HOY, estado: 'activo' }, HOY), 'caduca hoy');
  assert.equal(textoCaduca({ expiraEn: '2026-10-08', estado: 'activo' }, HOY), 'caduca mañana');
  assert.equal(textoCaduca({ expiraEn: '2026-12-31', estado: 'activo' }, HOY), 'caduca jue 31 dic');
  assert.equal(textoCaduca({ expiraEn: null, estado: 'activo' }, HOY), 'sin caducidad');
  assert.equal(textoCaduca({ expiraEn: '2026-09-30', estado: 'expirado' }, HOY), 'caducó mié 30 sep');
  // Una cuota cancelada con fecha futura decía «caducó <fecha que aún no ha llegado>».
  assert.equal(textoCaduca({ expiraEn: '2026-12-31', estado: 'cancelado' }, HOY), null);
  assert.equal(textoCaduca({ expiraEn: '2026-12-31', estado: 'pausado' }, HOY), null);
});

test('textoSaldoBono: «Te quedan 5 · caduca…», en singular con 1, y nada para una cuota o sin límite', () => {
  assert.equal(textoSaldoBono(bono(), HOY), 'Te quedan 5 · caduca jue 31 dic');
  assert.equal(textoSaldoBono(bono({ creditosUsados: 7 }), HOY), 'Te queda 1 · caduca jue 31 dic');
  assert.equal(textoSaldoBono(bono({ expiraEn: null }), HOY), 'Te quedan 5 · sin caducidad');
  assert.equal(textoSaldoBono(bono({ tipoPlan: 'MENSUAL', creditosTotales: Infinity, creditosUsados: 0 }), HOY), null);
  assert.equal(textoSaldoBono(bono({ creditosTotales: Infinity, creditosUsados: 0 }), HOY), null);
  // Una MENSUAL con contador tampoco: el motor no gasta ese contador.
  assert.equal(textoSaldoBono(bono({ tipoPlan: 'MENSUAL' }), HOY), null);
});

test('textoTopes: el total, los de cada actividad o los dos; nunca «sin límite»', () => {
  const nombres = { 'tc-ref': 'Reformer', 'tc-mat': 'Mat' };
  assert.equal(textoTopes({ limiteSemanal: 2 }, nombres), '2 clases a la semana');
  assert.equal(textoTopes({ limiteSemanal: 1 }, nombres), '1 clase a la semana');
  assert.equal(textoTopes({ limitePorTipo: { 'tc-ref': 2 } }, nombres), 'Reformer: 2 a la semana');
  assert.equal(textoTopes({ limiteSemanal: 3, limitePorTipo: { 'tc-ref': 1 } }, nombres), '3 clases a la semana · Reformer: 1 a la semana');
  // Sin ningún tope: null, y quien llama decide qué decir. Nunca «sin límite».
  assert.equal(textoTopes({ limiteSemanal: null, limitePorTipo: {} }, nombres), null);
  // Para la ficha de UNA clase: el total y el de su actividad, con «hasta».
  assert.equal(
    textoTopes({ limiteSemanal: 3, limitePorTipo: { 'tc-ref': 1, 'tc-mat': 2 } }, nombres, { soloTipo: 'tc-mat', hasta: true }),
    'hasta 3 clases a la semana · Mat: hasta 2 a la semana',
  );
  // Un tipo que ya no está en el horario no se nombra con su id.
  assert.equal(textoTopes({ limitePorTipo: { 'tc-viejo': 2 } }, nombres), null);
});
