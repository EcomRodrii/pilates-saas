// Tests del importe proporcional (alta a mitad de mes y diferencia al subir de plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  repartoProporcional, prorrateoDeAlta, planSeProrratea, cicloYCobroDeAlta, conceptoAltaProrrateada,
  diferenciaCambioPlan, idReciboCambioPlan, idSuscripcionCambioPlan, esReciboParcialDeCuota,
  PREFIJO_RECIBO_PRORRATEO, terminaEnFinDeMes,
} from './prorrateo.ts';
import { hoyEnEstudio } from '../utils.ts';
import { proximoFinAlineadoDia1, cicloInicialDe } from '../bono-logic.ts';

const mensual = (precio: number) => ({ tipo: 'MENSUAL' as const, precio, sesiones: null, validezDias: null });

// ── redondeo ────────────────────────────────────────────────────────────────
test('repartoProporcional: mitad hacia arriba, en enteros, sin pasarse nunca', () => {
  assert.equal(repartoProporcional(5000, 17, 31), 2742); // 27,419… → 27,42 €
  assert.equal(repartoProporcional(1, 1, 2), 1);          // 0,5 céntimos sube
  assert.equal(repartoProporcional(5000, 31, 31), 5000);
  assert.equal(repartoProporcional(5000, 40, 31), 5000);  // acotado
  assert.equal(repartoProporcional(5000, 0, 31), 0);
  assert.equal(repartoProporcional(5000, 5, 0), 0);
  assert.equal(repartoProporcional(Number.NaN, 5, 31), 0);
  // el caso clásico que en coma flotante da 2,67: 8,03 € × 1/3
  assert.equal(repartoProporcional(535, 1, 2), 268);      // 267,5 → 268
});

// ── alta: meses de 28/29/30/31 días ─────────────────────────────────────────
test('alta el 15 de octubre (31 días): 17 de 31, ciclo hasta el 31', () => {
  const p = prorrateoDeAlta(mensual(50), '2026-10-15')!;
  assert.equal(p.diasRestantes, 17);
  assert.equal(p.diasDelMes, 31);
  assert.equal(p.importe, 27.42);
  assert.equal(p.fechaFin, '2026-10-31');
  assert.equal(p.mesCompleto, false);
  assert.equal(p.texto, 'parte proporcional de octubre: 17 de 31 días');
});

test('alta el día 1 = mes entero, ciclo hasta fin de mes', () => {
  const p = prorrateoDeAlta(mensual(50), '2026-10-01')!;
  assert.equal(p.importe, 50);
  assert.equal(p.mesCompleto, true);
  assert.equal(p.fechaFin, '2026-10-31');
  assert.equal(p.texto, 'octubre completo');
});

test('alta el último día del mes: 1 día', () => {
  const p = prorrateoDeAlta(mensual(62), '2026-10-31')!;
  assert.equal(p.diasRestantes, 1);
  assert.equal(p.importe, 2); // 62/31
});

test('febrero normal (28) y bisiesto (29)', () => {
  const f28 = prorrateoDeAlta(mensual(56), '2027-02-15')!;
  assert.equal(f28.diasDelMes, 28); assert.equal(f28.diasRestantes, 14);
  assert.equal(f28.importe, 28); assert.equal(f28.fechaFin, '2027-02-28');
  const f29 = prorrateoDeAlta(mensual(58), '2028-02-15')!;
  assert.equal(f29.diasDelMes, 29); assert.equal(f29.diasRestantes, 15);
  assert.equal(f29.fechaFin, '2028-02-29');
  assert.equal(f29.importe, 30); // 58 × 15/29
});

test('mes de 30 días (abril) y año nuevo (diciembre → fin 31 dic)', () => {
  const a = prorrateoDeAlta(mensual(60), '2026-04-21')!;
  assert.equal(a.diasRestantes, 10); assert.equal(a.importe, 20); assert.equal(a.fechaFin, '2026-04-30');
  const d = prorrateoDeAlta(mensual(31), '2026-12-31')!;
  assert.equal(d.fechaFin, '2026-12-31'); assert.equal(d.importe, 1);
});

test('por debajo de 0,50 € no se cobra (y se dice)', () => {
  const p = prorrateoDeAlta(mensual(10), '2026-10-31')!; // 10/31 = 0,32 €
  assert.equal(p.importe, 0);
  assert.equal(p.bajoElMinimo, true);
  const q = prorrateoDeAlta(mensual(10), '2026-10-30')!; // 2/31 = 0,65 €
  assert.equal(q.importe, 0.65);
  assert.equal(q.bajoElMinimo, false);
});

test('solo cuotas mensuales de UN mes con precio: bonos, sueltas, trimestrales y 0 € no', () => {
  assert.equal(prorrateoDeAlta({ tipo: 'BONO', precio: 100 }, '2026-10-15'), null);
  assert.equal(prorrateoDeAlta({ tipo: 'PUNTUAL', precio: 15 }, '2026-10-15'), null);
  assert.equal(prorrateoDeAlta({ tipo: 'MENSUAL', precio: 140, periodicidadMeses: 3 }, '2026-10-15'), null);
  assert.equal(prorrateoDeAlta({ tipo: 'MENSUAL', precio: 0 }, '2026-10-15'), null);
  assert.equal(planSeProrratea({ tipo: 'MENSUAL', precio: 50, periodicidadMeses: 1 }), true);
});

test('el cambio de hora no mueve el día: se calcula sobre el día de Madrid', () => {
  // Madrugada del 26-oct-2026 (fin del horario de verano) y 31-oct 23:30 UTC = 01-nov 00:30 Madrid.
  assert.equal(hoyEnEstudio(new Date('2026-10-25T23:30:00Z')), '2026-10-26');
  const noche = hoyEnEstudio(new Date('2026-10-31T23:30:00Z'));
  assert.equal(noche, '2026-11-01');
  assert.equal(prorrateoDeAlta(mensual(50), noche)!.mesCompleto, true); // día 1 en Madrid
  assert.equal(prorrateoDeAlta(mensual(50), hoyEnEstudio(new Date('2026-03-28T23:30:00Z')))!.diasRestantes, 3); // 29-mar (cambio a verano): 29,30,31
});

// ── relación con el cobro el día 1 y con cicloYCobroDeAlta ──────────────────
test('con el ajuste apagado el alta es EXACTAMENTE la de siempre', () => {
  const plan = mensual(50);
  const ahora = '2026-10-15T10:00:00Z';
  const r = cicloYCobroDeAlta(plan, ahora, '2026-10-15', false);
  assert.deepEqual({ fechaFin: r.fechaFin, sesionesRestantes: r.sesionesRestantes }, cicloInicialDe(plan, ahora));
  assert.equal(r.importe, 50);
  assert.equal(r.prorrateo, null);
  assert.equal(r.prefijoRecibo, 'rec-');
});

test('con el ajuste activo: ciclo hasta fin de mes, parte del importe y renovación el día 1 por la entera', () => {
  const r = cicloYCobroDeAlta(mensual(50), '2026-10-15T10:00:00Z', '2026-10-15', true);
  assert.equal(r.fechaFin, '2026-10-31');
  assert.equal(r.importe, 27.42);
  assert.equal(r.prefijoRecibo, PREFIJO_RECIBO_PRORRATEO);
  // La renovación (cron: fecha_fin < hoy → el día 1) alinea al fin del mes siguiente, sin saltarse noviembre.
  assert.equal(proximoFinAlineadoDia1('2026-10-31', { periodicidadMeses: 1 }), '2026-11-30');
  assert.equal(proximoFinAlineadoDia1('2027-02-28', { periodicidadMeses: 1 }), '2027-03-31');
  assert.equal(proximoFinAlineadoDia1('2026-12-31', { periodicidadMeses: 1 }), '2027-01-31');
});

test('alta el día 1 con el ajuste: precio entero, sin sufijo ni prefijo de parcial', () => {
  const r = cicloYCobroDeAlta(mensual(50), '2026-10-01T08:00:00Z', '2026-10-01', true);
  assert.equal(r.importe, 50);
  assert.equal(r.prefijoRecibo, 'rec-');
  assert.equal(r.fechaFin, '2026-10-31');
  assert.equal(conceptoAltaProrrateada('Alta', 'Reformer', r.prorrateo), 'Alta — Reformer');
});

test('la matrícula no se prorratea: la función solo conoce la cuota', () => {
  // `cicloYCobroDeAlta` no recibe matrícula; el recibo de matrícula es aparte y entero.
  const r = cicloYCobroDeAlta({ ...mensual(50), matricula: 30 } as never, '2026-10-15T10:00:00Z', '2026-10-15', true);
  assert.equal(r.importe, 27.42);
});

test('un bono con el ajuste activo no cambia', () => {
  const bono = { tipo: 'BONO' as const, precio: 100, sesiones: 10, validezDias: 60 };
  const r = cicloYCobroDeAlta(bono, '2026-10-15T10:00:00Z', '2026-10-15', true);
  assert.equal(r.importe, 100);
  assert.equal(r.prorrateo, null);
  assert.deepEqual({ fechaFin: r.fechaFin, sesionesRestantes: r.sesionesRestantes }, cicloInicialDe(bono, '2026-10-15T10:00:00Z'));
});

test('concepto del recibo parcial lleva el porqué', () => {
  const r = cicloYCobroDeAlta(mensual(50), '2026-10-15T10:00:00Z', '2026-10-15', true);
  assert.equal(conceptoAltaProrrateada('Alta', 'Reformer', r.prorrateo), 'Alta — Reformer · parte proporcional de octubre: 17 de 31 días');
});

// ── B) diferencia de plan ───────────────────────────────────────────────────
const base = { mesesCicloActual: 1, mesesCicloNuevo: 1 };

test('subir de 49 a 69 con 12 de 30 días: 8 €', () => {
  // ciclo 1–30 de noviembre (fecha_fin 30-nov), hoy 19-nov: quedan 12 días (19..30)
  const d = diferenciaCambioPlan({ ...base, precioActual: 49, precioNuevo: 69, fechaFin: '2026-11-30', hoyISO: '2026-11-19' });
  assert.equal(d.aplica, true);
  assert.equal(d.diasCiclo, 30); assert.equal(d.diasRestantes, 12);
  assert.equal(d.importe, 8); // 20 × 12/30
  assert.equal(d.texto, '(69 € − 49 €) × 12 de 30 días');
});

test('ciclo de aniversario (15 oct → 14 nov) y el día antes del fin', () => {
  const d = diferenciaCambioPlan({ ...base, precioActual: 40, precioNuevo: 60, fechaFin: '2026-11-14', hoyISO: '2026-11-14' });
  assert.equal(d.diasCiclo, 31); assert.equal(d.diasRestantes, 1);
  assert.equal(d.importe, 0.65); // 20 × 1/31
});

test('ciclo con febrero: fecha_fin 28-feb, ciclo de 28 días', () => {
  const d = diferenciaCambioPlan({ ...base, precioActual: 40, precioNuevo: 54, fechaFin: '2027-02-28', hoyISO: '2027-02-15' });
  assert.equal(d.diasCiclo, 28); assert.equal(d.diasRestantes, 14);
  assert.equal(d.importe, 7);
});

test('el primer día del ciclo cobra la diferencia entera', () => {
  const d = diferenciaCambioPlan({ ...base, precioActual: 49, precioNuevo: 69, fechaFin: '2026-11-30', hoyISO: '2026-11-01' });
  assert.equal(d.importe, 20);
});

test('plan igual o más barato = 0, sin cobro ni devolución', () => {
  for (const nuevo of [49, 30]) {
    const d = diferenciaCambioPlan({ ...base, precioActual: 49, precioNuevo: nuevo, fechaFin: '2026-11-30', hoyISO: '2026-11-19' });
    assert.equal(d.aplica, false); assert.equal(d.importe, 0);
  }
});

test('ciclo vencido, sin fecha o periodos distintos: no se ofrece', () => {
  assert.equal(diferenciaCambioPlan({ ...base, precioActual: 49, precioNuevo: 69, fechaFin: '2026-11-30', hoyISO: '2026-12-01' }).aplica, false);
  assert.equal(diferenciaCambioPlan({ ...base, precioActual: 49, precioNuevo: 69, fechaFin: null, hoyISO: '2026-11-19' }).aplica, false);
  assert.equal(diferenciaCambioPlan({ mesesCicloActual: 1, mesesCicloNuevo: 3, precioActual: 49, precioNuevo: 69, fechaFin: '2026-11-30', hoyISO: '2026-11-19' }).aplica, false);
});

test('trimestral → trimestral: el ciclo son 3 meses', () => {
  const d = diferenciaCambioPlan({ mesesCicloActual: 3, mesesCicloNuevo: 3, precioActual: 120, precioNuevo: 150, fechaFin: '2026-12-31', hoyISO: '2026-12-01' });
  assert.equal(d.diasCiclo, 92); assert.equal(d.diasRestantes, 31);
  assert.equal(d.importe, 10.11); // 30 × 31/92
});

test('diferencia diminuta (< 0,50 €) no se cobra', () => {
  const d = diferenciaCambioPlan({ ...base, precioActual: 49, precioNuevo: 50, fechaFin: '2026-11-30', hoyISO: '2026-11-21' });
  assert.equal(d.aplica, false); assert.equal(d.importe, 0);
});

test('ids con motivo, deterministas, y reconocibles como parciales', () => {
  assert.equal(idReciboCambioPlan('sus-1'), 'rec-camb-sus-1');
  assert.equal(idReciboCambioPlan('sus-1'), idReciboCambioPlan('sus-1'));
  assert.equal(idSuscripcionCambioPlan('sus-1'), 'sus-camb-sus-1');
  assert.equal(esReciboParcialDeCuota('rec-camb-sus-1'), true);
  assert.equal(esReciboParcialDeCuota('rec-prorrateo-abc'), true);
  assert.equal(esReciboParcialDeCuota('rec-renov-sus-1-x'), false);
});

test('la renovación solo realinea cuotas que acaban en fin de mes (las de aniversario no se tocan)', () => {
  assert.equal(terminaEnFinDeMes('2026-10-31'), true);
  assert.equal(terminaEnFinDeMes('2027-02-28'), true);
  assert.equal(terminaEnFinDeMes('2028-02-29'), true);
  assert.equal(terminaEnFinDeMes('2026-12-31'), true);
  assert.equal(terminaEnFinDeMes('2026-11-14'), false);
  assert.equal(terminaEnFinDeMes('2026-11-01'), false);
  // La que acaba el 31-oct renueva al 30-nov, y la siguiente al 31-dic: sin saltarse ni repetir un mes.
  const fin1 = proximoFinAlineadoDia1('2026-10-31', { periodicidadMeses: 1 });
  const fin2 = proximoFinAlineadoDia1(fin1, { periodicidadMeses: 1 });
  assert.deepEqual([fin1, fin2], ['2026-11-30', '2026-12-31']);
});
