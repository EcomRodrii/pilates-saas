import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTiraSemana, calcularProgresoSemanal, META_PROGRESO_SEMANAL, saludoPorHora, huecosHoy } from './portal-home-logic.ts';
import type { Reserva, Sesion, PlanTarifa, Suscripcion } from './types.ts';

// Miércoles 2026-08-05, 10:00 — un día fijo a media semana para que "lunes de
// esta semana" (03-08) y "domingo" (09-08) sean deterministas en el test.
const AHORA = new Date(2026, 7, 5, 10, 0, 0);

function sesion(parcial: Partial<Sesion> & { id: string; inicio: string }): Sesion {
  return {
    studioId: 's1', tipoClaseId: 't1', salaId: 'sala1', instructorId: 'i1',
    fin: parcial.inicio, aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null,
    ...parcial,
  };
}
function reserva(parcial: Partial<Reserva> & { sesionId: string }): Reserva {
  return {
    id: `r-${parcial.sesionId}`, studioId: 's1', socioId: 'socio1', estado: 'CONFIRMADA',
    spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: AHORA.toISOString(),
    ...parcial,
  };
}

test('calcularTiraSemana: 7 días de lunes a domingo, con "hoy" marcado', () => {
  const dias = calcularTiraSemana(AHORA, [], []);
  assert.equal(dias.length, 7);
  assert.deepEqual(dias.map((d) => d.indiceSemana), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(dias[0].fecha.getDate(), 3); // lunes 3
  assert.equal(dias[6].fecha.getDate(), 9); // domingo 9
  const hoy = dias.filter((d) => d.esHoy);
  assert.equal(hoy.length, 1);
  assert.equal(hoy[0].fecha.getDate(), 5); // miércoles 5
});

test('calcularTiraSemana: domingo también cae dentro de "esta semana" (getDay()=0 es el caso especial)', () => {
  const domingo = new Date(2026, 7, 9, 9, 0, 0);
  const dias = calcularTiraSemana(domingo, [], []);
  assert.equal(dias[0].fecha.getDate(), 3); // el lunes sigue siendo el 3
  assert.ok(dias[6].esHoy);
});

test('calcularTiraSemana: marca el punto solo en el día con una reserva CONFIRMADA', () => {
  const s = sesion({ id: 's-jue', inicio: new Date(2026, 7, 6, 18, 0).toISOString() }); // jueves 6
  const dias = calcularTiraSemana(AHORA, [reserva({ sesionId: s.id })], [s]);
  const conPunto = dias.filter((d) => d.tieneClaseReservada);
  assert.equal(conPunto.length, 1);
  assert.equal(conPunto[0].fecha.getDate(), 6);
});

test('calcularTiraSemana: una reserva CANCELADA/LISTA_ESPERA no pinta punto', () => {
  const s = sesion({ id: 's-vie', inicio: new Date(2026, 7, 7, 18, 0).toISOString() });
  const dias = calcularTiraSemana(AHORA, [reserva({ sesionId: s.id, estado: 'CANCELADA' })], [s]);
  assert.equal(dias.filter((d) => d.tieneClaseReservada).length, 0);
});

test('calcularTiraSemana: una reserva de la semana ANTERIOR o SIGUIENTE no cuenta', () => {
  const semanaAntes = sesion({ id: 's-antes', inicio: new Date(2026, 6, 27, 18, 0).toISOString() });
  const semanaDespues = sesion({ id: 's-despues', inicio: new Date(2026, 7, 12, 18, 0).toISOString() });
  const dias = calcularTiraSemana(AHORA, [
    reserva({ sesionId: semanaAntes.id }),
    reserva({ sesionId: semanaDespues.id }),
  ], [semanaAntes, semanaDespues]);
  assert.equal(dias.filter((d) => d.tieneClaseReservada).length, 0);
});

test('calcularProgresoSemanal: cuenta reservas, no días (dos clases el mismo día suman 2)', () => {
  const s1 = sesion({ id: 's1', inicio: new Date(2026, 7, 4, 9, 0).toISOString() });
  const s2 = sesion({ id: 's2', inicio: new Date(2026, 7, 4, 18, 0).toISOString() }); // mismo día, otra hora
  const n = calcularProgresoSemanal(AHORA, [reserva({ sesionId: s1.id }), reserva({ sesionId: s2.id })], [s1, s2]);
  assert.equal(n, 2);
});

test('calcularProgresoSemanal: 0 sin reservas de esta semana', () => {
  assert.equal(calcularProgresoSemanal(AHORA, [], []), 0);
});

test('calcularProgresoSemanal: solo cuenta CONFIRMADA', () => {
  const s = sesion({ id: 's-pend', inicio: new Date(2026, 7, 4, 9, 0).toISOString() });
  const n = calcularProgresoSemanal(AHORA, [reserva({ sesionId: s.id, estado: 'LISTA_ESPERA' })], [s]);
  assert.equal(n, 0);
});

test('META_PROGRESO_SEMANAL: número de referencia positivo (no una meta configurable)', () => {
  assert.ok(META_PROGRESO_SEMANAL > 0);
});

test('saludoPorHora: los cortes de franja, que solo se ven en producción a deshora', () => {
  const a = (h: number) => saludoPorHora(new Date(2026, 7, 5, h, 30));
  assert.equal(a(0), 'Buenas noches');
  assert.equal(a(5), 'Buenas noches');
  assert.equal(a(6), 'Buenos días');
  assert.equal(a(12), 'Buenos días');
  assert.equal(a(13), 'Buenas tardes');
  assert.equal(a(20), 'Buenas tardes');
  assert.equal(a(21), 'Buenas noches');
  assert.equal(a(23), 'Buenas noches');
});

// ── huecosHoy ────────────────────────────────────────────────────────────

function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa {
  return { studioId: 's1', nombre: 'Mensual', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true, ...p };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return { id: `sus-${p.socioId}-${p.planId}`, studioId: 's1', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}

// Miércoles 2026-08-05, 20:00 en Madrid (CEST, UTC+2) = 18:00 UTC — a media
// tarde, lejos de cualquier medianoche, para que las pruebas de "no es hoy"
// no dependan sin querer del gotcha que la última prueba comprueba aparte.
const HOY_20H_MADRID = new Date(Date.UTC(2026, 7, 5, 18, 0, 0));

const entradaBase = {
  now: HOY_20H_MADRID, socioId: 'ana', reservas: [],
  suscripciones: [suscripcion({ socioId: 'ana', planId: 'pl1' })],
  planesTarifa: [plan({ id: 'pl1' })],
};

test('huecosHoy: sin socioId (staff en preview, sin sesión real) siempre vacío', () => {
  const futura = sesion({ id: 'f1', inicio: new Date(Date.UTC(2026, 7, 5, 19, 0, 0)).toISOString() });
  assert.deepEqual(huecosHoy({ ...entradaBase, socioId: null, sesiones: [futura] }), []);
});

test('huecosHoy: una clase de HOY con hueco y plan que cubre, aparece', () => {
  const futura = sesion({ id: 'f1', inicio: new Date(Date.UTC(2026, 7, 5, 19, 0, 0)).toISOString(), aforoMaximo: 10 });
  const r = huecosHoy({ ...entradaBase, sesiones: [futura] });
  assert.equal(r.length, 1);
  assert.equal(r[0].sesion.id, 'f1');
  assert.equal(r[0].libres, 10);
});

test('huecosHoy: llena de verdad (CONFIRMADA/ASISTIDA/NO_ASISTIO) no aparece', () => {
  const futura = sesion({ id: 'f1', inicio: new Date(Date.UTC(2026, 7, 5, 19, 0, 0)).toISOString(), aforoMaximo: 2 });
  const r = huecosHoy({
    ...entradaBase, sesiones: [futura],
    reservas: [
      reserva({ sesionId: 'f1', estado: 'CONFIRMADA' }),
      reserva({ sesionId: 'f1', estado: 'ASISTIDA' }),
    ],
  });
  assert.deepEqual(r, []);
});

test('huecosHoy: la lista de espera y lo pendiente de aprobación NO ocupan plaza', () => {
  const futura = sesion({ id: 'f1', inicio: new Date(Date.UTC(2026, 7, 5, 19, 0, 0)).toISOString(), aforoMaximo: 2 });
  const r = huecosHoy({
    ...entradaBase, sesiones: [futura],
    reservas: [
      reserva({ sesionId: 'f1', estado: 'LISTA_ESPERA' }),
      reserva({ sesionId: 'f1', estado: 'PENDIENTE_APROBACION' }),
    ],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].libres, 2);
});

test('huecosHoy: una clase de MAÑANA con hueco no cuenta como "de hoy"', () => {
  const manana = sesion({ id: 'm1', inicio: new Date(Date.UTC(2026, 7, 6, 19, 0, 0)).toISOString() });
  assert.deepEqual(huecosHoy({ ...entradaBase, sesiones: [manana] }), []);
});

test('huecosHoy: una clase de hoy que ya empezó no se ofrece', () => {
  const yaEmpezada = sesion({ id: 'p1', inicio: new Date(Date.UTC(2026, 7, 5, 17, 0, 0)).toISOString() }); // 19:00 Madrid, antes de las 20:00 de "ahora"
  assert.deepEqual(huecosHoy({ ...entradaBase, sesiones: [yaEmpezada] }), []);
});

test('huecosHoy: si su plan no cubre ese tipo de clase, no se ofrece (peor proponer lo que no puede reservar)', () => {
  const futura = sesion({ id: 'f1', tipoClaseId: 'mat', inicio: new Date(Date.UTC(2026, 7, 5, 19, 0, 0)).toISOString() });
  const r = huecosHoy({
    ...entradaBase, sesiones: [futura],
    planesTarifa: [plan({ id: 'pl1', tipo: 'BONO', sesiones: 8, tiposClaseIds: ['reformer'] })],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'pl1', sesionesRestantes: 5 })],
  });
  assert.deepEqual(r, []);
});

test('huecosHoy: ordena por hora de inicio, no por orden de llegada', () => {
  const tarde = sesion({ id: 'tarde', inicio: new Date(Date.UTC(2026, 7, 5, 20, 0, 0)).toISOString() });
  const pronto = sesion({ id: 'pronto', inicio: new Date(Date.UTC(2026, 7, 5, 18, 30, 0)).toISOString() });
  const r = huecosHoy({ ...entradaBase, sesiones: [tarde, pronto] });
  assert.deepEqual(r.map((h) => h.sesion.id), ['pronto', 'tarde']);
});

test('huecosHoy: una clase cancelada nunca se ofrece, aunque tenga hueco', () => {
  const cancelada = sesion({ id: 'c1', inicio: new Date(Date.UTC(2026, 7, 5, 19, 0, 0)).toISOString(), cancelada: true });
  assert.deepEqual(huecosHoy({ ...entradaBase, sesiones: [cancelada] }), []);
});

test('huecosHoy: ⚠️ una clase de las 23:30 en Madrid sigue siendo "hoy" aunque en UTC ya sea el día siguiente', () => {
  // 23:30 del 5 de agosto en Madrid (CEST, UTC+2) = 21:30 UTC del mismo 5 de
  // agosto — todavía no cruza medianoche UTC, así que esta prueba por sí sola
  // no distinguiría un cálculo en UTC de uno en local. La que sí lo hace es
  // la siguiente, con "ahora" ya pasada la medianoche UTC.
  const tardeNoche = sesion({ id: 'tn1', inicio: new Date(Date.UTC(2026, 7, 5, 21, 30, 0)).toISOString() });
  const r = huecosHoy({ ...entradaBase, sesiones: [tardeNoche] });
  assert.equal(r.length, 1);
});

test('huecosHoy: ⚠️ "ahora" a la 01:00 de Madrid (23:00 UTC del día anterior) sigue viendo el resto de HOY, no de "mañana"', () => {
  // 01:00 del 6 de agosto en Madrid = 23:00 UTC del 5 de agosto. Un cálculo
  // que comparara fechas en UTC leería "ahora" como día 5 y una clase de las
  // 10:00 del 6 de agosto (08:00 UTC) como si fuera "mañana" en vez de hoy
  // mismo para la socia — exactamente el gotcha que hoyEnEstudio existe para
  // evitar (documentado también en Decision OS, franjaLocalDe).
  const ahoraDeMadrugada = new Date(Date.UTC(2026, 7, 5, 23, 0, 0));
  const claseDeLaManana = sesion({ id: 'cm1', inicio: new Date(Date.UTC(2026, 7, 6, 8, 0, 0)).toISOString() });
  const r = huecosHoy({ ...entradaBase, now: ahoraDeMadrugada, sesiones: [claseDeLaManana] });
  assert.equal(r.length, 1);
  assert.equal(r[0].sesion.id, 'cm1');
});
