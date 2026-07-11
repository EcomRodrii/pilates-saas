import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Suscripcion, PlanTarifa } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio, HechoMemoria } from '../tipos.ts';
import { retencion } from './retencion.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'Ana', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', sesionId: 'ses-1', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: diasAntes(1), ...p };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return { id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Mensual', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true, ...p };
}
function snapshot(over: Partial<SnapshotEstudio>): SnapshotEstudio {
  return {
    studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones: [suscripcion({ socioId: 'a', planId: 'p1' })], planesTarifa: [plan({ id: 'p1' })],
    tiposClase: [], instructores: [], automationLogs: [], campanas: [],
    ...over,
  };
}
function asistenciasHabituales(socioId: string, cadaDias: number, cuantas: number, offsetDias = 0): Reserva[] {
  return Array.from({ length: cuantas }, (_, i) => reserva({ socioId, estado: 'ASISTIDA', creadoEn: diasAntes(offsetDias + i * cadaDias) }));
}
function memoriaVacia(): MemoriaEstudio { return new Map(); }
function memoriaCon(hechos: HechoMemoria[]): MemoriaEstudio {
  const m: MemoriaEstudio = new Map();
  for (const h of hechos) { const arr = m.get(h.socioId) ?? []; arr.push(h); m.set(h.socioId, arr); }
  return m;
}

test('R1: ausencia anomala moderada, socia 3x/semana, 18 dias sin venir → RECUPERAR_SOCIA', () => {
  const socios = [socio({ id: 'a' })];
  // 3x/semana, última asistencia hace 18 días (umbral ~14, crítico ~28 → R1 dispara, no R2).
  const reservas = asistenciasHabituales('a', 2, 24, 18);
  const snap = snapshot({ socios, reservas });
  const [c] = retencion.detectar(snap, memoriaVacia(), NOW);
  assert.ok(c);
  assert.equal(c.tipo, 'RECUPERAR_SOCIA');
  assert.equal(c.accion.tipo, 'CONTACTO_MANUAL');
  assert.equal(c.riesgo, 'PERDIDA');
});

test('R2: ausencia critica + renovacion en 10 dias → ENVIAR_REACTIVACION', () => {
  const socios = [socio({ id: 'a' })];
  const reservas = asistenciasHabituales('a', 2, 24, 40); // 3x/semana, hace 40 días (crítico ~28 → dispara R2)
  const suscripciones = [suscripcion({ socioId: 'a', planId: 'p1', fechaFin: diasAntes(-10) })];
  const snap = snapshot({ socios, reservas, suscripciones });
  const [c] = retencion.detectar(snap, memoriaVacia(), NOW);
  assert.ok(c);
  assert.equal(c.tipo, 'ENVIAR_REACTIVACION');
  assert.equal(c.accion.tipo, 'ENVIAR_EMAIL');
});

test('R3: renovacion en 5 dias + enganche cae a la mitad → CONTACTO_MANUAL (llamada), gana a R1/R2', () => {
  const socios = [socio({ id: 'a' })];
  // Frecuencia habitual 4x/semana en semanas 5-12 atrás; últimas 4 semanas solo 1 asistencia (cae mucho).
  const historicas = asistenciasHabituales('a', 1.75, 32, 30); // ~4/semana en ventana de 8 semanas antes de la última
  const reciente = [reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(3) })];
  const suscripciones = [suscripcion({ socioId: 'a', planId: 'p1', fechaFin: diasAntes(-5) })];
  const snap = snapshot({ socios, reservas: [...historicas, ...reciente], suscripciones });
  const [c] = retencion.detectar(snap, memoriaVacia(), NOW);
  assert.ok(c);
  assert.equal(c.tipo, 'RECUPERAR_SOCIA');
  assert.equal(c.accion.tipo === 'CONTACTO_MANUAL' && c.accion.canal, 'LLAMADA');
  assert.equal(c.urgencia, 1);
  assert.equal(retencion.detectar(snap, memoriaVacia(), NOW).length, 1); // una sola candidata por socia
});

test('R4: 3+ no-shows con ratio >=40% → CONTACTO_MANUAL', () => {
  const socios = [socio({ id: 'a' })];
  const reservas = [
    reserva({ socioId: 'a', estado: 'NO_ASISTIO', creadoEn: diasAntes(5) }),
    reserva({ socioId: 'a', estado: 'NO_ASISTIO', creadoEn: diasAntes(10) }),
    reserva({ socioId: 'a', estado: 'NO_ASISTIO', creadoEn: diasAntes(15) }),
    reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(20) }),
  ];
  const snap = snapshot({ socios, reservas });
  const [c] = retencion.detectar(snap, memoriaVacia(), NOW);
  assert.ok(c);
  assert.equal(c.tipo, 'RECUPERAR_SOCIA');
  assert.equal(c.datosUsados.noShows, 3);
});

test('elegibilidad: socia inactiva no genera candidatas', () => {
  const socios = [socio({ id: 'a', activo: false })];
  const reservas = asistenciasHabituales('a', 2, 24, 40);
  const snap = snapshot({ socios, reservas });
  assert.equal(retencion.detectar(snap, memoriaVacia(), NOW).length, 0);
});

test('elegibilidad: antiguedad menor a 30 dias no genera candidatas', () => {
  const socios = [socio({ id: 'a', fechaAlta: diasAntes(10) })];
  const reservas = asistenciasHabituales('a', 2, 24, 40);
  const snap = snapshot({ socios, reservas });
  assert.equal(retencion.detectar(snap, memoriaVacia(), NOW).length, 0);
});

test('elegibilidad: bono agotado (0 sesiones restantes) no genera candidatas', () => {
  const socios = [socio({ id: 'a' })];
  const suscripciones = [suscripcion({ socioId: 'a', planId: 'p1', sesionesRestantes: 0 })];
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 10 })];
  const reservas = asistenciasHabituales('a', 2, 24, 40);
  const snap = snapshot({ socios, reservas, suscripciones, planesTarifa: planes });
  assert.equal(retencion.detectar(snap, memoriaVacia(), NOW).length, 0);
});

test('memoria: NO_OFRECER_DESCUENTOS baja la confianza de R2 (no puede ser ALTA)', () => {
  const socios = [socio({ id: 'a' })];
  const reservas = asistenciasHabituales('a', 2, 24, 40);
  const suscripciones = [suscripcion({ socioId: 'a', planId: 'p1', fechaFin: diasAntes(-10) })];
  const snap = snapshot({ socios, reservas, suscripciones });
  const memoria = memoriaCon([{
    id: 'h1', studioId: 'e1', socioId: 'a', clave: 'NO_OFRECER_DESCUENTOS', valor: {},
    nivel: 'LARGO', confianza: 'ALTA', origen: 'MANUAL', creadoPor: 'u1', evidencia: '', activa: true, expiraEn: null,
  }]);
  const [c] = retencion.detectar(snap, memoria, NOW);
  assert.ok(c);
  assert.equal(c.tipo, 'ENVIAR_REACTIVACION'); // el especialista aún la emite; el veto/degradación lo aplica memoria.ts (motor.ts)
  assert.notEqual(c.confianza.nivel, 'ALTA');
});

test('silencio: estudio sin datos suficientes no genera candidatas (ni error)', () => {
  const socios = [socio({ id: 'a' })];
  const snap = snapshot({ socios });
  assert.equal(retencion.detectar(snap, memoriaVacia(), NOW).length, 0);
});
