import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDeClienta, avisosDeCobro, avisosDelCentroDeControl } from './avisos.ts';

const rec = (socioId: string | null, tipo: string, score: number, motivo = 'motivo', creadoEn: string | null = null) => ({ socioId, tipo, score, motivo, titulo: 'título', creadoEn });

test('de cada clienta, la recomendación con más prioridad; las que no van sobre una clienta no cuentan', () => {
  const a = avisosDelCentroDeControl([
    rec('soc-1', 'IMPULSAR_ONBOARDING', 40),
    rec('soc-1', 'RECUPERAR_SOCIA', 80, 'Venía 2 veces por semana', '2026-09-28T06:00:00Z'),
    rec(null, 'ABRIR_SESION', 99),
    rec('soc-2', 'LLENAR_PLAZAS', 90),
  ]);
  assert.deepEqual(a.get('soc-1'), { etiqueta: 'Viene menos', motivo: 'Venía 2 veces por semana', dinero: false, origen: 'CENTRO_DE_CONTROL', desde: '2026-09-28T06:00:00Z' });
  assert.equal(a.has('soc-2'), false, 'un tipo de agenda no es un aviso de su fila');
  assert.equal(a.size, 1);
});

test('un recibo FALLIDO o PENDIENTE vencido es aviso de cobro; uno que vence mañana no', () => {
  const a = avisosDeCobro([
    { socioId: 'a', estado: 'FALLIDO', importe: 59, fechaVencimiento: '2026-09-30' },
    { socioId: 'b', estado: 'PENDIENTE', importe: 40, fechaVencimiento: '2026-09-20' },
    { socioId: 'b', estado: 'PENDIENTE', importe: 19.5, fechaVencimiento: '2026-09-25' },
    { socioId: 'c', estado: 'PENDIENTE', importe: 30, fechaVencimiento: '2026-10-02' },
    { socioId: 'd', estado: 'COBRADO', importe: 30, fechaVencimiento: '2026-09-01' },
  ], '2026-10-01');
  assert.equal(a.get('a')?.motivo, 'Tiene un recibo de 59 € sin cobrar: el cobro falló.');
  assert.equal(a.get('b')?.motivo, 'Tiene 2 recibos sin cobrar (59,50 €).');
  assert.equal(a.has('c'), false);
  assert.equal(a.has('d'), false);
  // Desde el recibo vencido más antiguo: un contacto anterior no lo da por atendido.
  assert.equal(a.get('b')?.desde, '2026-09-20');
});

test('como mucho un aviso: el del Centro de Control gana; los de dinero, solo a quien cobra', () => {
  const centro = avisosDelCentroDeControl([rec('x', 'RECUPERAR_SOCIA', 50), rec('y', 'COBRAR_PENDIENTE', 50)]);
  const cobro = avisosDeCobro([{ socioId: 'x', estado: 'FALLIDO', importe: 10, fechaVencimiento: null }, { socioId: 'z', estado: 'FALLIDO', importe: 10, fechaVencimiento: null }], '2026-10-01');
  assert.equal(avisoDeClienta('x', centro, cobro, true)?.etiqueta, 'Viene menos');
  assert.equal(avisoDeClienta('y', centro, cobro, false), null, 'el de cobro del Centro tampoco lo ve quien no cobra');
  assert.equal(avisoDeClienta('z', centro, cobro, true)?.origen, 'COBROS');
  assert.equal(avisoDeClienta('z', centro, cobro, false), null);
});
