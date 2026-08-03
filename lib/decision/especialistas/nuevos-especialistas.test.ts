import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion, PlanTarifa, Sesion, Instructor, Reserva } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio, SustitucionSnapshot } from '../tipos.ts';
import { finanzas } from './finanzas.ts';
import { marketing } from './marketing.ts';
import { equipo } from './equipo.ts';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const diasDespues = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();
const horasAntes = (n: number) => new Date(NOW.getTime() - n * 3600000).toISOString();
let n = 0;

const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Ana', apellidos: 'G', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p });
const plan = (p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'tipo'>): PlanTarifa =>
  ({ studioId: 'e1', nombre: 'Bono 8', descripcion: null, precio: 64, sesiones: 8, activo: true, ...p });
const sus = (socioId: string, planId: string, p: Partial<Suscripcion> = {}): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId, estado: 'ACTIVA', fechaInicio: diasAntes(30), fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p });
const sesion = (instructorId: string, inicio: string): Sesion =>
  ({ id: `se-${++n}`, studioId: 'e1', tipoClaseId: 'tc', salaId: 's1', instructorId, inicio, fin: inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null });
const instructor = (id: string, p: Partial<Instructor> = {}): Instructor =>
  ({ id, studioId: 'e1', nombre: `Ins${id}`, email: null, telefono: null, color: '#000', activo: true, rol: 'INSTRUCTOR', authUserId: null, ...p });
const sustitucion = (p: Partial<SustitucionSnapshot> & Pick<SustitucionSnapshot, 'sesionId'>): SustitucionSnapshot =>
  ({ id: `sub-${++n}`, studioId: 'e1', instructorOriginalId: null, estado: 'contactando', creadoEn: diasAntes(1), ...p });

function snap(p: Partial<SnapshotEstudio>): SnapshotEstudio {
  return { studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [], suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [], sustituciones: [], instructorTarifas: [], contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 }, ...p };
}
const M = new Map() as MemoriaEstudio;

test('FINANZAS: bono con 1 sesión restante → PROPONER_RENOVACION_BONO', () => {
  const s = snap({ socios: [socio({ id: '1', nombre: 'Lucía' })], planesTarifa: [plan({ id: 'b', tipo: 'BONO' })], suscripciones: [sus('1', 'b', { sesionesRestantes: 1 })] });
  const c = finanzas.detectar(s, M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'PROPONER_RENOVACION_BONO');
  assert.equal(c[0].especialista, 'FINANZAS');
});

test('FINANZAS: bono con 5 sesiones o plan MENSUAL → no dispara', () => {
  assert.equal(finanzas.detectar(snap({ socios: [socio({ id: '1' })], planesTarifa: [plan({ id: 'b', tipo: 'BONO' })], suscripciones: [sus('1', 'b', { sesionesRestantes: 5 })] }), M, NOW).length, 0);
  assert.equal(finanzas.detectar(snap({ socios: [socio({ id: '1' })], planesTarifa: [plan({ id: 'm', tipo: 'MENSUAL', sesiones: null })], suscripciones: [sus('1', 'm', { sesionesRestantes: 0 })] }), M, NOW).length, 0);
});

// P2-5: una socia con plan MENSUAL (reformer) Y un bono de mat sueltos a la vez
// (posible desde planes_por_tipo_de_clase) — el índice de UNA sola suscripción
// por socia solo veía la primera y el bono agotado quedaba invisible.
test('FINANZAS: socia con MENSUAL + BONO simultáneos → el bono casi agotado SÍ se detecta', () => {
  const s = snap({
    socios: [socio({ id: '1', nombre: 'Marta' })],
    planesTarifa: [plan({ id: 'm', tipo: 'MENSUAL', sesiones: null }), plan({ id: 'b', tipo: 'BONO' })],
    suscripciones: [sus('1', 'm', { sesionesRestantes: null }), sus('1', 'b', { sesionesRestantes: 1 })],
  });
  const c = finanzas.detectar(s, M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'PROPONER_RENOVACION_BONO');
  assert.equal(c[0].datosUsados.nombre, 'Marta');
});

test('FINANZAS: dos socias distintas con bonos casi agotados → una candidata por socia', () => {
  const s = snap({
    socios: [socio({ id: '1', nombre: 'Marta' }), socio({ id: '2', nombre: 'Elena' })],
    planesTarifa: [plan({ id: 'b', tipo: 'BONO' })],
    suscripciones: [sus('1', 'b', { sesionesRestantes: 0 }), sus('2', 'b', { sesionesRestantes: 1 })],
  });
  const c = finanzas.detectar(s, M, NOW);
  assert.equal(c.length, 2);
});

test('MARKETING: 5+ inactivas (asistieron y pararon 30d+) → PREPARAR_CAMPANA; menos → nada', () => {
  const inactivas = Array.from({ length: 5 }, (_, i) => socio({ id: `i${i}` }));
  const reserva = (socioId: string): Reserva =>
    ({ id: `r-${++n}`, studioId: 'e1', socioId, sesionId: 's', estado: 'ASISTIDA', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: diasAntes(40) });
  const reservas = inactivas.map(x => reserva(x.id));
  const c = marketing.detectar(snap({ socios: inactivas, reservas }), M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'PREPARAR_CAMPANA');
  assert.equal((c[0].datosUsados.publico as number), 5);
  // Con 4, no.
  assert.equal(marketing.detectar(snap({ socios: inactivas.slice(0, 4), reservas: reservas.slice(0, 4) }), M, NOW).length, 0);
});

test('EQUIPO: instructora con clases recientes pero ninguna futura → REVISAR_CARGA_EQUIPO', () => {
  const s = snap({
    instructores: [instructor('i1'), instructor('i2')],
    // i1: daba clases (2 en el último mes), 0 futuras. i2: tiene futuras (el estudio sigue vivo).
    sesiones: [sesion('i1', diasAntes(5)), sesion('i1', diasAntes(12)), sesion('i2', diasDespues(3))],
  });
  const c = equipo.detectar(s, M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].especialista, 'EQUIPO');
  assert.equal(c[0].datosUsados.instructora, 'Insi1');
});

test('EQUIPO: si el estudio no tiene NINGUNA clase futura, no dispara (cierre/vacaciones)', () => {
  const s = snap({ instructores: [instructor('i1')], sesiones: [sesion('i1', diasAntes(5)), sesion('i1', diasAntes(12))] });
  assert.equal(equipo.detectar(s, M, NOW).length, 0);
});

// P2-5, punto ciego original: EQUIPO nunca miraba `sustituciones`.
test('EQUIPO: sustitución en "contactando" desde hace más de 3h → REVISAR_CARGA_EQUIPO', () => {
  const s = snap({
    instructores: [instructor('i1', { nombre: 'Marta' })],
    sustituciones: [sustitucion({ sesionId: 'se1', instructorOriginalId: 'i1', creadoEn: horasAntes(4) })],
  });
  const c = equipo.detectar(s, M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'REVISAR_CARGA_EQUIPO');
  assert.equal(c[0].instructorId, 'i1');
  assert.ok(c[0].motivoMotor.includes('Marta'));
});

test('EQUIPO: sustitución reciente (menos de 3h) no dispara todavía', () => {
  const s = snap({ sustituciones: [sustitucion({ sesionId: 'se1', creadoEn: horasAntes(1) })] });
  assert.equal(equipo.detectar(s, M, NOW).length, 0);
});

test('EQUIPO: sustitución ya resuelta (confirmada) no dispara aunque sea antigua', () => {
  const s = snap({ sustituciones: [sustitucion({ sesionId: 'se1', estado: 'confirmada', creadoEn: horasAntes(48) })] });
  assert.equal(equipo.detectar(s, M, NOW).length, 0);
});

// Regresión: el early-return de E1 ("sin clases futuras = vacaciones") no
// debe descartar candidatas de E2 ya detectadas — son señales independientes.
test('EQUIPO: sustitución sin resolver dispara AUNQUE el estudio no tenga ninguna clase futura', () => {
  const s = snap({
    instructores: [instructor('i1')],
    sesiones: [sesion('i1', diasAntes(5))], // sin clases futuras: el gate de E1 cortaría en `return []`
    sustituciones: [sustitucion({ sesionId: 'se1', instructorOriginalId: 'i1', creadoEn: horasAntes(4) })],
  });
  const c = equipo.detectar(s, M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].datosUsados.sustitucionId, s.sustituciones[0].id);
});
