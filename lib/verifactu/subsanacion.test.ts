// Las marcas del cuadro de operativas de la AEAT («Validaciones» v1.2.2, §6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcasSubsanacion, marcasAnulacion } from './subsanacion.ts';

test('alta por rechazo (el original no está en la AEAT): Subsanacion=S, RechazoPrevio=X', () => {
  assert.deepEqual(marcasSubsanacion({ existeEnAeat: false, subsanacionAnteriorRechazada: false }), { subsanacion: true, rechazoPrevio: 'X' });
});

test('subsanación sin registro previo (histórico nunca remitido): también S + X', () => {
  // Misma situación para la AEAT: no tiene nada de esa factura.
  assert.deepEqual(marcasSubsanacion({ existeEnAeat: false, subsanacionAnteriorRechazada: true }), { subsanacion: true, rechazoPrevio: 'X' });
});

test('alta de subsanación (el registro está en la AEAT): Subsanacion=S, sin RechazoPrevio', () => {
  assert.deepEqual(marcasSubsanacion({ existeEnAeat: true, subsanacionAnteriorRechazada: false }), { subsanacion: true, rechazoPrevio: 'N' });
});

test('alta por rechazo de subsanación: Subsanacion=S, RechazoPrevio=S', () => {
  assert.deepEqual(marcasSubsanacion({ existeEnAeat: true, subsanacionAnteriorRechazada: true }), { subsanacion: true, rechazoPrevio: 'S' });
});

test('anulación: normal, por rechazo, sin registro previo y por rechazo sin registro previo', () => {
  assert.deepEqual(marcasAnulacion({ existeEnAeat: true, anulacionAnteriorRechazada: false }), { sinRegistroPrevio: false, rechazoPrevio: false });
  assert.deepEqual(marcasAnulacion({ existeEnAeat: true, anulacionAnteriorRechazada: true }), { sinRegistroPrevio: false, rechazoPrevio: true });
  assert.deepEqual(marcasAnulacion({ existeEnAeat: false, anulacionAnteriorRechazada: false }), { sinRegistroPrevio: true, rechazoPrevio: false });
  assert.deepEqual(marcasAnulacion({ existeEnAeat: false, anulacionAnteriorRechazada: true }), { sinRegistroPrevio: true, rechazoPrevio: true });
});
