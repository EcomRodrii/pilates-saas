// Escenarios reales del Centro de Control: con un snapshot NO vacío, los
// especialistas deben detectar los problemas y NO decir "todo en orden".
// Guarda contra la regresión de la causa raíz (snapshot vacío por RLS con el
// cliente anónimo en servidor → todos EXCELENTE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Sesion, Sala, Recibo, Suscripcion, PlanTarifa } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from './tipos.ts';
import { ejecutarAnalisis } from './motor.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z'); // sábado
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Socia', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p });
const reserva = (p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado' | 'sesionId'>): Reserva =>
  ({ id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: diasAntes(1), ...p });
const asistencias = (socioId: string, cadaDias: number, cuantas: number, offset: number): Reserva[] =>
  Array.from({ length: cuantas }, (_, i) => reserva({ socioId, estado: 'ASISTIDA', sesionId: 'hist', creadoEn: diasAntes(offset + i * cadaDias) }));
const suscripcion = (p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p });
const plan = (p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa =>
  ({ studioId: 'e1', nombre: 'Plan', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true, ...p });
const sesion = (p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion =>
  ({ studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p });
const sala = (p: Partial<Sala> & Pick<Sala, 'id'>): Sala => ({ studioId: 'e1', nombre: 'Sala', capacidad: 8, color: '#000', ...p });
const recibo = (p: Partial<Recibo> & Pick<Recibo, 'estado'>): Recibo =>
  ({ id: `rec-${++n}`, studioId: 'e1', socioId: null, suscripcionId: null, concepto: 'Cuota', importe: 90, fechaVencimiento: diasAntes(4), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p });

// Lunes 10:00 UTC a N semanas de distancia (past si diasAtras>0, futuro si <0).
function lunes10(diasAtras: number): Sesion {
  const d = new Date(NOW.getTime() - diasAtras * 86400000);
  // ajustar a lunes
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  d.setUTCHours(10, 0, 0, 0);
  return sesion({ id: `lun10-${diasAtras}`, inicio: d.toISOString(), aforoMaximo: 8 });
}

function construirSnapshot(): SnapshotEstudio {
  const socios: Socio[] = [
    // Escenario 1: impago sin tarjeta, socia activa (I3 → COBRAR_PENDIENTE).
    socio({ id: 'deudora', nombre: 'Deudora' }),
    // Escenario 3: ausencia anómala (Retención R1 → RECUPERAR_SOCIA).
    socio({ id: 'ausente', nombre: 'Ausente' }),
    // Socias regulares (para que precioMedioSesion > 0 y haya vida en el estudio).
    ...Array.from({ length: 5 }, (_, i) => socio({ id: `reg${i}`, nombre: `Reg${i}` })),
  ];
  const planes: PlanTarifa[] = [plan({ id: 'mensual', precio: 89, tipo: 'MENSUAL' })];
  const suscripciones: Suscripcion[] = [
    suscripcion({ socioId: 'deudora', planId: 'mensual' }),
    suscripcion({ socioId: 'ausente', planId: 'mensual' }),
    ...Array.from({ length: 5 }, (_, i) => suscripcion({ socioId: `reg${i}`, planId: 'mensual' })),
  ];
  const reservasHist: Reserva[] = [
    ...asistencias('ausente', 2, 24, 25),                                  // 3x/sem, 25 días sin venir
    ...Array.from({ length: 5 }, (_, i) => asistencias(`reg${i}`, 7, 8, 2)).flat(), // 1x/sem recientes
  ];

  // Escenario 2: franja lunes 10:00 medio vacía 4 semanas + una futura.
  const clasesVacias = [lunes10(7), lunes10(14), lunes10(21), lunes10(28)];
  const clasesVaciasFuturas = [lunes10(-7)]; // próximo lunes
  const reservasVacias = clasesVacias.map(se => reserva({ socioId: 'reg0', estado: 'CONFIRMADA', sesionId: se.id })); // 1/8 = 12.5%

  const recibos: Recibo[] = [
    // impago de socia activa, vencido 20 días, sin tarjeta guardada → I3.
    recibo({ estado: 'PENDIENTE', socioId: 'deudora', importe: 60, fechaVencimiento: diasAntes(20) }),
  ];

  return {
    studioId: 'e1',
    socios,
    reservas: [...reservasHist, ...reservasVacias],
    sesiones: [...clasesVacias, ...clasesVaciasFuturas],
    salas: [sala({ id: 's1' }), sala({ id: 's2' })],
    recibos, suscripciones, planesTarifa: planes,
    tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
}

test('escenarios reales: impago, clase vacía y ausencia se detectan (no "todo en orden")', () => {
  const resultado = ejecutarAnalisis({
    snapshot: construirSnapshot(), memoria: new Map() as MemoriaEstudio,
    pendientesActuales: [], resueltas90d: [], nombrePropietario: 'Marco',
    ventanaMientrasDormiasDesde: new Date(NOW.getTime() - 2 * 86400000), now: NOW,
  });

  const tipos = new Set(resultado.candidatasFinales.map(c => c.tipo));
  const porEsp = new Set(resultado.candidatasFinales.map(c => c.especialista));

  // 1) Ingresos detecta el impago (COBRAR_PENDIENTE de la deudora).
  assert.ok(tipos.has('COBRAR_PENDIENTE'), 'Ingresos debe detectar el impago pendiente');
  assert.ok(porEsp.has('INGRESOS'));

  // 2) Agenda detecta la clase medio vacía (FUSIONAR_SESIONES).
  assert.ok(tipos.has('FUSIONAR_SESIONES'), 'Agenda debe detectar la clase infrautilizada');
  assert.ok(porEsp.has('AGENDA'));

  // 3) Retención detecta la ausencia anómala (RECUPERAR_SOCIA).
  assert.ok(tipos.has('RECUPERAR_SOCIA'), 'Retención debe detectar la ausencia');
  assert.ok(porEsp.has('RETENCION'));

  // El resumen NO puede decir "todo excelente" habiendo problemas.
  assert.notEqual(resultado.resumenDiario.estadoGeneral, 'EXCELENTE');
  assert.ok(resultado.resumenDiario.nDecisiones > 0);
});
