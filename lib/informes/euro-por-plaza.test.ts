import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cortesDeColor, faltanLosPlanes, finDelMesPasado, finDelTrimestrePasado, mapaEuroPorPlaza, MIN_CLASES_CELDA, nivelDeColor, periodoCerrado,
} from './euro-por-plaza.ts';
import { dineroDelTramo, type ReciboDeInforme } from './dinero.ts';
import type { ReservaParaInforme, SesionParaInforme } from './clases.ts';
import type { TipoPlan } from '../types.ts';

// El tercer trimestre de 2026, ya cerrado.
const T = { desde: '2026-07-01', hasta: '2026-09-30' };
const AHORA = new Date('2026-10-13T10:00:00Z');

/** Martes 18:00 de Madrid (16:00Z en verano) de la semana `n` (0 = la del 7-jul). */
const martes18 = (n: number) => new Date(Date.UTC(2026, 6, 7 + 7 * n, 16)).toISOString();
const jueves10 = (n: number) => new Date(Date.UTC(2026, 6, 9 + 7 * n, 8)).toISOString();

const sesion = (id: string, inicio: string, aforo = 6, extra: Partial<SesionParaInforme> = {}): SesionParaInforme => ({
  id, tipoClaseId: 'tc-reformer', instructorId: 'ins-1', inicio, aforoMaximo: aforo, cancelada: false, ...extra,
});
const reserva = (sesionId: string, socioId: string | null, estado = 'ASISTIDA'): ReservaParaInforme => ({ sesionId, socioId, estado });

const TIPOS: Record<string, TipoPlan> = { 'sus-cuota': 'MENSUAL', 'sus-bono': 'BONO', 'sus-suelta': 'PUNTUAL' };
const tipoDePlanDe = (id: string) => TIPOS[id.split(':')[0]];
let n = 0;
const recibo = (socioId: string | null, importe: number, motivo: 'sus-cuota' | 'sus-bono' | 'sus-suelta' | null, extra: Partial<ReciboDeInforme> = {}): ReciboDeInforme => ({
  id: `rec-${++n}`, estado: 'COBRADO', importe, importeDevuelto: 0, fechaCobro: '2026-08-01', socioId,
  suscripcionId: motivo ? `${motivo}:${socioId}` : null, ...extra,
});

/** Cuatro martes a las 18:00 con 6 plazas: Ana (60 €, 4 clases), Marta (80 €, 4) y Lucía (40 €, 4). */
function ejemploDelExplicador() {
  const sesiones = [0, 1, 2, 3].map(i => sesion(`m${i}`, martes18(i)));
  const reservas = sesiones.flatMap(s => [reserva(s.id, 'ana'), reserva(s.id, 'marta'), reserva(s.id, 'lucia')]);
  const recibos = [recibo('ana', 60, 'sus-cuota'), recibo('marta', 80, 'sus-bono'), recibo('lucia', 40, 'sus-suelta')];
  return { sesiones, reservas, recibos };
}

test('el ejemplo del explicador sale igual de la función real: 15 + 20 + 10 = 45 € entre 6 plazas = 7,50 €', () => {
  const { sesiones, reservas, recibos } = ejemploDelExplicador();
  const m = mapaEuroPorPlaza(sesiones, reservas, recibos, T, AHORA, tipoDePlanDe);
  assert.equal(m.celdas.length, 1);
  const c = m.celdas[0];
  assert.deepEqual([c.dow, c.inicio, c.nClases, c.plazas, c.ocupadas], [2, '18:00', 4, 24, 12]);
  assert.equal(c.euroPorPlaza, 7.5);
  assert.equal(c.sesiones[0].repartido, 45);
  assert.deepEqual(c.ejemplo, { socioId: 'ana', pagado: 60, plazasEnElPeriodo: 4, valorPlaza: 15, plazasAqui: 4 }, 'empatadas en plazas, la de id menor');
});

test('cada alumna reparte lo que pagó entre TODAS sus plazas del periodo (180 € y 12 clases = 15 € cada una)', () => {
  const sesiones = [...[0, 1, 2, 3, 4, 5].map(i => sesion(`m${i}`, martes18(i))), ...[0, 1, 2, 3, 4, 5].map(i => sesion(`j${i}`, jueves10(i)))];
  const reservas = sesiones.map(s => reserva(s.id, 'ana'));
  const m = mapaEuroPorPlaza(sesiones, reservas, [recibo('ana', 180, 'sus-cuota')], T, AHORA, tipoDePlanDe);
  for (const c of m.celdas) {
    assert.equal(c.repartido, 90, '6 plazas de 15 € en cada franja');
    assert.equal(c.euroPorPlaza, 90 / 36);
  }
});

test(`con menos de ${MIN_CLASES_CELDA} clases, sin cifra pero con su base`, () => {
  const sesiones = [0, 1, 2].map(i => sesion(`m${i}`, martes18(i)));
  const m = mapaEuroPorPlaza(sesiones, sesiones.map(s => reserva(s.id, 'ana')), [recibo('ana', 30, 'sus-bono')], T, AHORA, tipoDePlanDe);
  const c = m.celdas[0];
  assert.equal(c.euroPorPlaza, null);
  assert.equal(c.nClases, 3);
  assert.equal(c.repartido, 30);
  assert.equal(m.total.euroPorPlaza, 30 / 18, 'el total del periodo sí lleva cifra');
});

test('ClassPass y alumnas sin cobro en el periodo ocupan plaza y valen 0 €, contadas aparte', () => {
  const { sesiones, reservas, recibos } = ejemploDelExplicador();
  const mas = [...reservas, reserva('m0', null), reserva('m1', 'sin-cobro'), reserva('m2', 'sin-cobro', 'NO_ASISTIO')];
  const c = mapaEuroPorPlaza(sesiones, mas, recibos, T, AHORA, tipoDePlanDe).celdas[0];
  assert.equal(c.externas, 1);
  assert.equal(c.sinCobro, 2);
  assert.equal(c.ocupadas, 15);
  assert.equal(c.repartido, 180, 'lo de las tres que pagaron, ni un céntimo más');
});

test('la Caja, las sesiones privadas, «otros» y lo sin clienta no se reparten, y cuadran con el titular', () => {
  const { sesiones, reservas, recibos } = ejemploDelExplicador();
  const fuera = [
    recibo('ana', 50, null, { id: 'rec-pos-1' }), // Caja: el ticket entero
    recibo('ana', 35, null, { id: 'rec-cita-1' }), // sesión privada
    recibo('ana', 20, null, { id: 'rec-web-mat-1' }), // matrícula
    recibo('ana', 10, null, { id: 'rec-penaliz-1' }), // penalización
    recibo(null, 40, 'sus-bono'), // un bono sin clienta
    recibo('marta', 25, null), // un cobro suelto sin plan
  ];
  const todos = [...recibos, ...fuera];
  const m = mapaEuroPorPlaza(sesiones, reservas, todos, T, AHORA, tipoDePlanDe);
  assert.deepEqual(
    { caja: m.cuadre.caja, privadas: m.cuadre.sesionesPrivadas, otros: m.cuadre.otros, sinClienta: m.cuadre.sinClienta, repartido: m.cuadre.repartido },
    { caja: 50, privadas: 35, otros: 55, sinClienta: 40, repartido: 180 },
  );
  const titular = dineroDelTramo(todos, T, { periodo: 'TRIMESTRE', tipoDePlanDe }).neto;
  const suma = m.cuadre.caja + m.cuadre.sesionesPrivadas + m.cuadre.otros + m.cuadre.sinClienta + m.cuadre.deNoVinieron + m.cuadre.repartido;
  assert.equal(m.cuadre.cobrado, titular);
  assert.ok(Math.abs(suma - titular) < 0.01, `${suma} ≠ ${titular}`);
});

test('el cuadre cierra al céntimo con repartos que no dan exacto (100 € entre 3 plazas)', () => {
  const sesiones = [0, 1, 2, 3, 4, 5].map(i => sesion(`m${i}`, martes18(i), 7));
  const reservas = [reserva('m0', 'ana'), reserva('m1', 'ana'), reserva('m2', 'ana'), reserva('m3', 'bea'), reserva('m4', 'bea'), reserva('m5', 'bea')];
  const recibos = [recibo('ana', 100, 'sus-cuota'), recibo('bea', 33.33, 'sus-bono'), recibo('carla', 70, 'sus-cuota')];
  const m = mapaEuroPorPlaza(sesiones, reservas, recibos, T, AHORA, tipoDePlanDe);
  assert.equal(m.cuadre.deNoVinieron, 70, 'Carla pagó y no vino');
  const suma = m.cuadre.deNoVinieron + m.cuadre.repartido;
  assert.ok(Math.abs(suma - m.cuadre.cobrado) < 0.01);
});

test('un reembolso parcial cuenta neto; un recibo devuelto por el banco, 0; fuera del periodo, nada', () => {
  const { sesiones, reservas } = ejemploDelExplicador();
  const recibos = [
    recibo('ana', 60, 'sus-cuota', { importeDevuelto: 20 }),
    recibo('marta', 80, 'sus-bono', { estado: 'DEVUELTO', importeDevuelto: 0 }),
    recibo('lucia', 40, 'sus-suelta', { fechaCobro: '2026-06-30' }),
  ];
  const c = mapaEuroPorPlaza(sesiones, reservas, recibos, T, AHORA, tipoDePlanDe).celdas[0];
  assert.equal(c.repartido, 40, 'solo los 40 € netos de Ana');
  assert.equal(c.sinCobro, 8, 'Marta y Lucía: 4 + 4 plazas a 0 €');
});

test('las canceladas, las que aún no han empezado y un aforo 0 sin reservas no rompen nada', () => {
  const sesiones = [
    sesion('c', martes18(0), 6, { cancelada: true }),
    sesion('f', '2026-10-20T16:00:00.000Z'),
    ...[1, 2, 3, 4].map(i => sesion(`z${i}`, martes18(i), 0)),
  ];
  const m = mapaEuroPorPlaza(sesiones, [reserva('c', 'ana')], [recibo('ana', 10, 'sus-bono')], T, AHORA, tipoDePlanDe);
  assert.equal(m.celdas.length, 1);
  assert.equal(m.celdas[0].nClases, 4);
  assert.equal(m.celdas[0].euroPorPlaza, null, 'sin plazas no se divide');
  assert.equal(m.total.euroPorPlaza, null);
  assert.equal(m.cuadre.deNoVinieron, 10, 'la cancelada no le cuenta plaza: pagó y no ocupó ninguna');
});

test('más reservas que aforo (o aforo 0 con reservas): cuentan las ocupadas, ni plazas libres negativas ni total inflado', () => {
  // Martes con 6 plazas y jueves con aforo 0 pero 1 reserva cada uno; Ana paga 80 € y viene a los 8.
  const sesiones = [...[0, 1, 2, 3].map(i => sesion(`m${i}`, martes18(i))), ...[0, 1, 2, 3].map(i => sesion(`j${i}`, jueves10(i), 0))];
  const m = mapaEuroPorPlaza(sesiones, sesiones.map(s => reserva(s.id, 'ana')), [recibo('ana', 80, 'sus-cuota')], T, AHORA, tipoDePlanDe);
  const jueves = m.celdas.find(c => c.dow === 4)!;
  assert.equal(jueves.plazas, 4);
  assert.equal(m.total.plazas, 28);
  assert.equal(m.total.euroPorPlaza, 80 / 28, 'el dinero de los jueves se divide también entre sus plazas');
  // Aforo 2 con 3 reservas: 3 plazas, ocupadas al 100 %.
  const lleno = mapaEuroPorPlaza([sesion('x', martes18(0), 2)], ['a', 'b', 'c'].map(x => reserva('x', x)), [], T, AHORA, tipoDePlanDe).celdas[0];
  assert.deepEqual([lleno.plazas, lleno.ocupadas, lleno.pct], [3, 3, 100]);
});

test('un reembolso total, por el estudio o por Stripe, deja 0 € a repartir', () => {
  const { sesiones, reservas } = ejemploDelExplicador();
  const recibos = [
    recibo('ana', 60, 'sus-cuota', { importeDevuelto: 60 }),
    recibo('marta', 80, 'sus-bono', { estado: 'DEVUELTO', importeDevuelto: 80, reembolsoStripeId: 're_1' }),
    recibo('lucia', 40, 'sus-suelta'),
  ];
  const m = mapaEuroPorPlaza(sesiones, reservas, recibos, T, AHORA, tipoDePlanDe);
  assert.equal(m.celdas[0].repartido, 40);
  assert.equal(m.cuadre.cobrado, 40);
});

test('la clase suelta cobrada en el mostrador (rec-suelta-) se reparte, aunque no lleve suscripción', () => {
  const { sesiones, reservas } = ejemploDelExplicador();
  const m = mapaEuroPorPlaza(sesiones, reservas, [recibo('ana', 12, null, { id: 'rec-suelta-res-1' })], T, AHORA, tipoDePlanDe);
  assert.equal(m.cuadre.repartido, 12);
  assert.equal(m.cuadre.otros, 0);
});

test('una clase semanal de las 18:00 sigue en la misma casilla al cambiar la hora (16:00Z en octubre, 17:00Z en noviembre)', () => {
  const tramoOt = { desde: '2026-10-01', hasta: '2026-12-31' };
  const sesiones = ['2026-10-13T16:00:00.000Z', '2026-10-20T16:00:00.000Z', '2026-10-27T17:00:00.000Z', '2026-11-03T17:00:00.000Z'].map((iso, i) => sesion(`s${i}`, iso));
  const m = mapaEuroPorPlaza(sesiones, [], [], tramoOt, new Date('2027-01-05T10:00:00Z'), tipoDePlanDe);
  assert.equal(m.celdas.length, 1);
  assert.deepEqual([m.celdas[0].dow, m.celdas[0].inicio, m.celdas[0].nClases], [2, '18:00', 4]);
});

test('propiedad: con cobros y reservas al azar, el cuadre cierra siempre con el titular', () => {
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2 ** 31; return semilla / 2 ** 31; };
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const prefijos = ['rec-', 'rec-pos-', 'rec-cita-', 'rec-suelta-', 'rec-penaliz-', 'rec-web-mat-'];
  const motivos = ['sus-cuota', 'sus-bono', 'sus-suelta', null] as const;
  for (let caso = 0; caso < 200; caso++) {
    const sesiones = Array.from({ length: 10 }, (_, i) => sesion(`s${i}`, i % 2 ? martes18(i) : jueves10(i), Math.floor(azar() * 8)));
    const reservas = sesiones.flatMap(s => ids.filter(() => azar() < 0.5).map(x => reserva(s.id, azar() < 0.15 ? null : x, azar() < 0.1 ? 'CANCELADA' : 'ASISTIDA')));
    const recibos = Array.from({ length: 8 }, () => {
      const socio = azar() < 0.1 ? null : ids[Math.floor(azar() * ids.length)];
      const importe = Math.round(azar() * 20000) / 100;
      return recibo(socio, importe, motivos[Math.floor(azar() * motivos.length)], {
        id: `${prefijos[Math.floor(azar() * prefijos.length)]}${caso}-${Math.floor(azar() * 1e6)}`,
        importeDevuelto: azar() < 0.2 ? Math.round(azar() * importe * 100) / 100 : 0,
        estado: azar() < 0.1 ? 'DEVUELTO' : 'COBRADO',
      });
    });
    const m = mapaEuroPorPlaza(sesiones, reservas, recibos, T, AHORA, tipoDePlanDe);
    const titular = dineroDelTramo(recibos, T, { periodo: 'TRIMESTRE', tipoDePlanDe }).neto;
    const c = m.cuadre;
    const suma = c.caja + c.sesionesPrivadas + c.otros + c.sinClienta + c.deNoVinieron + c.repartido;
    assert.ok(Math.abs(suma - titular) < 0.01, `caso ${caso}: ${suma} ≠ ${titular}`);
    assert.ok(m.celdas.every(x => x.plazas >= x.ocupadas), `caso ${caso}: plazas libres negativas`);
  }
});

test('si no se sabe el plan de NINGÚN cobro con suscripción, faltan los planes (no un mapa a 0 €)', () => {
  const recibos = [recibo('ana', 60, 'sus-cuota'), recibo('ana', 20, null, { id: 'rec-pos-1' })];
  assert.equal(faltanLosPlanes(recibos, () => undefined), true);
  assert.equal(faltanLosPlanes(recibos, tipoDePlanDe), false);
  assert.equal(faltanLosPlanes([recibo('ana', 20, null)], () => undefined), false, 'sin cobros con plan no hay nada que echar en falta');
});

test('los periodos pasados de los avisos: mes y trimestre, también en enero y en abril', () => {
  assert.equal(finDelMesPasado('2026-10-13'), '2026-09-30');
  assert.equal(finDelMesPasado('2027-01-05'), '2026-12-31');
  assert.equal(finDelMesPasado('2028-03-01'), '2028-02-29');
  assert.equal(finDelTrimestrePasado('2026-10-13'), '2026-09-30');
  assert.equal(finDelTrimestrePasado('2027-01-05'), '2026-12-31');
  assert.equal(finDelTrimestrePasado('2026-04-01'), '2026-03-31');
  assert.equal(finDelTrimestrePasado('2026-06-30'), '2026-03-31');
});

test('la franja es la hora de Madrid: un martes a las 00:30 cae el martes a las 00:30, también en la semana del cambio de hora', () => {
  // 27-oct-2026 es martes, ya en horario de invierno (UTC+1): 00:30 de Madrid = 23:30Z del lunes.
  const tramoOct = { desde: '2026-10-01', hasta: '2026-10-31' };
  const s = sesion('n', '2026-10-26T23:30:00.000Z');
  const m = mapaEuroPorPlaza([s], [], [], tramoOct, new Date('2026-11-02T10:00:00Z'), tipoDePlanDe);
  assert.deepEqual([m.celdas[0].dow, m.celdas[0].inicio], [2, '00:30']);
  // Y uno de verano: 00:30 del martes 7-jul = 22:30Z del lunes.
  const v = mapaEuroPorPlaza([sesion('v', '2026-07-06T22:30:00.000Z')], [], [], T, AHORA, tipoDePlanDe);
  assert.deepEqual([v.celdas[0].dow, v.celdas[0].inicio], [2, '00:30']);
});

test('las filas son las horas de inicio de verdad (18:00 y 18:30 no se juntan), y las celdas van de lunes a domingo', () => {
  const sesiones = [
    sesion('a', jueves10(0)), sesion('b', martes18(0)), sesion('c', '2026-07-12T07:00:00.000Z'), // domingo 9:00
    sesion('d', new Date(Date.UTC(2026, 6, 7, 16, 30)).toISOString()), // martes 18:30
  ];
  const m = mapaEuroPorPlaza(sesiones, [], [], T, AHORA, tipoDePlanDe);
  assert.deepEqual(m.horas, ['09:00', '10:00', '18:00', '18:30']);
  assert.deepEqual(m.celdas.map(c => `${c.dow} ${c.inicio}`), ['2 18:00', '2 18:30', '4 10:00', '0 09:00']);
});

test('el color es relativo al estudio: terciles con 3 o más celdas; con menos, sin color', () => {
  assert.deepEqual(cortesDeColor([1, 2]), []);
  const cortes = cortesDeColor([9, 1, 8, 2, 7, 3, 6, 4, 5]);
  assert.deepEqual(cortes, [3, 6]);
  assert.equal(nivelDeColor(1, cortes), 0);
  assert.equal(nivelDeColor(5, cortes), 1);
  assert.equal(nivelDeColor(9, cortes), 2);
  assert.equal(nivelDeColor(null, cortes), null);
  assert.equal(nivelDeColor(5, []), null);
});

test('periodo cerrado: solo si terminó antes de hoy', () => {
  assert.equal(periodoCerrado(T, '2026-10-13'), true);
  assert.equal(periodoCerrado({ desde: '2026-10-01', hasta: '2026-10-13' }, '2026-10-13'), false);
});

test('guardia: Informes no carga el mapa ni su cálculo de entrada (apagado = ni un byte más del bloque)', async () => {
  const { readFileSync } = await import('node:fs');
  const pagina = readFileSync(new URL('../../app/(dashboard)/informes/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(pagina, /^import[^;]*from ['"][^'"]*(bloque-euro-plaza|euro-por-plaza)['"]/m, 'importado a pelo: va con dynamic()');
  assert.match(pagina, /dynamic\(\s*\(\) => import\('@\/components\/informes\/bloque-euro-plaza'\)/);
});
