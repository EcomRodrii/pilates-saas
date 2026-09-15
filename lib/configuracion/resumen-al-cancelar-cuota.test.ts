import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenAlCancelarCuota } from './resumenes.ts';

// «Cobros y facturas» → «Si se cancela una cuota» (migr 20260915215311).

test('sin dato del estudio no se inventa un valor', () => {
  assert.equal(resumenAlCancelarCuota({}), null);
});

test('cada política con su resumen corto, y lo de renovar sola solo si está apagado', () => {
  assert.equal(resumenAlCancelarCuota({ recibosAlCancelarCuota: 'MANTENER_CON_REINTENTOS', renovarSolaCuotaCancelada: true }), 'El pendiente se sigue cobrando');
  assert.equal(resumenAlCancelarCuota({ recibosAlCancelarCuota: 'MANTENER_SIN_REINTENTOS', renovarSolaCuotaCancelada: true }), 'Pendiente, sin cobro automático');
  assert.match(resumenAlCancelarCuota({ recibosAlCancelarCuota: 'ANULAR', renovarSolaCuotaCancelada: false }) ?? '', /^El pendiente se anula/);
});

test('ningún resumen pasa del largo de una fila', () => {
  for (const recibosAlCancelarCuota of ['MANTENER_CON_REINTENTOS', 'MANTENER_SIN_REINTENTOS', 'ANULAR'] as const) {
    for (const renovarSolaCuotaCancelada of [true, false]) {
      const r = resumenAlCancelarCuota({ recibosAlCancelarCuota, renovarSolaCuotaCancelada }) ?? '';
      assert.ok(r.length <= 44, `${recibosAlCancelarCuota}/${renovarSolaCuotaCancelada}: «${r}» (${r.length})`);
    }
  }
});
