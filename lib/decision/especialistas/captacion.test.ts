import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Socio, Suscripcion } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from '../tipos.ts';
import { captacion } from './captacion.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Socia', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: diasAntes(10), activo: true, ...p });
const suscripcion = (socioId: string): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId: 'p', estado: 'ACTIVA', fechaInicio: diasAntes(5), fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null });

// El plan de la clase de prueba (`es_prueba`): lo que hace a una socia «De prueba».
const PLAN_PRUEBA = { id: 'prueba', studioId: 'e1', nombre: 'Clase de prueba', descripcion: null, precio: 10, tipo: 'PUNTUAL', sesiones: 1, activo: true, esPrueba: true } as PlanTarifa;
const prueba = (socioId: string, diasDesdeCompra: number): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId: 'prueba', estado: 'ACTIVA', fechaInicio: diasAntes(diasDesdeCompra).slice(0, 10), fechaFin: null, sesionesRestantes: 0, stripeSubscriptionId: null });

function snap(
  socios: Socio[], suscripciones: Suscripcion[] = [], widgetEventosCheckout: SnapshotEstudio['widgetEventosCheckout'] = [],
  extra: Partial<Pick<SnapshotEstudio, 'hechosClientas' | 'contactosManuales'>> = {},
): SnapshotEstudio {
  return {
    studioId: 'e1', socios, reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones, planesTarifa: [PLAN_PRUEBA], tiposClase: [], instructores: [], automationLogs: [], campanas: [], sustituciones: [], instructorTarifas: [], intentosFallidos: [], bloqueosAgenda: [], widgetEventosCheckout, contactosManuales: extra.contactosManuales ?? [], hechosClientas: extra.hechosClientas ?? {}, contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
  };
}

type EventoTipo = 'checkout_started' | 'booking_completed';
// Ventana base: 20-50 días atrás. Ventana reciente: 1-13 días atrás.
const evento = (tipo: EventoTipo, sessionId: string, diasAtras: number) =>
  ({ sessionId, tipo, creadoEn: diasAntes(diasAtras) }) as { sessionId: string; tipo: EventoTipo; creadoEn: string };

// n sesiones en la ventana BASE (20-50d) con tasa de éxito dada (0..1).
function eventosBase(n: number, tasaExito: number): ReturnType<typeof evento>[] {
  const out: ReturnType<typeof evento>[] = [];
  for (let i = 0; i < n; i++) {
    const sid = `base-${i}`;
    out.push(evento('checkout_started', sid, 30));
    if (i < Math.round(n * tasaExito)) out.push(evento('booking_completed', sid, 30));
  }
  return out;
}
// n sesiones en la ventana RECIENTE (1-13d) con tasa de éxito dada (0..1).
function eventosRecientes(n: number, tasaExito: number): ReturnType<typeof evento>[] {
  const out: ReturnType<typeof evento>[] = [];
  for (let i = 0; i < n; i++) {
    const sid = `reciente-${i}`;
    out.push(evento('checkout_started', sid, 5));
    if (i < Math.round(n * tasaExito)) out.push(evento('booking_completed', sid, 5));
  }
  return out;
}

test('CAPTACION C3: sin ventana base (estudio nuevo/widget recién activado) no dispara', () => {
  const c = detectar(snap([], [], eventosRecientes(10, 0.3)));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

test('CAPTACION C3: muestra reciente insuficiente (<5 checkouts) no dispara', () => {
  const c = detectar(snap([], [], [...eventosBase(10, 0.9), ...eventosRecientes(3, 0.2)]));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

test('CAPTACION C3: tasa reciente similar a la habitual del estudio no dispara', () => {
  const c = detectar(snap([], [], [...eventosBase(20, 0.85), ...eventosRecientes(10, 0.8)]));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

test('CAPTACION C3: tasa reciente caída clara frente a su propio histórico → REVISAR_ABANDONO_CHECKOUT', () => {
  const c = detectar(snap([], [], [...eventosBase(20, 0.9), ...eventosRecientes(10, 0.1)]));
  const cand = c.find(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT');
  assert.ok(cand, 'debería generar la candidata de abandono de checkout');
  assert.equal(cand?.especialista, 'CAPTACION');
  assert.ok(!cand?.socioId, 'es agregada, no debe llevar socioId');
  assert.notEqual(cand?.confianza.nivel, 'ALTA', 'techo MEDIA a propósito, nunca ALTA');
});

test('CAPTACION C3: un estudio con conversión históricamente baja (60%) no se marca por comparar contra un corte fijo', () => {
  // Reciente igual de "malo" que siempre para ESTE estudio → sin caída relativa → no dispara.
  const c = detectar(snap([], [], [...eventosBase(20, 0.6), ...eventosRecientes(10, 0.55)]));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

// Regresión QA (PR #1274, hallazgo 2): con solo 1-4 checkouts en la ventana
// base, el prior sale 0%/100% y una caída "real" frente a ese prior es
// estadísticamente vacía — no debe generar una Candidata.
test('CAPTACION C3: ventana base con muestra insuficiente (< 5) no dispara aunque la caída parezca clara', () => {
  const c = detectar(snap([], [], [...eventosBase(1, 1.0), ...eventosRecientes(5, 0)]));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

test('CAPTACION C3: ventana base justo en el mínimo (5) sí puede disparar con caída clara', () => {
  const c = detectar(snap([], [], [...eventosBase(5, 1.0), ...eventosRecientes(10, 0.1)]));
  assert.ok(c.find(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT'), 'con muestra base suficiente y caída real, sí debe disparar');
});
const detectar = (s: SnapshotEstudio) => captacion.detectar(s, new Map() as MemoriaEstudio, NOW);

// C1/C2 trabajan con el ESTADO de cada socia (lib/clientas/estado.ts), el mismo
// que enseña Clientas, no con `lead_stage`.

test('CAPTACION: interesada (ficha sin venir ni comprar, 10 días, sin contacto) → CONTACTAR_LEAD', () => {
  const c = detectar(snap([socio({ id: 'l1', nombre: 'Lea' })]));
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'CONTACTAR_LEAD');
  assert.equal(c[0].especialista, 'CAPTACION');
  assert.equal(c[0].socioId, 'l1');
  assert.match(c[0].motivoMotor, /se dio de alta hace 10 días y todavía no ha venido ni comprado/);
});

test('CAPTACION: la etapa antigua ya no decide — una «LEAD» que ya viene a clase no es interesada', () => {
  const c = detectar(snap([socio({ id: 'l4', nombre: 'Viene', leadStage: 'LEAD' })], [], [], {
    hechosClientas: { l4: { ultimaAsistencia: diasAntes(3), primeraReserva: diasAntes(20) } },
  }));
  assert.equal(c.length, 0);
});

test('CAPTACION: tuvo su prueba hace 8 días y no compró → CONVERTIR_PRUEBA, contando desde la prueba', () => {
  const c = detectar(snap([socio({ id: 'p1', nombre: 'Pru', fechaAlta: diasAntes(40) })], [prueba('p1', 12)], [], {
    hechosClientas: { p1: { ultimaAsistencia: diasAntes(8), primeraReserva: diasAntes(8) } },
  }));
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'CONVERTIR_PRUEBA');
  // Desde su clase de prueba, no desde que se creó su ficha (hace 40 días).
  assert.match(c[0].motivoMotor, /vino a su clase de prueba hace 8 días/);
});

test('CAPTACION: su clase de prueba aún no ha llegado → nada que cerrar todavía', () => {
  const c = detectar(snap([socio({ id: 'p3', nombre: 'Pronto' })], [prueba('p3', 2)], [], {
    hechosClientas: { p3: { ultimaAsistencia: null, primeraReserva: new Date(NOW.getTime() + 3 * 86400000).toISOString() } },
  }));
  assert.equal(c.length, 0);
});

test('CAPTACION: prueba que YA convirtió (compró un plan de verdad) no dispara', () => {
  const c = detectar(snap([socio({ id: 'p2', nombre: 'Pru2' })], [prueba('p2', 12), suscripcion('p2')], [], {
    hechosClientas: { p2: { ultimaAsistencia: diasAntes(4), primeraReserva: diasAntes(8) } },
  }));
  assert.equal(c.length, 0);
});

test('CAPTACION: con un plan ya está dentro → no es captación', () => {
  const c = detectar(snap([socio({ id: 'l2', nombre: 'Lea2', leadStage: 'LEAD' })], [suscripcion('l2')]));
  assert.equal(c.length, 0);
});

test('CAPTACION: interesada recién creada (2 días) aún no madura, pero sin contacto → BAJA (dispara)', () => {
  // leadMadurado=false, sinContactoReciente=true → confianza BAJA → sí genera candidata (visible, prioridad baja).
  const c = detectar(snap([socio({ id: 'l3', nombre: 'Nueva', fechaAlta: diasAntes(2) })]));
  assert.equal(c[0]?.tipo, 'CONTACTAR_LEAD');
  assert.equal(c[0]?.confianza.nivel, 'BAJA');
});

test('CAPTACION: si dijo que no quiere seguir (contacto apuntado), no se le insiste', () => {
  const c = detectar(snap([socio({ id: 'l5', nombre: 'No' })], [], [], {
    contactosManuales: [{ socioId: 'l5', en: diasAntes(2), resultado: 'NO_QUIERE_SEGUIR' }],
  }));
  assert.equal(c.length, 0);
});

// Migrada desde otra plataforma CON historial (el importador marca `lead_stage`
// 'ACTIVA'): no es una interesada aunque aquí no tenga clases ni compras.
test('CAPTACION: una migrada con historial no es una interesada: no dispara', () => {
  const c = detectar(snap([socio({ id: 'm1', nombre: 'Migrada', leadStage: 'ACTIVA' })]));
  assert.equal(c.length, 0);
});

test('CAPTACION: una ficha sin fecha de alta no rompe ni inventa cuánto lleva', () => {
  const c = detectar(snap([socio({ id: 'm2', nombre: 'SinFecha', fechaAlta: null as unknown as string })]));
  assert.equal(c.length, 0);
});
