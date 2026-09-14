import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ausenciasVigentes, errorRangoAusencia, etiquetaTipoAusencia, textoAusenciaGuardada,
} from './perfil-instructora.ts';

test('el rango de una ausencia exige las dos fechas, en orden y de como mucho un año', () => {
  assert.equal(errorRangoAusencia('2026-09-20', '2026-09-20'), null);
  assert.equal(errorRangoAusencia('2026-09-20', '2026-09-25'), null);
  assert.equal(errorRangoAusencia('', '2026-09-25'), 'Elige las dos fechas.');
  assert.match(errorRangoAusencia('2026-09-25', '2026-09-20') ?? '', /anterior/);
  // 366 días incluidos valen (2028 es bisiesto); 367, no.
  assert.equal(errorRangoAusencia('2028-01-01', '2028-12-31'), null);
  assert.match(errorRangoAusencia('2028-01-01', '2029-01-01') ?? '', /un año/);
});

test('solo se listan las ausencias que no han terminado, la más próxima primero', () => {
  const lista = ausenciasVigentes([
    { id: 'pasada', desde: '2026-08-01', hasta: '2026-08-10' },
    { id: 'lejana', desde: '2026-12-20', hasta: '2026-12-31' },
    { id: 'en-curso', desde: '2026-09-10', hasta: '2026-09-14' },
    { id: 'proxima', desde: '2026-10-01', hasta: '2026-10-02' },
  ], '2026-09-14');
  assert.deepEqual(lista.map((a) => a.id), ['en-curso', 'proxima', 'lejana']);
});

test('tras guardar, si tiene clases en esas fechas se le dice que pida la baja desde cada una', () => {
  assert.equal(textoAusenciaGuardada(0), 'Ausencia guardada');
  assert.match(textoAusenciaGuardada(1), /Tienes 1 clase en esas fechas/);
  assert.match(textoAusenciaGuardada(3), /Tienes 3 clases en esas fechas: pide la baja/);
});

test('cada tipo tiene su nombre y lo desconocido no se inventa ninguno', () => {
  assert.equal(etiquetaTipoAusencia('BAJA_MEDICA'), 'Baja médica');
  assert.equal(etiquetaTipoAusencia('RARO'), 'Ausencia');
});
