import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ritmoMinimo, simularEconomia, SEMANAS_MES, type EntradaEconomia } from './economia.ts';

// Precios redondos con IVA 21 %: 121 € → 100 € netos.
const base = (p: Partial<EntradaEconomia> = {}): EntradaEconomia => ({
  planes: [
    { id: 'm2', nombre: 'Mensual 2x', tipo: 'MENSUAL', precio: 121, periodicidadMeses: null, limiteSemanal: 2, activo: true },
    { id: 'ilim', nombre: 'Ilimitado', tipo: 'MENSUAL', precio: 242, periodicidadMeses: null, limiteSemanal: null, activo: true },
    { id: 'bono', nombre: 'Bono 10', tipo: 'BONO', precio: 150, periodicidadMeses: null, limiteSemanal: null, activo: true },
  ],
  ivaPct: 21,
  cuotasActivas: [],
  plazasSemana: 100,
  instructoras: [{ id: 'i1', tarifaHora: 20, baseMensual: null, relacion: 'AUTONOMA', horasSemanalesContrato: null, horasSemanaHorario: 12 }],
  sesionesSemanaSinTope: 3,
  fijosMes: 2000,
  colchon: 12000,
  ...p,
});

test('equipo: autónoma por las horas del horario; contratada por sus horas de contrato más la base', () => {
  const r = simularEconomia(base({ instructoras: [
    { id: 'a', tarifaHora: 20, baseMensual: null, relacion: 'AUTONOMA', horasSemanalesContrato: null, horasSemanaHorario: 12 },
    { id: 'c', tarifaHora: 10, baseMensual: 500, relacion: 'CONTRATADA', horasSemanalesContrato: 20, horasSemanaHorario: 8 },
  ] }));
  assert.equal(Math.round(r.costeEquipoMes), Math.round(20 * 12 * SEMANAS_MES + 10 * 20 * SEMANAS_MES + 500));
  assert.equal(r.hayContratadas, true);
});

test('una instructora con clases y sin tarifa no se cuenta como 0 €: se marca', () => {
  const r = simularEconomia(base({ instructoras: [
    { id: 'x', tarifaHora: null, baseMensual: null, relacion: null, horasSemanalesContrato: null, horasSemanaHorario: 6 },
  ] }));
  assert.equal(r.instructorasSinTarifa, 1);
  assert.equal(r.costeEquipoMes, 0);
});

test('equilibrio por plan, sin IVA, y la ocupación que exige con su respaldo', () => {
  const r = simularEconomia(base({ instructoras: [] }));
  const m2 = r.filas.find(f => f.id === 'm2')!;
  assert.equal(m2.netoCuotaMes, 100);
  assert.equal(m2.cuotasEquilibrio, 20); // 2000 € / 100 €
  assert.equal(Math.round(m2.plazasNecesarias), Math.round(20 * 2 * SEMANAS_MES));
  assert.ok(Math.abs(m2.ocupacion! - (20 * 2) / 100) < 1e-9);
  // Ilimitado deja 200 €: menos cuotas, y la fila más barata en cuotas va primero.
  assert.equal(r.filas[0].id, 'ilim');
  assert.equal(r.filas[0].cuotasEquilibrio, 10);
  // Bono y clase suelta no dan ingreso mensual: fuera, y se cuenta.
  assert.ok(!r.filas.some(f => f.id === 'bono'));
  assert.equal(r.planesNoMensuales, 1);
});

test('con este horario no se llega: la ocupación que exige pasa del 100 %', () => {
  const r = simularEconomia(base({ instructoras: [], plazasSemana: 20 }));
  assert.ok(r.filas.find(f => f.id === 'm2')!.ocupacion! > 1);
});

test('meses de colchón sin vender una más, descontando lo que ya entra', () => {
  const r = simularEconomia(base({ instructoras: [], cuotasActivas: ['m2', 'm2', 'bono'] }));
  assert.equal(r.cuotasMensualesVendidas, 2);
  assert.equal(r.ingresoActualMes, 200);
  assert.equal(r.deficitMes, 1800);
  assert.ok(Math.abs(r.mesesColchon! - 12000 / 1800) < 1e-9);
});

test('mezcla real solo con 5 cuotas o más: con menos sería el precio de dos o tres personas', () => {
  assert.ok(!simularEconomia(base({ cuotasActivas: ['m2', 'm2', 'ilim', 'ilim'] })).filas.some(f => f.id === 'MEZCLA'));
  const r = simularEconomia(base({ instructoras: [], cuotasActivas: ['m2', 'm2', 'm2', 'ilim', 'ilim'] }));
  const mezcla = r.filas[0];
  assert.equal(mezcla.id, 'MEZCLA');
  assert.equal(mezcla.netoCuotaMes, 140); // (3·100 + 2·200) / 5
});

test('sin fijos no hay equilibrio que calcular: se piden, no se suponen', () => {
  const r = simularEconomia(base({ fijosMes: null, colchon: null }));
  assert.deepEqual(r.faltan, ['fijos', 'colchon']);
  assert.equal(r.filas.length, 0);
  assert.equal(r.deficitMes, null);
  assert.equal(r.mesesColchon, null);
});

test('ritmo mínimo: la pérdida por el camino (D²/2rp) tiene que caber en el colchón', () => {
  // D=2000, p=100, C=10000 → r ≥ 4.000.000 / 2.000.000 = 2
  assert.equal(ritmoMinimo(2000, 100, 10000), 2);
  assert.equal(ritmoMinimo(0, 100, 10000), null); // ya se cubren gastos
  assert.equal(ritmoMinimo(2000, 100, 0), null);
});
