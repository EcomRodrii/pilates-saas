import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altasDelMes, altasPorMes, ingresosAlDia, ingresosPorMes, lunesDe, marcasEje, ocupacionEntre, ocupadasPorSesion, reservasPorDia, semanaDe, semanaISO } from './cifras.ts';

const dia = (inicio: string) => inicio.slice(0, 10);

test('la ocupación es de plazas, no la media de porcentajes por clase', () => {
  const sesiones = [
    { id: 'a', inicio: '2026-10-14T09:00:00Z', aforoMaximo: 4 },
    { id: 'b', inicio: '2026-10-14T18:00:00Z', aforoMaximo: 12 },
  ];
  const ocupadas = ocupadasPorSesion([
    ...Array.from({ length: 4 }, () => ({ sesionId: 'a', estado: 'CONFIRMADA' })),
  ]);
  // La media por clase diría 50 %; las plazas dicen 4 de 16.
  assert.deepEqual(ocupacionEntre(sesiones, ocupadas, '2026-10-14', '2026-10-14', dia), { pct: 25, ocupadas: 4, plazas: 16, clases: 2 });
});

test('solo cuentan confirmadas y asistidas, y nunca más de lo que cabe', () => {
  const ocupadas = ocupadasPorSesion([
    { sesionId: 'a', estado: 'CONFIRMADA' },
    { sesionId: 'a', estado: 'ASISTIDA' },
    { sesionId: 'a', estado: 'LISTA_ESPERA' },
    { sesionId: 'a', estado: 'NO_ASISTIO' },
    { sesionId: 'a', estado: 'CANCELADA' },
    { sesionId: 'b', estado: 'CONFIRMADA' },
    { sesionId: 'b', estado: 'CONFIRMADA' },
    { sesionId: 'b', estado: 'CONFIRMADA' },
  ]);
  assert.equal(ocupadas.get('a'), 2);
  const sobrevendida = [{ id: 'b', inicio: '2026-10-14T09:00:00Z', aforoMaximo: 2 }];
  assert.deepEqual(ocupacionEntre(sobrevendida, ocupadas, '2026-10-14', '2026-10-14', dia), { pct: 100, ocupadas: 2, plazas: 2, clases: 1 });
});

test('sin clases con aforo no hay ocupación (null), ni siquiera del 0 %', () => {
  const sesiones = [
    { id: 'a', inicio: '2026-10-14T09:00:00Z', aforoMaximo: 8, cancelada: true },
    { id: 'b', inicio: '2026-10-14T10:00:00Z', aforoMaximo: 0 },
    { id: 'c', inicio: '2026-10-15T10:00:00Z', aforoMaximo: 8 },
  ];
  assert.deepEqual(ocupacionEntre(sesiones, new Map(), '2026-10-14', '2026-10-14', dia), { pct: null, ocupadas: 0, plazas: 0, clases: 0 });
});

test('el día de la clase lo decide `diaDe` (el del estudio), no el texto UTC', () => {
  // 23:30 UTC del 13 es ya el 14 en Madrid.
  const sesiones = [{ id: 'a', inicio: '2026-10-13T23:30:00Z', aforoMaximo: 6 }];
  const madrid = (inicio: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(inicio));
  assert.equal(ocupacionEntre(sesiones, new Map(), '2026-10-14', '2026-10-14', madrid).clases, 1);
  assert.equal(ocupacionEntre(sesiones, new Map(), '2026-10-14', '2026-10-14', dia).clases, 0);
});

test('la semana va de lunes a domingo, también si hoy es domingo', () => {
  assert.equal(lunesDe('2026-10-14'), '2026-10-12'); // miércoles
  assert.equal(lunesDe('2026-10-18'), '2026-10-12'); // domingo: su semana, no la siguiente
  assert.equal(lunesDe('2026-10-12'), '2026-10-12');
  assert.deepEqual(semanaDe('2026-10-18'), { desde: '2026-10-12', hasta: '2026-10-18' });
  // Cruzando el cambio de hora (25-oct) y el de mes.
  assert.deepEqual(semanaDe('2026-10-28'), { desde: '2026-10-26', hasta: '2026-11-01' });
});

test('número de semana ISO, con los bordes de año', () => {
  assert.equal(semanaISO('2026-10-14'), 42);
  assert.equal(semanaISO('2026-01-01'), 1); // jueves
  assert.equal(semanaISO('2027-01-01'), 53); // viernes: aún es la semana 53 de 2026
  assert.equal(semanaISO('2024-12-30'), 1); // lunes: ya es la 1 de 2025
});

test('ingresos por mes: netos, en el mes de cobro y con el mes en curso al final', () => {
  const recibos = [
    { estado: 'COBRADO', importe: 60, fechaCobro: '2026-10-02' },
    { estado: 'COBRADO', importe: 50, importeDevuelto: 20, fechaCobro: '2026-10-10' },
    { estado: 'COBRADO', importe: 40, fechaCobro: '2026-09-30' },
    { estado: 'PENDIENTE', importe: 99, fechaCobro: null },
    { estado: 'COBRADO', importe: 70, fechaCobro: '2026-03-01' }, // fuera de los 3 meses
  ];
  assert.deepEqual(ingresosPorMes(recibos, '2026-10-14', 3), [
    { clave: '2026-08', etiqueta: 'ago', total: 0, actual: false },
    { clave: '2026-09', etiqueta: 'sep', total: 40, actual: false },
    { clave: '2026-10', etiqueta: 'oct', total: 90, actual: true },
  ]);
});

test('ingresos por mes cruzan el año', () => {
  const meses = ingresosPorMes([], '2026-02-10', 4).map(m => m.clave);
  assert.deepEqual(meses, ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('ingresos al día: el mes pasado solo hasta el mismo día', () => {
  const recibos = [
    { estado: 'COBRADO', importe: 100, fechaCobro: '2026-10-03' },
    { estado: 'COBRADO', importe: 80, fechaCobro: '2026-09-10' },
    { estado: 'COBRADO', importe: 500, fechaCobro: '2026-09-25' }, // después del día 14: no cuenta
    { estado: 'COBRADO', importe: 30, fechaCobro: '2026-10-20' }, // futuro (fecha mal puesta): no cuenta
  ];
  assert.deepEqual(ingresosAlDia(recibos, '2026-10-14'), { actual: 100, anterior: 80, mesAnterior: 'septiembre' });
  assert.equal(ingresosAlDia([], '2026-01-05').mesAnterior, 'diciembre');
});

test('reservas por día: por el día en que se hicieron, los últimos n días', () => {
  const r = [
    { creadoEn: '2026-10-14T08:00:00Z' },
    { creadoEn: '2026-10-14T09:00:00Z' },
    { creadoEn: '2026-10-12T09:00:00Z' },
    { creadoEn: '2026-09-01T09:00:00Z' }, // fuera
    { creadoEn: null },
  ];
  assert.deepEqual(reservasPorDia(r, '2026-10-14', 3, dia), [
    { clave: '2026-10-12', valor: 1 },
    { clave: '2026-10-13', valor: 0 },
    { clave: '2026-10-14', valor: 2 },
  ]);
});

test('altas por mes y altas del mes, con el mes pasado al mismo día', () => {
  const s = [
    { fechaAlta: '2026-10-02T10:00:00Z' },
    { fechaAlta: '2026-10-11T10:00:00Z' },
    { fechaAlta: '2026-10-11T12:00:00Z' },
    { fechaAlta: '2026-09-05T10:00:00Z' },
    { fechaAlta: '2026-09-20T10:00:00Z' }, // después del día 14: no cuenta para «a estas alturas»
  ];
  assert.deepEqual(altasPorMes(s, '2026-10-14', 2, dia), [{ clave: '2026-09', valor: 2 }, { clave: '2026-10', valor: 3 }]);
  const a = altasDelMes(s, '2026-10-14', dia);
  assert.equal(a.porDia.length, 31);
  assert.equal(a.porDia[10], 2);
  assert.equal(a.porDia[1], 1);
  assert.equal(a.total, 3);
  assert.equal(a.hoy, 14);
  assert.equal(a.mesPasadoAlDia, 1);
  assert.equal(altasDelMes([], '2026-02-10', dia).porDia.length, 28);
});

test('marcas del eje: redondas y con margen', () => {
  assert.deepEqual(marcasEje(0), [0, 1, 2, 3, 4]);
  assert.deepEqual(marcasEje(1), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(marcasEje(7), [0, 2, 4, 6, 8]);
  assert.deepEqual(marcasEje(170), [0, 50, 100, 150, 200]);
  assert.deepEqual(marcasEje(1234), [0, 500, 1000, 1500, 2000]);
  // Contando: sin decimales.
  assert.deepEqual(marcasEje(1, 4, true), [0, 1]);
  assert.deepEqual(marcasEje(3, 4, true), [0, 1, 2, 3]);
  assert.deepEqual(marcasEje(13, 4, true), [0, 5, 10, 15, 20]);
  assert.deepEqual(marcasEje(6, 4, true), [0, 2, 4, 6, 8]);
});
