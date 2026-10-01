import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  situacionRecibo, importeIngresado, importeAdeudado, importeEnCurso, estaSinCobrar,
  mesDelRecibo, mesAnterior, resumirRecibos, type ReciboParaCifras,
} from './situacion-recibo.ts';

const r = (p: Partial<ReciboParaCifras>): ReciboParaCifras => ({
  estado: 'COBRADO', importe: 50, importeDevuelto: 0, fechaCobro: '2026-08-14', fechaVencimiento: '2026-08-01', socioId: 'soc-1', ...p,
});

test('cada estado cae en una sola situación', () => {
  assert.equal(situacionRecibo(r({ estado: 'COBRADO' })), 'COBRADO');
  assert.equal(situacionRecibo(r({ estado: 'PENDIENTE' })), 'POR_COBRAR');
  assert.equal(situacionRecibo(r({ estado: 'EN_CURSO' })), 'EN_CURSO');
  assert.equal(situacionRecibo(r({ estado: 'FALLIDO' })), 'IMPAGADO');
  assert.equal(situacionRecibo(r({ estado: 'ANULADO' })), 'ANULADO');
});

test('DEVUELTO por el banco es deuda; reembolsado por el estudio no', () => {
  // Adeudo SEPA rechazado / «devuelto» a mano: nunca entró, se sigue debiendo.
  assert.equal(situacionRecibo(r({ estado: 'DEVUELTO', importeDevuelto: 0 })), 'IMPAGADO');
  // Reembolso total: el dinero volvió a la clienta.
  assert.equal(situacionRecibo(r({ estado: 'DEVUELTO', importeDevuelto: 50 })), 'REEMBOLSADO');
  // Reembolso pedido a Stripe, aún sin el webhook: tampoco se le vuelve a cobrar.
  assert.equal(situacionRecibo(r({ estado: 'DEVUELTO', importeDevuelto: 0, reembolsoSolicitadoEn: '2026-09-01T10:00:00Z' })), 'REEMBOLSADO');
});

test('un estado desconocido no cuenta como dinero en ninguna cifra', () => {
  const raro = r({ estado: 'INVENTADO' });
  assert.equal(importeIngresado(raro), 0);
  assert.equal(importeAdeudado(raro), 0);
  assert.equal(estaSinCobrar(raro), false);
});

test('lo ingresado es neto de reembolsos parciales', () => {
  assert.equal(importeIngresado(r({ importe: 60, importeDevuelto: 15 })), 45);
  assert.equal(importeIngresado(r({ importe: '60.00', importeDevuelto: '15.50' })), 44.5);
  // COBRADO con el reembolso total ya anotado pero sin estado movido: 0.
  assert.equal(situacionRecibo(r({ importe: 60, importeDevuelto: 60 })), 'REEMBOLSADO');
  assert.equal(importeIngresado(r({ importe: 60, importeDevuelto: 60 })), 0);
});

test('FALLIDO y EN_CURSO nunca son ingreso; EN_CURSO tampoco es deuda', () => {
  assert.equal(importeIngresado(r({ estado: 'FALLIDO' })), 0);
  assert.equal(importeIngresado(r({ estado: 'EN_CURSO' })), 0);
  assert.equal(importeAdeudado(r({ estado: 'EN_CURSO' })), 0);
  assert.equal(importeEnCurso(r({ estado: 'EN_CURSO' })), 50);
  assert.equal(importeAdeudado(r({ estado: 'FALLIDO' })), 50);
  assert.equal(importeAdeudado(r({ estado: 'PENDIENTE' })), 50);
});

test('«Sin cobrar» incluye lo devuelto por el banco y lo que está en el banco', () => {
  assert.equal(estaSinCobrar(r({ estado: 'DEVUELTO', importeDevuelto: 0 })), true);
  assert.equal(estaSinCobrar(r({ estado: 'EN_CURSO' })), true);
  assert.equal(estaSinCobrar(r({ estado: 'DEVUELTO', importeDevuelto: 50 })), false);
  assert.equal(estaSinCobrar(r({ estado: 'COBRADO' })), false);
});

test('lo cobrado cuenta en el mes de COBRO, no en el de vencimiento', () => {
  // Renovación de bono cobrada en agosto con vencimiento en octubre: el caso
  // medido en producción que metía 128 € en un octubre sin cobros.
  const renovacion = r({ fechaCobro: '2026-08-05', fechaVencimiento: '2026-10-20' });
  assert.equal(mesDelRecibo(renovacion), '2026-08');
  assert.equal(mesDelRecibo(r({ estado: 'PENDIENTE', fechaCobro: null, fechaVencimiento: '2026-10-20' })), '2026-10');
  // Reembolsado: se enseña en el mes en que entró (y no suma).
  assert.equal(mesDelRecibo(r({ estado: 'DEVUELTO', importeDevuelto: 50, fechaCobro: '2026-07-02' })), '2026-07');
});

test('mes anterior sin Date: 31-oct, 1-ene y marzo', () => {
  assert.equal(mesAnterior('2026-10'), '2026-09');
  assert.equal(mesAnterior('2026-01'), '2025-12');
  assert.equal(mesAnterior('2026-03'), '2026-02');
});

test('el resumen separa lo debido de lo que está en el banco', () => {
  const s = resumirRecibos([
    r({ estado: 'COBRADO', importe: 100, importeDevuelto: 20, socioId: 'a' }),
    r({ estado: 'COBRADO', importe: 30, socioId: null }), // venta de mostrador sin clienta
    r({ estado: 'PENDIENTE', importe: 40, socioId: 'b' }),
    r({ estado: 'FALLIDO', importe: 25, socioId: 'b' }),
    r({ estado: 'DEVUELTO', importe: 10, importeDevuelto: 0, socioId: 'c' }),
    r({ estado: 'EN_CURSO', importe: 60, socioId: 'd' }),
    r({ estado: 'DEVUELTO', importe: 70, importeDevuelto: 70, socioId: 'e' }),
    r({ estado: 'ANULADO', importe: 999, socioId: 'f' }),
  ]);
  assert.equal(s.ingresado, 110);
  assert.equal(s.ingresadoClientas, 80);
  assert.equal(s.porCobrar, 40);
  assert.equal(s.impagado, 35);
  assert.equal(s.enCurso, 60);
  assert.equal(s.nCobrados, 2);
  assert.equal(s.nClientasQuePagaron, 1);
  assert.equal(s.nClientasConDeuda, 2);
});

test('sumas a céntimos, sin restos de coma flotante', () => {
  const s = resumirRecibos([r({ importe: 0.1 }), r({ importe: 0.2 })]);
  assert.equal(s.ingresado, 0.3);
});

// ── La mitad SQL dice lo mismo ──────────────────────────────────────────────
// Las RPC de /informes suman en Postgres. Si la regla cambia aquí y no allí,
// Informes y Cobros vuelven a dar cifras distintas: se lee la migración
// vigente que define cada función y se exige que usen la helper.

const DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

function cuerpoVigente(funcion: string): string {
  const re = new RegExp(`create or replace function public\\.${funcion}\\s*\\(`, 'i');
  const ficheros = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
  let ultimo: string | null = null;
  for (const f of ficheros) {
    const sql = readFileSync(join(DIR, f), 'utf8');
    const i = sql.search(re);
    if (i < 0) continue;
    const desde = sql.indexOf('$$', i);
    const hasta = sql.indexOf('$$', desde + 2);
    ultimo = sql.slice(desde + 2, hasta);
  }
  if (!ultimo) throw new Error(`no hay migración que defina ${funcion}`);
  return ultimo;
}

test('la helper SQL resta lo devuelto solo en COBRADO', () => {
  const cuerpo = cuerpoVigente('recibo_importe_ingresado').replace(/\s+/g, ' ');
  assert.match(cuerpo, /p_estado = 'COBRADO'/);
  assert.match(cuerpo, /greatest\(coalesce\(p_importe, 0\) - coalesce\(p_importe_devuelto, 0\), 0\)/);
});

for (const rpc of ['informe_ingresos', 'informe_ingresos_neto', 'ingresos_por_dia', 'ventas_por_tipo']) {
  test(`${rpc} suma lo ingresado neto, no el importe bruto`, () => {
    const cuerpo = cuerpoVigente(rpc);
    assert.match(cuerpo, /recibo_importe_ingresado\(/, `${rpc} no usa la helper`);
    assert.doesNotMatch(cuerpo, /sum\(\s*(r\.)?importe\s*\)/i, `${rpc} vuelve a sumar el importe bruto`);
  });
}
