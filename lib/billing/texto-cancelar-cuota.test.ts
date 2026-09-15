import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoCobrosAlCancelar, type ReciboPendienteDeLaCuota } from './texto-cancelar-cuota.ts';

const r = (x: Partial<ReciboPendienteDeLaCuota> = {}): ReciboPendienteDeLaCuota => ({ importe: 45, conReintento: false, pagoEnMarcha: false, ...x });

test('sin recibos pendientes: solo que no habrá cobros nuevos, sea cual sea la política', () => {
  for (const p of ['MANTENER_CON_REINTENTOS', 'MANTENER_SIN_REINTENTOS', 'ANULAR'] as const) {
    assert.equal(textoCobrosAlCancelar(p, []), 'No se generarán cobros nuevos de esta cuota.');
  }
});

test('nunca dice que no se le cobrará si queda un reintento programado', () => {
  const t = textoCobrosAlCancelar('MANTENER_CON_REINTENTOS', [r({ conReintento: true })]);
  assert.match(t, /se seguirá intentando cobrar/);
  assert.doesNotMatch(t, /no se le volverá a cobrar/);
  assert.match(t, /45 €/);
});

test('con reintentos pero sin nada programado: no se cobra solo, y lo dice', () => {
  assert.match(textoCobrosAlCancelar('MANTENER_CON_REINTENTOS', [r()]), /no se cobra solo/);
});

test('sin reintentos: sigue debiéndolo, sin cobros automáticos', () => {
  const t = textoCobrosAlCancelar('MANTENER_SIN_REINTENTOS', [r({ conReintento: true }), r({ importe: 10.5 })]);
  assert.match(t, /2 recibos pendientes \(55,50 €\)/);
  assert.match(t, /no se intentará cobrar automáticamente/);
});

test('anular: dice lo que se anula y lo que no se puede anular por un pago en marcha', () => {
  assert.match(textoCobrosAlCancelar('ANULAR', [r()]), /El recibo pendiente de 45 € se anula/);
  const mixto = textoCobrosAlCancelar('ANULAR', [r(), r({ importe: 20, pagoEnMarcha: true })]);
  assert.match(mixto, /se anula/);
  assert.match(mixto, /1 recibo de 20 € no se puede anular ahora/);
});

test('baja al vencer: hasta ese día se sigue intentando cobrar lo pendiente', () => {
  assert.match(textoCobrosAlCancelar('ANULAR', [r({ conReintento: true })], 'al-final'), /Hasta ese día se sigue intentando cobrar/);
  assert.match(textoCobrosAlCancelar('MANTENER_CON_REINTENTOS', [r()], 'al-final'), /en «Quién me debe»/);
});
