import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion } from '@/lib/types';
import { resolverDestinatariasCampana } from './segmentos.ts';

function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'A', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2026-01-01', activo: true, ...p };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId'>): Suscripcion {
  return { id: `sus-${p.socioId}`, studioId: 'e1', planId: 'plan1', estado: 'ACTIVA', fechaInicio: '2026-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}

test('TODAS: devuelve todas las socias sin filtrar', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2', activo: false })];
  const r = resolverDestinatariasCampana('TODAS', { socios, suscripciones: [] });
  assert.equal(r.length, 2);
});

test('ACTIVAS / INACTIVAS: se reparten por socio.activo', () => {
  const socios = [socio({ id: '1', activo: true }), socio({ id: '2', activo: false })];
  assert.deepEqual(resolverDestinatariasCampana('ACTIVAS', { socios, suscripciones: [] }).map(s => s.id), ['1']);
  assert.deepEqual(resolverDestinatariasCampana('INACTIVAS', { socios, suscripciones: [] }).map(s => s.id), ['2']);
});

test('SIN_PLAN / BONO: se reparten por tener una suscripción ACTIVA', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2' })];
  const suscripciones = [suscripcion({ socioId: '1', estado: 'ACTIVA' }), suscripcion({ socioId: '2', estado: 'CANCELADA' })];
  assert.deepEqual(resolverDestinatariasCampana('BONO', { socios, suscripciones }).map(s => s.id), ['1']);
  assert.deepEqual(resolverDestinatariasCampana('SIN_PLAN', { socios, suscripciones }).map(s => s.id), ['2']);
});

test('VIP: solo socias con el tag VIP', () => {
  const socios = [socio({ id: '1', tags: ['VIP'] }), socio({ id: '2', tags: ['otro'] }), socio({ id: '3' })];
  assert.deepEqual(resolverDestinatariasCampana('VIP', { socios, suscripciones: [] }).map(s => s.id), ['1']);
});
