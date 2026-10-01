import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion, Recibo } from '@/lib/types';
import { resolverDestinatariasCampana, etiquetaSegmento } from './segmentos.ts';
import type { EstadoClienta, ResultadoEstado } from '../clientas/estado.ts';

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

// Estas cuatro audiencias cuentan con el ESTADO de cada clienta (el mismo que
// enseña Clientas, lib/clientas/estado.ts), no con `socio.activo` ni con «tiene
// una fila ACTIVA».
const estado = (e: EstadoClienta, derecho = false): ResultadoEstado => ({ estado: e, desde: null, nueva: false, derecho, primeraCompraReal: null });

test('ACTIVAS / INACTIVAS: por su estado — «activas» son las Activa, no «las que no están de baja»', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2', activo: false }), socio({ id: '3' }), socio({ id: '4' }), socio({ id: '5' })];
  const estados = new Map([
    ['1', estado('ACTIVA', true)], ['2', estado('DE_BAJA')], ['3', estado('SIN_RENOVAR')],
    ['4', estado('INTERESADA')], ['5', estado('INACTIVA')],
  ]);
  assert.deepEqual(resolverDestinatariasCampana('ACTIVAS', { socios, suscripciones: [], estados }).map(s => s.id), ['1']);
  assert.deepEqual(resolverDestinatariasCampana('INACTIVAS', { socios, suscripciones: [], estados }).map(s => s.id), ['2', '3', '5']);
});

test('SIN_PLAN / BONO: puede reservar ahora mismo con un plan o bono (no «tiene una fila ACTIVA»)', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2' })];
  const estados = new Map([['1', estado('ACTIVA', true)], ['2', estado('SIN_RENOVAR', false)]]);
  // Una suscripción ACTIVA sin sesiones ya no da derecho: no cuenta como «con bono».
  const suscripciones = [suscripcion({ socioId: '2', estado: 'ACTIVA', sesionesRestantes: 0 })];
  assert.deepEqual(resolverDestinatariasCampana('BONO', { socios, suscripciones, estados }).map(s => s.id), ['1']);
  assert.deepEqual(resolverDestinatariasCampana('SIN_PLAN', { socios, suscripciones, estados }).map(s => s.id), ['2']);
});

test('sin el estado de cada clienta, esas audiencias no resuelven a NADIE (nunca a quien no toca)', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2', activo: false })];
  for (const seg of ['ACTIVAS', 'INACTIVAS', 'BONO', 'SIN_PLAN', 'ETAPA:ACTIVA'] as const) {
    assert.deepEqual(resolverDestinatariasCampana(seg, { socios, suscripciones: [], estados: null }), [], seg);
  }
  // Las que no lo necesitan siguen funcionando sin él.
  assert.equal(resolverDestinatariasCampana('TODAS', { socios, suscripciones: [], estados: null }).length, 2);
});

test('ETAPA:<estado> filtra por estado, y una etapa antigua se traduce (LEAD → Interesada)', () => {
  const socios = [socio({ id: '1' }), socio({ id: '2' })];
  const estados = new Map([['1', estado('INTERESADA')], ['2', estado('DE_PRUEBA')]]);
  assert.deepEqual(resolverDestinatariasCampana('ETAPA:DE_PRUEBA', { socios, suscripciones: [], estados }).map(s => s.id), ['2']);
  assert.deepEqual(resolverDestinatariasCampana('ETAPA:LEAD', { socios, suscripciones: [], estados }).map(s => s.id), ['1']);
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

// ── Segmentos con parámetro (unificación con Mensajería) ────────────────────
// La pantalla de Mensajería filtraba por etapa del embudo y por etiqueta con su
// propia lógica, y mandaba los emails uno a uno desde el navegador: sin filtro
// de consentimiento, sin enlace de baja y sin quedar registrados. Al pasarla
// por el motor de campañas, esas dos formas de elegir tienen que existir aquí.
test('ETAPA: filtra por etapa del embudo', () => {
  const socios = [
    { id: 'a', leadStage: 'EN_RIESGO' },
    { id: 'b', leadStage: 'ACTIVA' },
    { id: 'c' },
  ] as unknown as Parameters<typeof resolverDestinatariasCampana>[1]['socios'];
  const r = resolverDestinatariasCampana('ETAPA:EN_RIESGO', { socios, suscripciones: [] });
  assert.deepEqual(r.map(s => s.id), ['a']);
});

test('ETIQUETA: filtra por etiqueta de la ficha', () => {
  const socios = [
    { id: 'a', tags: ['VIP', 'Embarazo'] },
    { id: 'b', tags: ['Embarazo'] },
    { id: 'c' },
  ] as unknown as Parameters<typeof resolverDestinatariasCampana>[1]['socios'];
  const r = resolverDestinatariasCampana('ETIQUETA:Embarazo', { socios, suscripciones: [] });
  assert.deepEqual(r.map(s => s.id), ['a', 'b']);
});

// ⚠️ Esto es lo que hace peligroso el `default: return socios` del switch: un
// segmento con parámetro que no se reconociera mandaría a TODAS una campaña
// pensada para seis personas.
test('un segmento con parámetro nunca cae en «todas» por el default', () => {
  const socios = [{ id: 'a' }, { id: 'b' }] as unknown as Parameters<typeof resolverDestinatariasCampana>[1]['socios'];
  assert.deepEqual(resolverDestinatariasCampana('ETAPA:NO_EXISTE', { socios, suscripciones: [] }), []);
  assert.deepEqual(resolverDestinatariasCampana('ETIQUETA:no-existe', { socios, suscripciones: [] }), []);
});

test('la etiqueta humana de un segmento con parámetro se lee', () => {
  assert.equal(etiquetaSegmento('ETAPA:ACTIVA'), 'Estado: Activa');
  assert.equal(etiquetaSegmento('ETAPA:LEAD'), 'Estado: Interesada');
  assert.equal(etiquetaSegmento('ETAPA:EN_RIESGO'), 'Estado: En riesgo (marcada a mano)');
  assert.equal(etiquetaSegmento('ETIQUETA:VIP'), 'Etiqueta: VIP');
  assert.equal(etiquetaSegmento('TODAS'), 'Todas');
});
