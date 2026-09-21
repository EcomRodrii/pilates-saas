import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Reserva, Sesion, Suscripcion } from '../types.ts';
import { analizarCapacidad, CONFIG_OPENING_DEFECTO, demandaSemanalDeSuscripcion, nivelDeRiesgo, type EntradaCapacidad } from './capacidad.ts';

const NOW = new Date('2026-10-01T08:00:00Z');
const cfg = CONFIG_OPENING_DEFECTO;

const plan = (p: Partial<PlanTarifa>): PlanTarifa =>
  ({ id: 'p', studioId: 's', nombre: 'p', descripcion: null, precio: 50, tipo: 'MENSUAL', sesiones: null, ...p }) as PlanTarifa;
const sus = (p: Partial<Suscripcion>): Suscripcion =>
  ({ id: 'x', studioId: 's', socioId: 'a', planId: 'p', estado: 'ACTIVA', fechaInicio: '2026-09-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p }) as Suscripcion;
const sesion = (diasDesdeNow: number, p: Partial<Sesion> = {}): Sesion =>
  ({ id: `se${diasDesdeNow}${p.id ?? ''}`, studioId: 's', tipoClaseId: 't', salaId: 'r', instructorId: 'i',
     inicio: new Date(NOW.getTime() + diasDesdeNow * 86_400_000).toISOString(), fin: '', aforoMaximo: 10,
     cancelada: false, notas: null, precioPuntual: null, ...p }) as Sesion;
const asistidas = (n: number, cadaDias: number): Reserva[] =>
  Array.from({ length: n }, (_, i) => ({ creadoEn: new Date(NOW.getTime() - i * cadaDias * 86_400_000).toISOString() }) as Reserva);

const entrada = (e: Partial<EntradaCapacidad>): EntradaCapacidad =>
  ({ sesiones: [], suscripciones: [], planes: [], leads: 0, asistidasPorSocio: new Map(), config: cfg, now: NOW, ...e });

test('estudio sin abrir: sin asistencias, la demanda sale del plan y no de cero', () => {
  const r = demandaSemanalDeSuscripcion(sus({}), plan({ limiteSemanal: 2 }), [], cfg);
  assert.deepEqual(r, { porSemana: 2, origen: 'ESTIMADA_POR_PLAN' });
});

test('mensual sin tope y sin historial usa el supuesto configurable', () => {
  const r = demandaSemanalDeSuscripcion(sus({}), plan({ limiteSemanal: null }), [], { ...cfg, sesionesSemanaSinTope: 3 });
  assert.equal(r.porSemana, 3);
});

test('bono: sesiones repartidas en su validez, acotado por el tope semanal', () => {
  assert.equal(demandaSemanalDeSuscripcion(sus({}), plan({ tipo: 'BONO', sesiones: 10, validezDias: 70 }), [], cfg).porSemana, 1);
  assert.equal(demandaSemanalDeSuscripcion(sus({}), plan({ tipo: 'BONO', sesiones: 10, validezDias: 14, limiteSemanal: 2 }), [], cfg).porSemana, 2);
});

test('bono ya empezado cuenta lo que le queda, no el total', () => {
  const r = demandaSemanalDeSuscripcion(sus({ sesionesRestantes: 5 }), plan({ tipo: 'BONO', sesiones: 10, validezDias: 70 }), [], cfg);
  assert.equal(r.porSemana, 0.5);
});

test('puntual no genera demanda recurrente', () => {
  assert.equal(demandaSemanalDeSuscripcion(sus({}), plan({ tipo: 'PUNTUAL', sesiones: 1 }), [], cfg).porSemana, 0);
});

test('con historial manda la frecuencia observada, sin pasar del tope del plan', () => {
  const r = demandaSemanalDeSuscripcion(sus({}), plan({ limiteSemanal: 2 }), asistidas(24, 2), cfg);
  assert.equal(r.origen, 'OBSERVADA');
  assert.equal(r.porSemana, 2);
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

test('los leads se muestran aparte y no inflan el riesgo', () => {
  const r = analizarCapacidad(entrada({
    sesiones: [sesion(1)],
    leads: 2,
  }));
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
