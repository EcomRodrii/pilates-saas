import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Reserva, Sesion, Suscripcion } from '../types.ts';
import { analizarCapacidad, CONFIG_OPENING_DEFECTO, demandaDeSuscripcion, nivelDeRiesgo, type EntradaCapacidad } from './capacidad.ts';

const NOW = new Date('2026-10-01T08:00:00Z');
const DIA = 86_400_000;
const cfg = CONFIG_OPENING_DEFECTO; // ventana 42 días = 6 semanas

const plan = (p: Partial<PlanTarifa>): PlanTarifa =>
  ({ id: 'p', studioId: 's', nombre: 'p', descripcion: null, precio: 50, tipo: 'MENSUAL', sesiones: null, ...p }) as PlanTarifa;
const sus = (p: Partial<Suscripcion>): Suscripcion =>
  ({ id: 'x', studioId: 's', socioId: 'a', planId: 'p', estado: 'ACTIVA', fechaInicio: '2026-09-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p }) as Suscripcion;
const sesion = (diasDesdeNow: number, p: Partial<Sesion> = {}): Sesion =>
  ({ id: `se${diasDesdeNow}`, studioId: 's', tipoClaseId: 't', salaId: 'r', instructorId: 'i',
     inicio: new Date(NOW.getTime() + diasDesdeNow * DIA).toISOString(), fin: '', aforoMaximo: 10,
     cancelada: false, notas: null, precioPuntual: null, ...p }) as Sesion;
const asistidas = (n: number, cadaDias: number): Reserva[] =>
  Array.from({ length: n }, (_, i) => ({ creadoEn: new Date(NOW.getTime() - i * cadaDias * DIA).toISOString() }) as Reserva);
const enDias = (d: number) => new Date(NOW.getTime() + d * DIA).toISOString().slice(0, 10);
const demanda = (s: Suscripcion, p: PlanTarifa | undefined, a: Reserva[] = [], c = cfg) => demandaDeSuscripcion(s, p, a, c, NOW);

const entrada = (e: Partial<EntradaCapacidad>): EntradaCapacidad =>
  ({ sesiones: [], suscripciones: [], planes: [], leads: 0, asistidasPorSocio: new Map(), config: cfg, now: NOW, ...e });

test('estudio sin abrir: sin asistencias, la demanda sale del plan y no de cero', () => {
  assert.deepEqual(demanda(sus({}), plan({ limiteSemanal: 2 })), { plazas: 12, origen: 'ESTIMADA_POR_PLAN', motivo: 'TOPE_PLAN' });
});

test('mensual sin tope y sin historial usa el supuesto configurable', () => {
  const r = demanda(sus({}), plan({ limiteSemanal: null }), [], { ...cfg, sesionesSemanaSinTope: 3 });
  assert.deepEqual(r, { plazas: 18, origen: 'ESTIMADA_POR_PLAN', motivo: 'SIN_TOPE' });
});

test('bono: lo que le queda repartido hasta su caducidad real (fechaFin), no en toda su validez', () => {
  // 6 sesiones, caduca en 12 semanas → 0,5/semana → 3 en la ventana.
  const r = demanda(sus({ sesionesRestantes: 6, fechaFin: enDias(84) }), plan({ tipo: 'BONO', sesiones: 10, validezDias: 90 }));
  assert.ok(Math.abs(r.plazas - 3) < 0.05, `plazas=${r.plazas}`);
  assert.equal(r.motivo, 'BONO');
});

test('bono que caduca dentro de la ventana: aporta lo que le queda y ni una más', () => {
  // 2 sesiones y 1 semana: antes contaba 2/semana × 6 semanas = 12.
  const r = demanda(sus({ sesionesRestantes: 2, fechaFin: enDias(7) }), plan({ tipo: 'BONO', sesiones: 10, validezDias: 90 }));
  assert.equal(r.plazas, 2);
});

test('bono con historial: la frecuencia observada tampoco pasa de lo que le queda', () => {
  const r = demanda(sus({ sesionesRestantes: 3, fechaFin: enDias(84) }), plan({ tipo: 'BONO', sesiones: 10 }), asistidas(24, 2));
  assert.equal(r.origen, 'OBSERVADA');
  assert.equal(r.plazas, 3);
});

test('bono sin caducidad usa el supuesto de semanas', () => {
  const r = demanda(sus({ sesionesRestantes: 8 }), plan({ tipo: 'BONO', sesiones: 8, validezDias: null }));
  assert.equal(r.plazas, 6); // 8 / 8 semanas × 6 semanas
});

test('puntual no genera demanda recurrente, aunque la socia tenga historial', () => {
  assert.deepEqual(demanda(sus({}), plan({ tipo: 'PUNTUAL', sesiones: 1 }), asistidas(24, 2)), { plazas: 0, origen: 'ESTIMADA_POR_PLAN', motivo: 'PUNTUAL' });
});

test('con historial manda la frecuencia observada, sin pasar del tope del plan', () => {
  const r = demanda(sus({}), plan({ limiteSemanal: 2 }), asistidas(24, 2));
  assert.equal(r.origen, 'OBSERVADA');
  assert.equal(r.plazas, 12);
});

test('capacidad: solo sesiones no canceladas dentro de la ventana', () => {
  const r = analizarCapacidad(entrada({
    sesiones: [sesion(1), sesion(2, { cancelada: true }), sesion(-1), sesion(cfg.ventanaAnalisisDias + 1)],
  }));
  assert.equal(r.capacidadPublicada, 10);
  assert.equal(r.sesionesEnVentana, 1);
});

test('demanda y capacidad en la misma ventana; suscripciones no activas no cuentan', () => {
  const r = analizarCapacidad(entrada({
    sesiones: Array.from({ length: 12 }, (_, i) => sesion(i * 3 + 1)),
    planes: [plan({ limiteSemanal: 2 })],
    suscripciones: [sus({ id: '1' }), sus({ id: '2', estado: 'CANCELADA' })],
  }));
  assert.equal(r.capacidadPublicada, 120);
  assert.equal(r.demandaComprometida, 12);
  assert.deepEqual(r.desglose.ESTIMADA_POR_PLAN, { suscripciones: 1, plazas: 12 });
  assert.equal(r.ocupacionPrevista, 0.1);
  assert.equal(r.riesgo, 'VERDE');
});

test('una socia con dos cuotas y historial cuenta una vez, no dos', () => {
  const r = analizarCapacidad(entrada({
    sesiones: [sesion(1)],
    planes: [plan({ id: 'm', limiteSemanal: null }), plan({ id: 'b', tipo: 'BONO', sesiones: 10 })],
    suscripciones: [sus({ id: '1', planId: 'm' }), sus({ id: '2', planId: 'b', sesionesRestantes: 10, fechaFin: enDias(84) })],
    asistidasPorSocio: new Map([['a', asistidas(24, 2)]]),
  }));
  assert.equal(r.desglose.OBSERVADA.suscripciones, 1);
  assert.equal(r.demandaComprometida, 18); // 3/semana × 6, una sola vez
});

test('cuenta cómo se estimó cada cuota sin historial; las puntuales no son cuotas', () => {
  const r = analizarCapacidad(entrada({
    sesiones: [sesion(1)],
    planes: [plan({ id: 'b', tipo: 'BONO', sesiones: 10 }), plan({ id: 'u', tipo: 'PUNTUAL', sesiones: 1 })],
    suscripciones: [
      sus({ id: '1', socioId: 'x', planId: 'b', sesionesRestantes: 5, fechaFin: enDias(84) }),
      sus({ id: '2', socioId: 'y', planId: 'u' }),
    ],
  }));
  assert.deepEqual(r.estimadasPorMotivo, { TOPE_PLAN: 0, SIN_TOPE: 0, BONO: 1, PUNTUAL: 1 });
  assert.equal(r.desglose.ESTIMADA_POR_PLAN.suscripciones, 1);
});

test('los leads se muestran aparte y no inflan el riesgo', () => {
  const r = analizarCapacidad(entrada({ sesiones: [sesion(1)], leads: 2 }));
  assert.equal(r.leads, 2);
  assert.ok(r.demandaPotencial > 0);
  assert.equal(r.demandaComprometida, 0);
  assert.equal(r.riesgo, 'VERDE');
});

test('sin clases publicadas no hay porcentaje que enseñar', () => {
  const r = analizarCapacidad(entrada({ planes: [plan({})], suscripciones: [sus({})] }));
  assert.equal(r.ocupacionPrevista, null);
  assert.equal(r.riesgo, 'SIN_OFERTA');
});

test('umbrales: el límite de cada tramo pertenece al tramo superior', () => {
  assert.equal(nivelDeRiesgo(0.69, cfg), 'VERDE');
  assert.equal(nivelDeRiesgo(0.7, cfg), 'AMARILLO');
  assert.equal(nivelDeRiesgo(0.85, cfg), 'ROJO');
});
