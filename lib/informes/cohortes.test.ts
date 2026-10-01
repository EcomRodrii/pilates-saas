import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cohortesPorPrimeraCompra, MUESTRA_MINIMA_COHORTE, type DatosCohortes } from './cohortes.ts';

const HOY = '2026-10-01';
const PLANES = [
  { id: 'bono', esPrueba: false },
  { id: 'prueba', esPrueba: true },
];

let nSesion = 0;
/** Una clienta que compró `compra` (plan real) y vino (o reservó) esos días. */
function clienta(id: string, compra: string | null, clases: { dia: string; estado?: string }[] = [], extra: { leadStage?: string; pruebaEl?: string; plan?: string } = {}) {
  const sesiones = clases.map(c => ({ id: `s${nSesion++}`, inicio: `${c.dia}T09:00:00Z` }));
  return {
    socio: { id, leadStage: extra.leadStage },
    suscripciones: [
      ...(compra ? [{ socioId: id, planId: extra.plan ?? 'bono', fechaInicio: compra }] : []),
      ...(extra.pruebaEl ? [{ socioId: id, planId: 'prueba', fechaInicio: extra.pruebaEl }] : []),
    ],
    sesiones,
    reservas: clases.map((c, i) => ({ socioId: id, sesionId: sesiones[i].id, estado: c.estado ?? 'ASISTIDA' })),
  };
}

function datos(...cs: ReturnType<typeof clienta>[]): DatosCohortes {
  return {
    socios: cs.map(c => c.socio) as DatosCohortes['socios'],
    suscripciones: cs.flatMap(c => c.suscripciones),
    planesTarifa: PLANES,
    reservas: cs.flatMap(c => c.reservas),
    sesiones: cs.flatMap(c => c.sesiones),
  };
}

const fila = (filas: ReturnType<typeof cohortesPorPrimeraCompra>, mes: string) => filas.find(f => f.mes === mes)!;

test('los seis últimos meses, del más antiguo al actual', () => {
  const filas = cohortesPorPrimeraCompra(datos(), HOY);
  assert.deepEqual(filas.map(f => f.mes), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.ok(filas.every(f => f.empezaron === 0));
});

test('sigue en su 2.º mes si vino entre el día 31 y el 60 desde su primera compra; en el 3.º, entre el 61 y el 90', () => {
  const filas = cohortesPorPrimeraCompra(datos(
    clienta('a', '2026-05-10', [{ dia: '2026-05-12' }, { dia: '2026-06-15' }, { dia: '2026-07-20' }]), // días 2, 36, 71
    clienta('b', '2026-05-10', [{ dia: '2026-05-12' }, { dia: '2026-06-01' }]), // días 2 y 22: ni 2.º ni 3.º
    clienta('c', '2026-05-20', [{ dia: '2026-08-15' }]), // día 87: solo 3.º
  ), HOY);
  const mayo = fila(filas, '2026-05');
  assert.equal(mayo.empezaron, 3);
  assert.equal(mayo.segundoMes?.siguen, 1);
  assert.equal(mayo.tercerMes?.siguen, 2);
});

test('una reserva CONFIRMADA o una falta no es «vino»: solo cuenta la asistida', () => {
  const filas = cohortesPorPrimeraCompra(datos(
    clienta('a', '2026-05-10', [{ dia: '2026-06-15', estado: 'CONFIRMADA' }, { dia: '2026-06-17', estado: 'NO_ASISTIO' }]),
  ), HOY);
  assert.equal(fila(filas, '2026-05').segundoMes?.siguen, 0);
});

test('hasta que no ha pasado su 2.º (o 3.er) mes entero, no se sabe: null, nunca cero', () => {
  // Agosto: la última que pudo empezar (31-ago) acaba su 2.º mes el 29-oct.
  const filas = cohortesPorPrimeraCompra(datos(clienta('a', '2026-08-05', [{ dia: '2026-09-10' }])), HOY);
  const agosto = fila(filas, '2026-08');
  assert.equal(agosto.empezaron, 1);
  assert.equal(agosto.segundoMes, null);
  assert.equal(agosto.tercerMes, null);
  // Julio: 2.º mes completo (31-jul + 59 = 28-sep), 3.º no (31-jul + 89 = 28-oct).
  const conJulio = cohortesPorPrimeraCompra(datos(clienta('b', '2026-07-03', [{ dia: '2026-08-10' }])), HOY);
  assert.equal(fila(conJulio, '2026-07').segundoMes?.siguen, 1);
  assert.equal(fila(conJulio, '2026-07').tercerMes, null);
});

test(`con menos de ${MUESTRA_MINIMA_COHORTE} no hay porcentaje; con ${MUESTRA_MINIMA_COHORTE} o más, sí`, () => {
  const pocas = cohortesPorPrimeraCompra(datos(
    clienta('a', '2026-05-10', [{ dia: '2026-06-15' }]),
    clienta('b', '2026-05-11'),
  ), HOY);
  assert.deepEqual(fila(pocas, '2026-05').segundoMes, { siguen: 1, pct: null });

  const cinco = cohortesPorPrimeraCompra(datos(
    clienta('a', '2026-05-10', [{ dia: '2026-06-15' }]),
    clienta('b', '2026-05-10', [{ dia: '2026-06-16' }]),
    clienta('c', '2026-05-10'),
    clienta('d', '2026-05-10'),
    clienta('e', '2026-05-10'),
  ), HOY);
  assert.deepEqual(fila(cinco, '2026-05').segundoMes, { siguen: 2, pct: 40 });
});

test('no empiezan: las importadas con historial, las que ya venían de antes y las que solo tuvieron su prueba', () => {
  const filas = cohortesPorPrimeraCompra(datos(
    clienta('importada', '2026-05-10', [{ dia: '2026-06-15' }], { leadStage: 'ACTIVA' }),
    // Venía desde enero (otro sistema): su «primera compra» de mayo no es empezar.
    clienta('veterana', '2026-05-10', [{ dia: '2026-01-15' }, { dia: '2026-06-15' }]),
    clienta('solo-prueba', null, [{ dia: '2026-05-05' }], { pruebaEl: '2026-05-01' }),
  ), HOY);
  assert.equal(fila(filas, '2026-05').empezaron, 0);
});

test('venir a su prueba unos días antes de comprar sigue siendo empezar ese mes (la misma regla que «Nueva»)', () => {
  const filas = cohortesPorPrimeraCompra(datos(
    clienta('a', '2026-05-10', [{ dia: '2026-05-02' }, { dia: '2026-06-20' }], { pruebaEl: '2026-04-28' }),
  ), HOY);
  const mayo = fila(filas, '2026-05');
  assert.equal(mayo.empezaron, 1);
  assert.equal(mayo.segundoMes?.siguen, 1);
});

test('un plan que ya no está en el catálogo cuenta como compra; una compra futura, todavía no', () => {
  const filas = cohortesPorPrimeraCompra(datos(
    clienta('a', '2026-05-10', [], { plan: 'borrado' }),
    clienta('b', '2026-10-15'),
  ), HOY);
  assert.equal(fila(filas, '2026-05').empezaron, 1);
  assert.equal(fila(filas, '2026-10').empezaron, 0);
});

test('una ficha que ya no está (borrada) no cuenta aunque queden sus compras', () => {
  const d = datos(clienta('a', '2026-05-10'));
  const filas = cohortesPorPrimeraCompra({ ...d, socios: [] }, HOY);
  assert.equal(fila(filas, '2026-05').empezaron, 0);
});
