import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion, Recibo } from '@/lib/types';
import { resolverDestinatariasCampana } from './segmentos.ts';

const NOW = new Date('2026-08-13T12:00:00.000Z');
const enDias = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'A', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2026-01-01', activo: true, ...p };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId'>): Suscripcion {
  return { id: `sus-${p.socioId}`, studioId: 'e1', planId: 'plan1', estado: 'ACTIVA', fechaInicio: '2026-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}
function recibo(p: Partial<Recibo> & Pick<Recibo, 'socioId' | 'estado'>): Recibo {
  return { id: `rec-${p.socioId}`, studioId: 'e1', suscripcionId: null, concepto: 'Mensualidad', importe: 50, fechaVencimiento: '2026-08-01', fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p };
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

// ── Paso 6: señales ya existentes (docs/marketing-integrations-arquitectura.md §4/§6) ──

test('BONO_CADUCA_PRONTO: bono con sesiones y caduca en 10 días → sí; en 30 días → no', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2' }), socio({ id: '3' })];
  const suscripciones = [
    suscripcion({ socioId: '1', sesionesRestantes: 4, fechaFin: enDias(10) }),
    suscripcion({ socioId: '2', sesionesRestantes: 4, fechaFin: enDias(30) }),
    // plan mensual (sesionesRestantes null) no cuenta como "bono", aunque caduque pronto
    suscripcion({ socioId: '3', sesionesRestantes: null, fechaFin: enDias(5) }),
  ];
  const r = resolverDestinatariasCampana('BONO_CADUCA_PRONTO', { socios, suscripciones }, NOW);
  assert.deepEqual(r.map(s => s.id), ['1']);
});

test('BONO_CADUCA_PRONTO: sin sesiones restantes (agotado) no cuenta — eso ya lo cubre BONO_AGOTADO', () => {
  const socios = [socio({ id: '1' })];
  const suscripciones = [suscripcion({ socioId: '1', sesionesRestantes: 0, fechaFin: enDias(5) })];
  const r = resolverDestinatariasCampana('BONO_CADUCA_PRONTO', { socios, suscripciones }, NOW);
  assert.equal(r.length, 0);
});

test('BONO_CADUCA_PRONTO: ya caducado no cuenta — no hay nada que salvar', () => {
  const socios = [socio({ id: '1' })];
  const suscripciones = [suscripcion({ socioId: '1', sesionesRestantes: 4, fechaFin: enDias(-2) })];
  const r = resolverDestinatariasCampana('BONO_CADUCA_PRONTO', { socios, suscripciones }, NOW);
  assert.equal(r.length, 0);
});

test('PAGO_FALLIDO: solo socias con algún recibo en estado FALLIDO', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2' })];
  const recibos = [recibo({ socioId: '1', estado: 'FALLIDO' }), recibo({ socioId: '2', estado: 'COBRADO' })];
  const r = resolverDestinatariasCampana('PAGO_FALLIDO', { socios, suscripciones: [], recibos }, NOW);
  assert.deepEqual(r.map(s => s.id), ['1']);
});

test('CUMPLE_ESTE_MES: mismo mes de nacimiento que el mes actual (agosto)', () => {
  const socios = [
    socio({ id: '1', fechaNacimiento: '1990-08-20' }),
    socio({ id: '2', fechaNacimiento: '1990-03-05' }),
    socio({ id: '3' }), // sin fecha de nacimiento
  ];
  const r = resolverDestinatariasCampana('CUMPLE_ESTE_MES', { socios, suscripciones: [] }, NOW);
  assert.deepEqual(r.map(s => s.id), ['1']);
});
