// Test de oro (DECISION-OS-NUCLEO.md §11, DECISION-OS-ESPECIALISTAS.md §10):
// un snapshot sintético que reproduce el mockup (Laura+Marta, martes 19h,
// 2 pagos 180€) debe producir, tras aplicar los caps de la Bible, exactamente
// las 3 tarjetas de mayor score en Prioridades — Marta queda en la tarjeta
// de su especialista, no desaparece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Sesion, Sala, Recibo, Suscripcion, PlanTarifa } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from './tipos.ts';
import { ejecutarAnalisis } from './motor.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'Socia', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado' | 'sesionId'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: diasAntes(1), ...p };
}
function asistencias(socioId: string, cadaDias: number, cuantas: number, offsetDias: number): Reserva[] {
  return Array.from({ length: cuantas }, (_, i) => reserva({ socioId, estado: 'ASISTIDA', sesionId: 'historica', creadoEn: diasAntes(offsetDias + i * cadaDias) }));
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return { id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Plan', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true, ...p };
}
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p };
}
function sala(p: Partial<Sala> & Pick<Sala, 'id'>): Sala {
  return { studioId: 'e1', nombre: 'Sala', capacidad: 8, color: '#000', ...p };
}
function recibo(p: Partial<Recibo> & Pick<Recibo, 'estado'>): Recibo {
  return { id: `rec-${++n}`, studioId: 'e1', socioId: null, suscripcionId: null, concepto: 'Cuota', importe: 90, fechaVencimiento: diasAntes(4), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p };
}
function slot(diasAtras: number): Sesion {
  const d = new Date(NOW.getTime() - diasAtras * 86400000);
  d.setUTCHours(19, 0, 0, 0);
  return sesion({ id: `martes19h-${diasAtras}`, inicio: d.toISOString(), aforoMaximo: 8, salaId: 's1' });
}

test('fixture del mockup: Laura + Marta + martes 19h + 2 pagos → Prioridades = las 3 de mayor score', () => {
  const socios: Socio[] = [
    socio({ id: 'laura', nombre: 'Laura' }),
    socio({ id: 'marta', nombre: 'Marta' }),
    ...Array.from({ length: 5 }, (_, i) => socio({ id: `regular${i}`, nombre: `Regular${i}` })),
    socio({ id: 'pagoA', nombre: 'Pago A', stripeCustomerId: 'cus_a', stripePaymentMethodId: 'pm_a' }),
    socio({ id: 'pagoB', nombre: 'Pago B', stripeCustomerId: 'cus_b', stripePaymentMethodId: 'pm_b' }),
  ];

  const planes: PlanTarifa[] = [plan({ id: 'mensual', precio: 89, tipo: 'MENSUAL' }), plan({ id: 'barato', precio: 40, tipo: 'MENSUAL' })];

  const suscripciones: Suscripcion[] = [
    suscripcion({ socioId: 'laura', planId: 'mensual', fechaFin: diasAntes(-10) }), // renueva en 10 días
    suscripcion({ socioId: 'marta', planId: 'barato' }), // sin renovación próxima → confianza más baja
    ...Array.from({ length: 5 }, (_, i) => suscripcion({ socioId: `regular${i}`, planId: 'mensual' })),
    suscripcion({ socioId: 'pagoA', planId: 'mensual' }),
    suscripcion({ socioId: 'pagoB', planId: 'mensual' }),
  ];

  const reservasHistoricas = [
    ...asistencias('laura', 2, 24, 25),   // 3x/semana, 25 días sin venir (R1: <28 crítico)
    ...asistencias('marta', 2, 24, 16),   // 3x/semana, 16 días sin venir (ausencia más leve)
    ...Array.from({ length: 5 }, (_, i) => asistencias(`regular${i}`, 7, 8, 2)).flat(), // 1x/semana, asistencia reciente (no dispara Retención) — solo para precioMedioSesion
  ];

  const sesiones = [slot(7), slot(14), slot(21), slot(28), slot(35), slot(42)];
  const reservasLlenas = sesiones.flatMap(se => Array.from({ length: 8 }, (_, i) => reserva({ socioId: `llena-${se.id}-${i}`, estado: 'CONFIRMADA', sesionId: se.id })));
  const listaEspera = sesiones.flatMap(se => [0, 1].map(i => reserva({ socioId: `espera-${se.id}-${i}`, estado: 'LISTA_ESPERA', sesionId: se.id })));

  const salas: Sala[] = [sala({ id: 's1', capacidad: 8 }), sala({ id: 's2', capacidad: 8 })]; // s2 = capacidad libre

  const recibos: Recibo[] = [
    recibo({ estado: 'PENDIENTE', socioId: 'pagoA', importe: 90, fechaVencimiento: diasAntes(3) }),
    recibo({ estado: 'PENDIENTE', socioId: 'pagoB', importe: 90, fechaVencimiento: diasAntes(5) }),
  ];

  const snapshot: SnapshotEstudio = {
    studioId: 'e1',
    socios, reservas: [...reservasHistoricas, ...reservasLlenas, ...listaEspera],
    sesiones, salas, recibos, suscripciones, planesTarifa: planes,
    tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
  const memoria: MemoriaEstudio = new Map();

  const resultado = ejecutarAnalisis({
    snapshot, memoria,
    pendientesActuales: [], resueltas90d: [],
    nombrePropietario: 'Marco',
    ventanaMientrasDormiasDesde: new Date(NOW.getTime() - 2 * 86400000),
    now: NOW,
  });

  // 4 candidatas generadas: Laura, Marta, ABRIR_SESION, RECUPERAR_PAGOS.
  assert.equal(resultado.candidatasFinales.length, 4);

  // El bloque Prioridades nunca supera 3 tarjetas (regla de oro de la Bible).
  assert.ok(resultado.prioridadesHome.length <= 3);
  assert.equal(resultado.prioridadesHome.length, 3);

  const tiposEnPrioridades = resultado.prioridadesHome.map(c => c.tipo).sort();
  assert.deepEqual(tiposEnPrioridades, ['ABRIR_SESION', 'RECUPERAR_PAGOS', 'RECUPERAR_SOCIA']);

  // Laura (mayor score que Marta) sí entra en Prioridades; Marta no.
  const socioIdsEnPrioridades = resultado.prioridadesHome.map(c => c.socioId);
  assert.ok(socioIdsEnPrioridades.includes('laura'));
  assert.ok(!socioIdsEnPrioridades.includes('marta'));

  // Marta sigue existiendo — su especialista la cuenta, no desaparece del sistema.
  const martaCandidata = resultado.candidatasFinales.find(c => c.socioId === 'marta');
  assert.ok(martaCandidata);
  assert.equal(martaCandidata.especialista, 'RETENCION');

  // Cap por especialista: Ingresos aporta 2 tarjetas (Abrir sesión + Recuperar pagos), Retención 1 (Laura) — dentro del tope de 2.
  const porEspecialista = new Map<string, number>();
  for (const c of resultado.prioridadesHome) porEspecialista.set(c.especialista, (porEspecialista.get(c.especialista) ?? 0) + 1);
  assert.ok([...porEspecialista.values()].every(v => v <= 2));

  // El resumen ejecutivo cuadra con las 3 tarjetas visibles.
  assert.equal(resultado.resumenDiario.nDecisiones, 3);
  assert.equal(resultado.resumenDiario.saludo.includes('Marco'), true);
  assert.ok(resultado.resumenDiario.impactoTotal && resultado.resumenDiario.impactoTotal.valor > 0);

  // Estado general: hay ALTA con riesgo PERDIDA (Laura, Recuperar pagos) y ninguna CRITICA → ATENCION.
  assert.equal(resultado.resumenDiario.estadoGeneral, 'ATENCION');

  // Sin actividad nocturna en el snapshot → "mientras dormías" vacío, nunca relleno inventado.
  assert.equal(resultado.resumenDiario.mientrasDormias.length, 0);

  // Estadísticas de la sesión cuadran.
  assert.equal(resultado.estadisticas.nCandidatasGeneradas, 4);
  assert.equal(resultado.estadisticas.nRecomendacionesPersistidas, 4);
});

test('silencio: estudio sin ninguna señal → cero candidatas, estado EXCELENTE, saludo sin decisiones', () => {
  const snapshot: SnapshotEstudio = {
    studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
  const resultado = ejecutarAnalisis({
    snapshot, memoria: new Map(), pendientesActuales: [], resueltas90d: [],
    nombrePropietario: 'Marco', ventanaMientrasDormiasDesde: new Date(NOW.getTime() - 86400000), now: NOW,
  });
  assert.equal(resultado.candidatasFinales.length, 0);
  assert.equal(resultado.resumenDiario.estadoGeneral, 'EXCELENTE');
  assert.ok(resultado.resumenDiario.saludo.includes('no necesito nada'));
});

test('expiración: PENDIENTE vencida se marca VENCIDA; PENDIENTE resuelta sola se marca RESUELTA_SOLA', () => {
  const snapshot: SnapshotEstudio = {
    studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
  const pendientes = [
    { id: 'p1', studioId: 'e1', decisionSessionId: 'ds', algorithmVersion: '1.0.0', especialista: 'RETENCION' as const,
      tipo: 'RECUPERAR_SOCIA' as const, dedupeKey: 'vencida-key', titulo: 't', motivo: 'm', datosUsados: {}, riesgo: 'PERDIDA' as const,
      impacto: null, confianza: { nivel: 'ALTA' as const, evidencia: [], autonomiaMaxima: 2 as const }, score: 50, prioridad: 'ALTA' as const,
      nivelAutonomia: 1 as const, accion: { tipo: 'MARCAR_GESTIONADO' as const }, socioId: 'x', sesionId: null, reciboId: null,
      tiempoEstimadoMin: 2, estado: 'PENDIENTE' as const, vistaEn: null, expiraEn: diasAntes(1), creadoEn: diasAntes(15), resueltoEn: null, resueltoPor: null },
    { id: 'p2', studioId: 'e1', decisionSessionId: 'ds', algorithmVersion: '1.0.0', especialista: 'RETENCION' as const,
      tipo: 'RECUPERAR_SOCIA' as const, dedupeKey: 'ya-no-detectada', titulo: 't', motivo: 'm', datosUsados: {}, riesgo: 'PERDIDA' as const,
      impacto: null, confianza: { nivel: 'ALTA' as const, evidencia: [], autonomiaMaxima: 2 as const }, score: 50, prioridad: 'ALTA' as const,
      nivelAutonomia: 1 as const, accion: { tipo: 'MARCAR_GESTIONADO' as const }, socioId: 'y', sesionId: null, reciboId: null,
      tiempoEstimadoMin: 2, estado: 'PENDIENTE' as const, vistaEn: null, expiraEn: diasAntes(-10), creadoEn: diasAntes(2), resueltoEn: null, resueltoPor: null },
  ];
  const resultado = ejecutarAnalisis({
    snapshot, memoria: new Map(), pendientesActuales: pendientes, resueltas90d: [],
    nombrePropietario: 'Marco', ventanaMientrasDormiasDesde: new Date(NOW.getTime() - 86400000), now: NOW,
  });
  const motivos = new Map(resultado.expiraciones.map(e => [e.id, e.motivo]));
  assert.equal(motivos.get('p1'), 'VENCIDA');
  assert.equal(motivos.get('p2'), 'RESUELTA_SOLA');
});
