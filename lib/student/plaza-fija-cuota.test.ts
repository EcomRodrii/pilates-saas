import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plazaFijaEnClase, tieneCuotaQueCubre, type CuotaMin, type PlanCuotaMin } from './plaza-fija.ts';
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

test('los textos llevan su día y su hora, en plural', () => {
  assert.equal(losDias(2), 'los martes');
  assert.equal(losDias(6), 'los sábados');
  assert.equal(losDias(0), 'los domingos');
  assert.match(TEXTOS_PLAZA_FIJA.ofrecer(2, '10:00'), /¿Vienes los martes a las 10:00\?/);
  assert.match(TEXTOS_PLAZA_FIJA.trasReservar(4, '18:00'), /los jueves a las 18:00/);
});
