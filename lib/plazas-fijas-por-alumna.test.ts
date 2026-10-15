import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesFijasPorAlumna, estadoDeClaseFija, filtrarClasesFijas } from './plazas-fijas-por-alumna.ts';
import type { PlanTarifa, PlazaFija, Sesion, Suscripcion } from './types.ts';

// Jueves 15-oct-2026, 10:00 en Madrid (CEST, UTC+2).
const AHORA = Date.parse('2026-10-15T08:00:00Z');
const HOY = '2026-10-15';

const plaza = (o: Partial<PlazaFija> & Pick<PlazaFija, 'id' | 'socioId'>): PlazaFija => ({
  studioId: 'e1', diaSemana: 1, horaInicio: '09:30:00', salaId: 'sala-1', tipoClaseId: 'tc-ref', spotId: null,
  vigenciaDesde: '2026-09-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-09-01T00:00:00Z', ...o,
});
// El lunes 19 a las 09:30 de Madrid y el miércoles 21 a las 18:00.
const ses = (id: string, inicio: string): Sesion => ({
  id, studioId: 'e1', tipoClaseId: 'tc-ref', salaId: 'sala-1', instructorId: 'ins-1', inicio,
  fin: new Date(Date.parse(inicio) + 50 * 60_000).toISOString(), aforoMaximo: 6, cancelada: false,
  notas: null, precioPuntual: null, serieId: 'serie-1',
});
const SESIONES = [ses('s-lun', '2026-10-19T07:30:00.000Z'), ses('s-mie', '2026-10-21T16:00:00.000Z')];
const CUOTA = { id: 'mensual', studioId: 'e1', nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validezDias: null, limiteSemanal: null, activo: true } as PlanTarifa;
const sus = (socioId: string): Suscripcion => ({
  id: `sus-${socioId}`, studioId: 'e1', socioId, planId: 'mensual', estado: 'ACTIVA', fechaInicio: '2026-09-01',
  fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null,
}) as Suscripcion;
const NOMBRES: Record<string, string> = { carmen: 'Carmen Ruiz', ana: 'Ana Pérez', lucia: 'Lucía Gómez' };
const entrada = (plazasFijas: PlazaFija[], suscripciones: Suscripcion[]) => ({
  plazasFijas, sesiones: SESIONES, suscripciones, planes: [CUOTA], nombreDe: (id: string) => NOMBRES[id] ?? id, ahoraMs: AHORA,
});

test('una alumna por fila, por nombre, con sus clases fijas por día (lunes primero) y sin las de baja', () => {
  const r = clasesFijasPorAlumna(entrada([
    plaza({ id: 'p1', socioId: 'carmen', diaSemana: 3, horaInicio: '18:00:00' }),
    plaza({ id: 'p2', socioId: 'carmen', diaSemana: 1 }),
    plaza({ id: 'p3', socioId: 'ana' }),
    plaza({ id: 'p4', socioId: 'lucia', estado: 'BAJA' }),
  ], [sus('carmen'), sus('ana')]));
  assert.deepEqual(r.map(a => a.nombre), ['Ana Pérez', 'Carmen Ruiz']);
  assert.deepEqual(r[1].filas.map(f => f.plaza.id), ['p2', 'p1']);
  assert.equal(r[1].avisos, 0);
});

test('los avisos son los mismos que en la ficha: sin cuota, sin clase en su horario y vuelta por decidir', () => {
  const [ana] = clasesFijasPorAlumna(entrada([plaza({ id: 'p', socioId: 'ana' })], []));
  assert.equal(ana.filas[0].sinCuota, true, 'sin cuota mensual que cubra la clase');
  const [carmen] = clasesFijasPorAlumna(entrada([plaza({ id: 'p', socioId: 'carmen', diaSemana: 5 })], [sus('carmen')]));
  assert.equal(carmen.filas[0].sinClase, true, 'los viernes a esa hora no hay clase');
  assert.equal(carmen.avisos, 1);
  // Una pausada no se cobra ni se reserva: no se avisa de que le falta cuota.
  const [lucia] = clasesFijasPorAlumna(entrada([plaza({ id: 'p', socioId: 'lucia', estado: 'PAUSADA' })], []));
  assert.equal(lucia.filas[0].sinCuota, false);
});

test('el estado de cada clase fija hoy', () => {
  assert.equal(estadoDeClaseFija(plaza({ id: 'a', socioId: 'x' }), HOY), 'activa');
  assert.equal(estadoDeClaseFija(plaza({ id: 'a', socioId: 'x', estado: 'PAUSADA' }), HOY), 'en_pausa');
  assert.equal(estadoDeClaseFija(plaza({ id: 'a', socioId: 'x', pausaDesde: '2026-10-10', pausaHasta: '2026-10-20' }), HOY), 'en_pausa');
  assert.equal(estadoDeClaseFija(plaza({ id: 'a', socioId: 'x', pausaDesde: '2026-11-01', pausaHasta: '2026-11-10' }), HOY), 'pausa_programada');
  assert.equal(
    estadoDeClaseFija(plaza({ id: 'a', socioId: 'x', estado: 'PAUSADA', pausaLiberaSitio: true, pausaDesde: '2026-09-01', pausaHasta: '2026-10-01' }), HOY),
    'vuelta_por_decidir',
  );
});

test('filtros: por nombre sin acentos, por estado y por día; quien se queda sin clases no sale', () => {
  const todas = clasesFijasPorAlumna(entrada([
    plaza({ id: 'p1', socioId: 'carmen' }),
    plaza({ id: 'p2', socioId: 'lucia', diaSemana: 3, horaInicio: '18:00:00', estado: 'PAUSADA' }),
    plaza({ id: 'p3', socioId: 'ana', diaSemana: 5 }),
  ], [sus('carmen'), sus('lucia'), sus('ana')]));
  assert.deepEqual(filtrarClasesFijas(todas, { texto: 'lucia', estado: 'todas', dia: null }).map(a => a.socioId), ['lucia']);
  assert.deepEqual(filtrarClasesFijas(todas, { texto: '', estado: 'en_pausa', dia: null }).map(a => a.socioId), ['lucia']);
  assert.deepEqual(filtrarClasesFijas(todas, { texto: '', estado: 'activas', dia: null }).map(a => a.socioId), ['ana', 'carmen']);
  assert.deepEqual(filtrarClasesFijas(todas, { texto: '', estado: 'con_aviso', dia: null }).map(a => a.socioId), ['ana'], 'el viernes no hay clase');
  assert.deepEqual(filtrarClasesFijas(todas, { texto: '', estado: 'todas', dia: 1 }).map(a => a.socioId), ['carmen']);
  assert.deepEqual(filtrarClasesFijas(todas, { texto: 'nadie', estado: 'todas', dia: null }), []);
});
