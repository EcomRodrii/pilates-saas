import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dineroDelTramo, huecosDelPeriodo, serieDelGrafico } from './dinero.ts';
import { ORDEN_MOTIVOS } from './motivo-cobro.ts';
import { cobradoEnTramo, mismoTramoAnterior, tramo, tramoVisible, type Periodo, type Tramo } from '../cobros/lo-cobrado.ts';
import { aCentimos } from '../billing/situacion-recibo.ts';

const tipoDePlanDe = (id: string) => ({ 'sus-m': 'MENSUAL', 'sus-b': 'BONO', 'sus-p': 'PUNTUAL' } as const)[id as 'sus-m'];

let n = 0;
const r = (fechaCobro: string, importe: number, extra: Record<string, unknown> = {}) => ({
  id: `rec-${n++}`, estado: 'COBRADO', importe, importeDevuelto: 0, fechaCobro, metodoCobro: 'EFECTIVO',
  socioId: 'soc-1', suscripcionId: 'sus-m', ...extra,
});

/** Un año de cobros variados: céntimos raros, devoluciones, caja sin clienta, bisiesto. */
function unAnio(y: number) {
  const out: ReturnType<typeof r>[] = [];
  const subs = ['sus-m', 'sus-b', 'sus-p', null];
  for (let m = 1; m <= 12; m++) {
    for (const d of [1, 9, 15, 28, 29, 30, 31]) {
      const f = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (new Date(`${f}T12:00:00Z`).toISOString().slice(0, 10) !== f) continue; // 30 de febrero, etc.
      const k = m * 31 + d;
      out.push(r(f, 10 + (k % 7) * 3.33, { suscripcionId: subs[k % 4], socioId: k % 5 ? `soc-${k % 9}` : null }));
      if (k % 3 === 0) out.push(r(f, 25.1, { id: `rec-pos-${k}`, socioId: null, suscripcionId: null }));
      if (k % 4 === 0) out.push(r(f, 40, { id: `rec-cita-${k}`, importeDevuelto: 12.5 }));
      if (k % 6 === 0) out.push(r(f, 15, { estado: 'DEVUELTO', importeDevuelto: 15 }));
      if (k % 8 === 0) out.push(r(f, 30, { estado: 'PENDIENTE', fechaCobro: null }));
    }
  }
  return out;
}

const recibos = [...unAnio(2027), ...unAnio(2028)];

function comprobar(periodo: Periodo, t: Tramo) {
  const d = dineroDelTramo(recibos, t, { periodo, tipoDePlanDe });
  const c = cobradoEnTramo(recibos, t);
  assert.equal(d.neto, c.neto, `${periodo} ${t.desde}→${t.hasta}: el titular es el de Cobros`);
  const sumaMotivos = aCentimos(ORDEN_MOTIVOS.reduce((s, m) => s + d.porMotivo[m].neto, 0));
  assert.equal(sumaMotivos, c.neto, `${periodo} ${t.desde}→${t.hasta}: los motivos suman el total`);
  const sumaSerie = aCentimos([...d.serie.values()].reduce((s, x) => s + x, 0));
  assert.equal(sumaSerie, c.neto, `${periodo} ${t.desde}→${t.hasta}: el gráfico suma el total`);
}

test('cuadra al céntimo con «Lo que he cobrado»: mes cerrado, a medias, bisiesto, trimestre y año', () => {
  comprobar('MES', tramo('MES', '2027-09-10'));
  comprobar('MES', tramoVisible('MES', '2027-10-01', '2027-10-15')!);
  comprobar('MES', tramo('MES', '2028-02-10'));
  comprobar('MES', mismoTramoAnterior('MES', tramoVisible('MES', '2028-03-30', '2028-03-30')!)!);
  comprobar('TRIMESTRE', tramo('TRIMESTRE', '2027-05-10'));
  comprobar('TRIMESTRE', tramoVisible('TRIMESTRE', '2028-05-31', '2028-05-31')!);
  comprobar('TRIMESTRE', mismoTramoAnterior('TRIMESTRE', tramoVisible('TRIMESTRE', '2028-05-31', '2028-05-31')!)!);
  comprobar('ANIO', tramo('ANIO', '2028-01-01'));
  comprobar('ANIO', tramoVisible('ANIO', '2028-02-29', '2028-02-29')!);
  comprobar('SEMANA', tramo('SEMANA', '2028-02-29'));
});

test('el desglose por motivo y el ingreso medio por clienta que pagó', () => {
  const t = { desde: '2026-10-01', hasta: '2026-10-31' };
  const lista = [
    r('2026-10-01', 89, { socioId: 'a', suscripcionId: 'sus-m' }),
    r('2026-10-02', 130, { socioId: 'b', suscripcionId: 'sus-b' }),
    r('2026-10-02', 89, { socioId: 'a', suscripcionId: 'sus-m' }),
    r('2026-10-03', 20, { id: 'rec-pos-1', socioId: null, suscripcionId: null }), // caja sin clienta
    r('2026-10-03', 15, { id: 'rec-suelta-res-1', socioId: 'c', suscripcionId: null, importeDevuelto: 15, estado: 'DEVUELTO' }), // devuelto entero
    r('2026-10-04', 50, { id: 'rec-cita-1', socioId: 'c', suscripcionId: null, importeDevuelto: 10 }),
  ];
  const d = dineroDelTramo(lista, t, { periodo: 'MES', tipoDePlanDe });
  assert.equal(d.neto, 89 + 130 + 89 + 20 + 40);
  assert.deepEqual(d.porMotivo.CUOTA, { n: 2, neto: 178 });
  assert.deepEqual(d.porMotivo.BONO, { n: 1, neto: 130 });
  assert.deepEqual(d.porMotivo.CAJA, { n: 1, neto: 20 });
  assert.deepEqual(d.porMotivo.SESION_PRIVADA, { n: 1, neto: 40 });
  assert.deepEqual(d.porMotivo.CLASE_SUELTA, { n: 0, neto: 0 }, 'devuelto entero: no deja dinero');
  // Pagaron a (178), b (130) y c (40): 348 € entre 3. La caja sin clienta no cuenta.
  assert.equal(d.clientasQuePagaron, 3);
  assert.equal(d.pagadoPorClientas, 348);
  assert.equal(d.ingresoMedioPorClienta, 116);
  assert.equal(dineroDelTramo([], t, { periodo: 'MES', tipoDePlanDe }).ingresoMedioPorClienta, null);
});

test('la serie va por día en semana y mes, y por mes en trimestre y año', () => {
  const lista = [r('2026-10-01', 10), r('2026-10-01', 5), r('2026-11-20', 7)];
  const mes = dineroDelTramo(lista, tramo('MES', '2026-10-01'), { periodo: 'MES', tipoDePlanDe });
  assert.deepEqual([...mes.serie.entries()], [['2026-10-01', 15]]);
  const trim = dineroDelTramo(lista, tramo('TRIMESTRE', '2026-10-01'), { periodo: 'TRIMESTRE', tipoDePlanDe });
  assert.deepEqual([...trim.serie.entries()], [['2026-10', 15], ['2026-11', 7]]);
});

test('los huecos del gráfico: el periodo entero', () => {
  assert.equal(huecosDelPeriodo('MES', '2028-02-10').length, 29);
  assert.deepEqual(huecosDelPeriodo('SEMANA', '2026-10-02'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(huecosDelPeriodo('TRIMESTRE', '2026-11-15'), ['2026-10', '2026-11', '2026-12']);
  assert.equal(huecosDelPeriodo('ANIO', '2026-11-15').length, 12);
});

test('el gráfico: lo de ahora hasta donde se ve, y el anterior por posición hasta donde llega su tramo', () => {
  const lista = [r('2026-10-01', 10), r('2026-10-02', 20), r('2026-09-01', 5), r('2026-09-02', 6), r('2026-09-03', 99)];
  const visible = tramoVisible('MES', '2026-10-02', '2026-10-02')!;
  const anteriorT = mismoTramoAnterior('MES', visible)!;
  const ctx = { periodo: 'MES' as const, tipoDePlanDe };
  const puntos = serieDelGrafico('MES', visible, dineroDelTramo(lista, visible, ctx), { tramo: anteriorT, dinero: dineroDelTramo(lista, anteriorT, ctx) });
  assert.equal(puntos.length, 31);
  assert.deepEqual(puntos.slice(0, 3).map(p => [p.etiqueta, p.actual, p.anterior]), [['1', 10, 5], ['2', 20, 6], ['3', null, null]]);
  // Mes cerrado: el anterior entero, y si es más corto, sus huecos de más quedan vacíos.
  const oct = tramo('MES', '2026-10-01');
  const sep = mismoTramoAnterior('MES', oct)!;
  const enteros = serieDelGrafico('MES', oct, dineroDelTramo(lista, oct, ctx), { tramo: sep, dinero: dineroDelTramo(lista, sep, ctx) });
  assert.equal(enteros[2].anterior, 99);
  assert.equal(enteros[29].anterior, 0);
  assert.equal(enteros[30].anterior, null, 'septiembre no tiene 31');
  assert.equal(enteros[30].actual, 0);
});
