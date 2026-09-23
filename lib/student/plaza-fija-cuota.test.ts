import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plazaFijaEnClase, proximasDeUnaPlaza, tieneCuotaQueCubre, type CuotaMin, type PlanCuotaMin } from './plaza-fija.ts';
import { cuotaParaPlazaFija } from '../plazas-fijas-reglas.ts';
import { TEXTOS_PLAZA_FIJA, losDias } from './plaza-fija-textos.ts';
import type { PlanTarifa, Suscripcion } from '../types.ts';

// La app de la alumna decide si enseñar «Pedir plaza fija» con su propia copia de
// la regla del servidor (`cuotaParaPlazaFija`): este módulo no importa nada. Si
// las dos se separan, a una alumna con bono le saldría un botón que el servidor
// rechaza (o, peor, dejaría de salirle a quien sí puede). Por eso se comparan
// aquí, caso a caso, en vez de fiarse de que alguien las mantenga a la vez.

const HOY = '2026-09-17';
const SOCIO = 'socio-1';

const plan = (id: string, tipo: string, tiposClaseIds?: string[]) => ({ id, tipo, tiposClaseIds }) as PlanCuotaMin & Partial<PlanTarifa>;
const suscripcion = (planId: string, over: Partial<CuotaMin> = {}): CuotaMin => ({ planId, estado: 'ACTIVA', fechaFin: null, ...over });

function delServidor(subs: CuotaMin[], planes: PlanCuotaMin[], tipoClaseId: string | null): boolean {
  const s = subs.map((x, i) => ({ id: `s-${i}`, socioId: SOCIO, ...x }) as unknown as Suscripcion);
  return cuotaParaPlazaFija(SOCIO, s, planes as unknown as PlanTarifa[], HOY, tipoClaseId) !== null;
}

const CASOS: { nombre: string; subs: CuotaMin[]; planes: PlanCuotaMin[]; tipo: string | null }[] = [
  { nombre: 'una cuota mensual activa', subs: [suscripcion('m')], planes: [plan('m', 'MENSUAL')], tipo: 'tc-r' },
  { nombre: 'un bono, aunque esté activo', subs: [suscripcion('b')], planes: [plan('b', 'BONO')], tipo: 'tc-r' },
  { nombre: 'un plan de clase suelta', subs: [suscripcion('p')], planes: [plan('p', 'PUNTUAL')], tipo: 'tc-r' },
  { nombre: 'sin ninguna suscripción', subs: [], planes: [plan('m', 'MENSUAL')], tipo: 'tc-r' },
  { nombre: 'una cuota cancelada', subs: [suscripcion('m', { estado: 'CANCELADA' })], planes: [plan('m', 'MENSUAL')], tipo: 'tc-r' },
  { nombre: 'una cuota que caducó ayer', subs: [suscripcion('m', { fechaFin: '2026-09-16' })], planes: [plan('m', 'MENSUAL')], tipo: 'tc-r' },
  { nombre: 'una cuota que caduca hoy (vale hasta el final del día)', subs: [suscripcion('m', { fechaFin: HOY })], planes: [plan('m', 'MENSUAL')], tipo: 'tc-r' },
  { nombre: 'una cuota acotada a otro tipo de clase', subs: [suscripcion('m')], planes: [plan('m', 'MENSUAL', ['tc-mat'])], tipo: 'tc-r' },
  { nombre: 'una cuota acotada a este tipo de clase', subs: [suscripcion('m')], planes: [plan('m', 'MENSUAL', ['tc-r'])], tipo: 'tc-r' },
  { nombre: 'una cuota que apunta a un plan que ya no está', subs: [suscripcion('borrado')], planes: [plan('m', 'MENSUAL')], tipo: 'tc-r' },
  { nombre: 'un bono y, además, una cuota', subs: [suscripcion('b'), suscripcion('m')], planes: [plan('b', 'BONO'), plan('m', 'MENSUAL')], tipo: 'tc-r' },
  { nombre: 'una clase sin tipo', subs: [suscripcion('m')], planes: [plan('m', 'MENSUAL', ['tc-mat'])], tipo: null },
];

for (const c of CASOS) {
  test(`cuota para plaza fija: ${c.nombre} — la app y el servidor dicen lo mismo`, () => {
    const enLaApp = tieneCuotaQueCubre(c.subs, c.planes, HOY, c.tipo);
    assert.equal(enLaApp, delServidor(c.subs, c.planes, c.tipo));
  });
}

const CLASE = { id: 'ses-1', fecha: '2026-09-17', hora: '18:00', salaId: 'sala-1' };
const OTRA_SEMANA = { id: 'ses-2', fecha: '2026-09-24', hora: '18:00', salaId: 'sala-1', cancelada: false };

test('una clase que se repite, sin cuota que la cubra: no se ofrece el botón, se explica por qué', () => {
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [], [], false), { estado: 'SOLO_CON_CUOTA' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [], [], true), { estado: 'PUEDE_PEDIR' });
});

test('sin cuota, lo demás manda igual: si no se repite o ya la tiene, no se le dice nada de cuotas', () => {
  assert.deepEqual(plazaFijaEnClase(CLASE, [], [], [], false), { estado: 'NO_SE_REPITE' });
  const plaza = { id: 'pf-1', diaSemana: 4, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA' as const };
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [plaza], [], false), { estado: 'TIENE_PLAZA' });
});

test('los textos llevan su día y su hora, en plural, y hablan de «clase fija»', () => {
  assert.equal(losDias(2), 'los martes');
  assert.equal(losDias(6), 'los sábados');
  assert.equal(losDias(0), 'los domingos');
  assert.match(TEXTOS_PLAZA_FIJA.ofrecer(2, '10:00'), /¿Vienes los martes a las 10:00\?/);
  assert.match(TEXTOS_PLAZA_FIJA.ofrecer(2, '10:00'), /Con una clase fija tu plaza queda reservada cada semana/);
  assert.equal(TEXTOS_PLAZA_FIJA.botonPedir, 'Pedir clase fija');
  assert.match(TEXTOS_PLAZA_FIJA.noPuedoSolo(2), /Tu clase fija de los martes sigue activa/);
  assert.match(TEXTOS_PLAZA_FIJA.noPuedoTarde(12), /Quedan menos de 12 h/);
});

// «Próximas clases» de su clase fija: solo lo que el motor le tiene ya reservado.
const PLAZA = { diaSemana: 2, hora: '18:00', salaId: 'sala-1' };
// 2026-09-22 es martes.
const ses = (id: string, fecha: string, over: Record<string, unknown> = {}) => ({ id, fecha, hora: '18:00', salaId: 'sala-1', cancelada: false, ...over });
const res = (id: string, sesionId: string, estado = 'CONFIRMADA') => ({ id, sesionId, estado });

test('próximas de su clase fija: solo las del motor, confirmadas, futuras y en su hueco, por orden', () => {
  const sesiones = [ses('s-1', '2026-09-29'), ses('s-2', '2026-09-22'), ses('s-3', '2026-10-06'), ses('s-4', '2026-10-13')];
  const reservas = [res('res-pf-a', 's-1'), res('res-pf-b', 's-2'), res('res-pf-c', 's-3'), res('res-pf-d', 's-4')];
  const r = proximasDeUnaPlaza(PLAZA, reservas, sesiones, '2026-09-21', '10:00', 3);
  assert.deepEqual(r.map((x) => x.fecha), ['2026-09-22', '2026-09-29', '2026-10-06'], 'las tres primeras, en orden, sin la cuarta');
  assert.deepEqual(r[0], { reservaId: 'res-pf-b', sesionId: 's-2', fecha: '2026-09-22', hora: '18:00' });
});

test('próximas de su clase fija: no cuentan la reservada a mano, la cancelada, la pasada ni la de otro hueco', () => {
  const sesiones = [
    ses('s-mano', '2026-09-22'), ses('s-canc', '2026-09-29'), ses('s-pasada', '2026-09-15'),
    ses('s-otra-sala', '2026-10-06', { salaId: 'sala-2' }), ses('s-otra-hora', '2026-10-13', { hora: '19:00' }),
    ses('s-otro-dia', '2026-09-23'), ses('s-clase-cancelada', '2026-10-20', { cancelada: true }), ses('s-ok', '2026-10-27'),
  ];
  const reservas = [
    res('res-1234', 's-mano'), // reservada a mano en su hueco: NO es de su clase fija
    res('res-pf-canc', 's-canc', 'CANCELADA'), res('res-pf-pasada', 's-pasada'),
    res('res-pf-sala', 's-otra-sala'), res('res-pf-hora', 's-otra-hora'), res('res-pf-dia', 's-otro-dia'),
    res('res-pf-clase-cancelada', 's-clase-cancelada'), res('res-pf-ok', 's-ok'),
  ];
  assert.deepEqual(proximasDeUnaPlaza(PLAZA, reservas, sesiones, '2026-09-21').map((x) => x.reservaId), ['res-pf-ok']);
});

test('próximas de su clase fija: la de hoy cuenta mientras no haya empezado', () => {
  const sesiones = [ses('s-hoy', '2026-09-22')];
  const reservas = [res('res-pf-hoy', 's-hoy')];
  assert.equal(proximasDeUnaPlaza(PLAZA, reservas, sesiones, '2026-09-22', '17:00').length, 1);
  assert.equal(proximasDeUnaPlaza(PLAZA, reservas, sesiones, '2026-09-22', '18:30').length, 0);
});
