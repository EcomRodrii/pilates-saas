import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Sesion, Sala, Suscripcion, PlanTarifa } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio, Candidata } from '../tipos.ts';
import { agenda } from './agenda.ts';

// A4 · pronóstico de llenado. Todo lo demás del motor mira hacia atrás; esta es
// la primera regla que habla de una clase que TODAVÍA NO HA PASADO.
//
// Escenario base: martes a las 20:00 hora de Madrid (18:00 UTC en verano). Las
// ocurrencias pasadas llevaban 6 reservas a 3 días vista y acababan en 8 de 8.
// La próxima lleva 1 a esos mismos 3 días vista.

const NOW = new Date('2026-07-11T12:00:00.000Z'); // sábado
const MS_DIA = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: `Socia ${p.id}`, apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado' | 'sesionId' | 'creadoEn'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, ...p };
}
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p };
}
function sala(p: Partial<Sala> & Pick<Sala, 'id'>): Sala {
  return { studioId: 'e1', nombre: 'Sala', capacidad: 8, color: '#000', ...p };
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
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [],
    campanas: [], sustituciones: [], instructorTarifas: [], intentosFallidos: [], bloqueosAgenda: [],
    contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
    ...over,
  };
}
const memoriaVacia = (): MemoriaEstudio => new Map();

// Martes 18:00 UTC = 20:00 en Madrid. `semanas` hacia atrás (o adelante si <0).
function martes20h(semanasAtras: number): string {
  // 2026-07-14 es martes.
  const base = Date.UTC(2026, 6, 14, 18, 0, 0);
  return iso(base - semanasAtras * 7 * MS_DIA);
}

/** Una ocurrencia pasada con `yaTenia` reservas hechas con ≥3 días de antelación
 *  y el resto pegadas al inicio, hasta `total`. */
function ocurrenciaPasada(id: string, inicioISO: string, yaTenia: number, total: number) {
  const inicio = new Date(inicioISO).getTime();
  const ses = sesion({ id, inicio: inicioISO });
  const reservas = Array.from({ length: total }, (_, i) =>
    reserva({
      socioId: `s${i}`, estado: 'ASISTIDA', sesionId: id,
      creadoEn: iso(inicio - (i < yaTenia ? 5 : 1) * MS_DIA),
    }),
  );
  return { ses, reservas };
}

/** Snapshot con 4 ocurrencias pasadas de la franja + la próxima. */
function escenario(reservasEnLaProxima: number, over: Partial<SnapshotEstudio> = {}) {
  const pasadas = [1, 2, 3, 4].map(k => ocurrenciaPasada(`p${k}`, martes20h(k), 6, 8));
  const proximaInicio = martes20h(-0); // martes 14/07, a 2,75 días de NOW
  const proxima = sesion({ id: 'futura', inicio: proximaInicio });
  const inicioProx = new Date(proximaInicio).getTime();
  const reservasProxima = Array.from({ length: reservasEnLaProxima }, (_, i) =>
    reserva({ socioId: `sf${i}`, estado: 'CONFIRMADA', sesionId: 'futura', creadoEn: iso(inicioProx - 6 * MS_DIA) }),
  );

  return snapshot({
    sesiones: [...pasadas.map(p => p.ses), proxima],
    reservas: [...pasadas.flatMap(p => p.reservas), ...reservasProxima],
    salas: [sala({ id: 's1' })],
    ...over,
  });
}

const a4De = (s: SnapshotEstudio): Candidata | undefined =>
  agenda.detectar(s, memoriaVacia(), NOW).find(c => c.tipo === 'LLENAR_PLAZAS');

test('clase futura muy por detrás de su costumbre → avisa', () => {
  const c = a4De(escenario(1));
  assert.ok(c, 'debería haber una candidata LLENAR_PLAZAS');
  assert.equal(c.sesionId, 'futura');
  assert.equal(c.datosUsados.reservasAhora, 1);
  assert.equal(c.datosUsados.aforo, 8);
  // Las pasadas llevaban 6 a estas alturas.
  assert.equal(c.datosUsados.referenciaHabitual, 6);
  assert.match(c.motivoMotor, /suele llevar 6/);
});

test('la hora del título es la del estudio (20:00), no la de UTC (18:00)', () => {
  const c = a4De(escenario(1));
  assert.ok(c);
  assert.equal(c.datosUsados.hora, '20:00');
  assert.equal(c.datosUsados.diaSemana, 'martes');
});

test('clase futura al ritmo normal → no avisa', () => {
  assert.equal(a4De(escenario(6)), undefined);
});

test('sin ocurrencias pasadas con las que comparar, no se pronostica nada', () => {
  const proximaInicio = martes20h(0);
  const s = snapshot({
    sesiones: [sesion({ id: 'futura', inicio: proximaInicio })],
    salas: [sala({ id: 's1' })],
  });
  assert.equal(a4De(s), undefined);
});

test('una clase que ya pasó nunca genera aviso de llenado', () => {
  const pasadas = [1, 2, 3, 4].map(k => ocurrenciaPasada(`p${k}`, martes20h(k), 6, 8));
  const s = snapshot({
    sesiones: pasadas.map(p => p.ses),
    reservas: pasadas.flatMap(p => p.reservas),
    salas: [sala({ id: 's1' })],
  });
  assert.equal(a4De(s), undefined);
});

test('una clase cancelada tampoco', () => {
  const s = escenario(1);
  s.sesiones = s.sesiones.map(x => x.id === 'futura' ? { ...x, cancelada: true } : x);
  assert.equal(a4De(s), undefined);
});

// ── Afinidad: a quién avisar ────────────────────────────────────────────────

test('cuenta como compatible a quien ya viene ese día a esa hora, con plan en vigor', () => {
  // Marta viene los martes a las 20:00 y tiene mensualidad: es la candidata ideal.
  const base = escenario(1);
  const clasesDeMarta = [1, 2, 3].map(k => sesion({ id: `m${k}`, inicio: martes20h(k + 4) }));
  const s = snapshot({
    ...base,
    socios: [socio({ id: 'marta', nombre: 'Marta' })],
    planesTarifa: [plan({ id: 'pl1' })],
    suscripciones: [suscripcion({ socioId: 'marta', planId: 'pl1' })],
    sesiones: [...base.sesiones, ...clasesDeMarta],
    reservas: [
      ...base.reservas,
      ...clasesDeMarta.map(x => reserva({ socioId: 'marta', estado: 'ASISTIDA', sesionId: x.id, creadoEn: x.inicio })),
    ],
  });

  const c = a4De(s);
  assert.ok(c);
  assert.equal(c.datosUsados.candidatasCompatibles, 1);
  assert.match(c.motivoMotor, /Marta/);
  assert.match(c.motivoMotor, /suele venir los martes a esta hora/);
});

test('sin plan que cubra la clase NO cuenta como compatible (avisarla sería inútil)', () => {
  const base = escenario(1);
  const clasesDeMarta = [1, 2, 3].map(k => sesion({ id: `m${k}`, inicio: martes20h(k + 4) }));
  const s = snapshot({
    ...base,
    socios: [socio({ id: 'marta', nombre: 'Marta' })],
    planesTarifa: [],      // sin planes
    suscripciones: [],     // sin suscripción
    sesiones: [...base.sesiones, ...clasesDeMarta],
    reservas: [
      ...base.reservas,
      ...clasesDeMarta.map(x => reserva({ socioId: 'marta', estado: 'ASISTIDA', sesionId: x.id, creadoEn: x.inicio })),
    ],
  });

  const c = a4De(s);
  assert.ok(c);
  assert.equal(c.datosUsados.candidatasCompatibles, 0);
  assert.match(c.motivoMotor, /No encuentro alumnas compatibles/);
});

test('quien ya tiene sitio en esa clase no se cuenta como candidata a llenarla', () => {
  const base = escenario(1);
  const clasesDeMarta = [1, 2, 3].map(k => sesion({ id: `m${k}`, inicio: martes20h(k + 4) }));
  const s = snapshot({
    ...base,
    socios: [socio({ id: 'marta', nombre: 'Marta' })],
    planesTarifa: [plan({ id: 'pl1' })],
    suscripciones: [suscripcion({ socioId: 'marta', planId: 'pl1' })],
    sesiones: [...base.sesiones, ...clasesDeMarta],
    reservas: [
      ...base.reservas,
      ...clasesDeMarta.map(x => reserva({ socioId: 'marta', estado: 'ASISTIDA', sesionId: x.id, creadoEn: x.inicio })),
      // ya reservada en la clase futura
      reserva({ socioId: 'marta', estado: 'CONFIRMADA', sesionId: 'futura', creadoEn: martes20h(1) }),
    ],
  });

  const c = a4De(s);
  assert.ok(c);
  assert.equal(c.datosUsados.candidatasCompatibles, 0);
});

// ── A5 · clase futura sin quien la dé ───────────────────────────────────────
// El hueco real que cierra: una instructora graba vacaciones DESPUÉS de que su
// horario esté programado, y sus clases siguen asignadas a ella sin que nadie
// se entere (todo lo que mira ausencias hoy lo hace al ASIGNAR).

const a5De = (s: SnapshotEstudio): Candidata | undefined =>
  agenda.detectar(s, memoriaVacia(), NOW).find(c => c.tipo === 'CUBRIR_CLASE_EN_RIESGO');

function instructora(id: string, nombre: string) {
  return { id, studioId: 'e1', nombre, email: `${id}@e.c`, telefono: null, activo: true, color: '#000', avatar: null, rol: 'INSTRUCTOR' as const, authUserId: null };
}

test('ausencia de día completo que pisa una clase ya asignada → aviso', () => {
  const base = escenario(6); // ritmo normal: A4 no dispara, así aislamos A5
  const s = snapshot({
    ...base,
    instructores: [instructora('i1', 'Elena')],
    // martes20h(0) es 2026-07-14 a las 20:00 de Madrid
    bloqueosAgenda: [{ instructorId: 'i1', fecha: '2026-07-14', horaInicio: null, horaFin: null }],
  });
  const c = a5De(s);
  assert.ok(c, 'debería avisar de la clase sin quien la dé');
  assert.equal(c.sesionId, 'futura');
  assert.equal(c.datosUsados.motivo, 'ausencia');
  assert.equal(c.confianza.nivel, 'ALTA');
  assert.match(c.tituloMotor, /Elena no puede dar su clase/);
});

test('la fecha del bloqueo se compara en día LOCAL del estudio, no en UTC', () => {
  // Clase el martes a las 00:30 de Madrid = lunes 22:30 UTC. El bloqueo del
  // martes debe pisarla; con la fecha en UTC se habría buscado el lunes.
  const inicio = new Date(Date.UTC(2026, 6, 13, 22, 30)).toISOString(); // lun 22:30Z = mar 00:30 Madrid
  const s = snapshot({
    sesiones: [sesion({ id: 'madrugada', inicio })],
    salas: [sala({ id: 's1' })],
    instructores: [instructora('i1', 'Elena')],
    bloqueosAgenda: [{ instructorId: 'i1', fecha: '2026-07-14', horaInicio: null, horaFin: null }],
  });
  const c = a5De(s);
  assert.ok(c, 'el bloqueo del martes debe pisar la clase de las 00:30 del martes');
  assert.equal(c.sesionId, 'madrugada');
});

test('bloqueo por horas que NO solapa con la clase → sin aviso', () => {
  const base = escenario(6);
  const s = snapshot({
    ...base,
    instructores: [instructora('i1', 'Elena')],
    // La clase es a las 20:00-20:00; el bloqueo es de mañana.
    bloqueosAgenda: [{ instructorId: 'i1', fecha: '2026-07-14', horaInicio: '06:00:00', horaFin: '14:00:00' }],
  });
  assert.equal(a5De(s), undefined);
});

test('bloqueo de OTRA instructora no pone en riesgo esta clase', () => {
  const base = escenario(6);
  const s = snapshot({
    ...base,
    instructores: [instructora('i1', 'Elena'), instructora('i2', 'Marta')],
    bloqueosAgenda: [{ instructorId: 'i2', fecha: '2026-07-14', horaInicio: null, horaFin: null }],
  });
  assert.equal(a5De(s), undefined);
});

test('la misma instructora en dos clases que se pisan → aviso de solape', () => {
  const inicio = martes20h(0);
  const fin = iso(new Date(inicio).getTime() + 60 * 60000);
  const s = snapshot({
    sesiones: [
      sesion({ id: 'a', inicio, fin }),
      sesion({ id: 'b', inicio: iso(new Date(inicio).getTime() + 30 * 60000), fin: iso(new Date(inicio).getTime() + 90 * 60000) }),
    ],
    salas: [sala({ id: 's1' })],
    instructores: [instructora('i1', 'Elena')],
  });
  const c = a5De(s);
  assert.ok(c);
  assert.equal(c.datosUsados.motivo, 'solape');
  assert.match(c.tituloMotor, /dos clases a la vez/);
});

test('una clase ya pasada con la instructora ausente no genera nada (no hay nada que salvar)', () => {
  const pasadas = [1, 2].map(k => ocurrenciaPasada(`p${k}`, martes20h(k), 6, 8));
  const s = snapshot({
    sesiones: pasadas.map(p => p.ses),
    reservas: pasadas.flatMap(p => p.reservas),
    salas: [sala({ id: 's1' })],
    instructores: [instructora('i1', 'Elena')],
    bloqueosAgenda: [{ instructorId: 'i1', fecha: '2026-07-07', horaInicio: null, horaFin: null }],
  });
  assert.equal(a5De(s), undefined);
});
