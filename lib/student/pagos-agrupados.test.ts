import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorMes, totalPendiente } from './pagos-agrupados.ts';
import type { EstadoPago, Pago } from './tipos.ts';

const pago = (id: string, fecha: string, importe: number, estado: EstadoPago): Pago =>
  ({ id, concepto: 'Mensual ilimitado', importe, fecha, estado, metodo: 'SEPA' });

test('el total pendiente suma solo lo que se sigue debiendo', () => {
  const pagos = [
    pago('a', '2026-09-01', 89, 'pending'),
    pago('b', '2026-08-01', 96, 'success'),
    pago('c', '2026-07-01', 20, 'cancelled'),
  ];
  assert.equal(totalPendiente(pagos), 89);
});

test('«devuelto por el banco» SÍ cuenta: el importe sigue debiéndose', () => {
  // El nombre del estado engaña —suena a reembolso— y la fila ya lo dice bien.
  // Si el total no lo contara, la misma pantalla diría dos cosas distintas.
  assert.equal(totalPendiente([pago('a', '2026-09-01', 89, 'refunded')]), 89);
  assert.equal(totalPendiente([pago('a', '2026-09-01', 89, 'failed')]), 89);
});

test('un adeudo en curso no se le pide a la alumna otra vez', () => {
  assert.equal(totalPendiente([pago('a', '2026-09-01', 89, 'processing')]), 0);
});

test('sin recibos no debe nada', () => {
  assert.equal(totalPendiente([]), 0);
});

test('agrupa por mes sin reordenar lo que llega', () => {
  const g = agruparPorMes([
    pago('a', '2026-09-01', 89, 'pending'),
    pago('b', '2026-08-15', 96, 'success'),
    pago('c', '2026-08-01', 89, 'success'),
    pago('d', '2026-07-01', 89, 'success'),
  ]);
  assert.deepEqual(g.map((x) => x.clave), ['2026-09', '2026-08', '2026-07']);
  assert.deepEqual(g.map((x) => x.pagos.length), [1, 2, 1]);
  assert.equal(g[0].titulo, 'Septiembre de 2026');
});

test('el «de» del mes va en minúscula', () => {
  // `text-transform: capitalize` habría escrito «Agosto De 2026».
  assert.equal(agruparPorMes([pago('a', '2026-08-01', 1, 'success')])[0].titulo, 'Agosto de 2026');
});

test('un mismo mes que vuelve a aparecer más abajo NO se fusiona con el de arriba', () => {
  // El orden lo decide quien llama. Fusionar grupos no contiguos reordenaría
  // la lista por la espalda.
  const g = agruparPorMes([
    pago('a', '2026-08-01', 1, 'success'),
    pago('b', '2026-07-01', 1, 'success'),
    pago('c', '2026-08-02', 1, 'success'),
  ]);
  assert.deepEqual(g.map((x) => x.clave), ['2026-08', '2026-07', '2026-08']);
});

test('una fecha vacía no rompe la pantalla', () => {
  const g = agruparPorMes([{ ...pago('a', '', 89, 'pending'), fecha: '' }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].titulo, '');
});
