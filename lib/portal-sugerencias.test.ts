import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Reserva, Sesion, TipoClase, Suscripcion, PlanTarifa } from '@/lib/types';
import { sugerirClase, alternativasTras, cuandoSugerencia, type EntradaSugerencia } from './portal-sugerencias.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z'); // sábado
const MS_DIA = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

let n = 0;
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 'reformer', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado' | 'sesionId'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: iso(NOW.getTime() - MS_DIA), ...p };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Mensual', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true, ...p };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return { id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}
function tipoClase(id: string, nombre: string, color: string): TipoClase {
  return {
    id, studioId: 'e1', nombre, color, duracionMinutos: 50, descripcion: null,
    nivel: 'TODOS', fotoUrl: null, ventanaCancelacionHoras: null,
  } as TipoClase;
}
const TIPOS: TipoClase[] = [tipoClase('reformer', 'Reformer', '#000'), tipoClase('mat', 'Mat', '#111')];

function entrada(over: Partial<EntradaSugerencia> = {}): EntradaSugerencia {
  return {
    now: NOW, socioId: 'ana', misReservas: [], reservas: [], sesiones: [],
    tiposClase: TIPOS,
    planesTarifa: [plan({ id: 'pl1' })],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'pl1' })],
    ...over,
  };
}

/** Martes a las 20:00 de Madrid = 18:00 UTC en verano. `0` = el martes 14/07,
 *  que está a 3 días de NOW; valores positivos van hacia atrás. */
const martes20h = (semanas: number) => iso(Date.UTC(2026, 6, 14, 18, 0) - semanas * 7 * MS_DIA);
/** Domingo a las 09:00 de Madrid = 07:00 UTC. */
const domingo9h = (semanas: number) => iso(Date.UTC(2026, 6, 12, 7, 0) - semanas * 7 * MS_DIA);

/** Su costumbre: 4 martes a las 20:00 de Reformer. */
function historialMartes(): { sesiones: Sesion[]; misReservas: Reserva[] } {
  const ses = [1, 2, 3, 4].map(k => sesion({ id: `h${k}`, inicio: martes20h(k) }));
  return {
    sesiones: ses,
    misReservas: ses.map(s => reserva({ socioId: 'ana', estado: 'ASISTIDA', sesionId: s.id })),
  };
}

// ── Cuándo NO se propone nada ───────────────────────────────────────────────

test('sin ninguna clase futura → null', () => {
  assert.equal(sugerirClase(entrada()), null);
});

test('sin plan que cubra la clase → null (proponerle algo que no puede reservar es peor que nada)', () => {
  const s = sugerirClase(entrada({
    sesiones: [sesion({ id: 'f1', inicio: martes20h(0) })],
    suscripciones: [],
    planesTarifa: [],
  }));
  assert.equal(s, null);
});

test('todas las clases futuras llenas → null', () => {
  const futura = sesion({ id: 'f1', inicio: martes20h(0), aforoMaximo: 2 });
  const s = sugerirClase(entrada({
    sesiones: [futura],
    reservas: [
      reserva({ socioId: 'x', estado: 'CONFIRMADA', sesionId: 'f1' }),
      reserva({ socioId: 'y', estado: 'CONFIRMADA', sesionId: 'f1' }),
    ],
  }));
  assert.equal(s, null);
});

test('la lista de espera NO ocupa asiento: si solo hay esperando, sigue habiendo hueco', () => {
  const futura = sesion({ id: 'f1', inicio: martes20h(0), aforoMaximo: 2 });
  const s = sugerirClase(entrada({
    sesiones: [futura],
    reservas: [
      reserva({ socioId: 'x', estado: 'CONFIRMADA', sesionId: 'f1' }),
      reserva({ socioId: 'y', estado: 'LISTA_ESPERA', sesionId: 'f1' }),
    ],
  }));
  assert.ok(s);
  assert.equal(s.plazasLibres, 1);
});

test('una clase en la que ya tiene sitio no se le vuelve a ofrecer', () => {
  const futura = sesion({ id: 'f1', inicio: martes20h(0) });
  const s = sugerirClase(entrada({
    sesiones: [futura],
    misReservas: [reserva({ socioId: 'ana', estado: 'CONFIRMADA', sesionId: 'f1' })],
  }));
  assert.equal(s, null);
});

// ── La costumbre manda ──────────────────────────────────────────────────────

test('elige el martes a su hora antes que el domingo por la mañana', () => {
  const h = historialMartes();
  const elMartes = sesion({ id: 'fut-martes', inicio: martes20h(0) });
  const elDomingo = sesion({ id: 'fut-domingo', inicio: domingo9h(0) });
  const s = sugerirClase(entrada({
    ...h,
    // El domingo va PRIMERO en la lista y es ANTES en el tiempo: si ganara,
    // sería por orden de llegada y no por afinidad.
    sesiones: [...h.sesiones, elDomingo, elMartes],
  }));
  assert.ok(s);
  assert.equal(s.sesion.id, 'fut-martes');
  assert.equal(s.porCostumbre, true);
  assert.equal(s.motivo, 'sueles entrenar los martes por la noche');
});

test('el motivo nunca va vacío', () => {
  const h = historialMartes();
  const s = sugerirClase(entrada({ ...h, sesiones: [...h.sesiones, sesion({ id: 'f', inicio: martes20h(0) })] }));
  assert.ok(s);
  assert.ok(s.motivo.length > 0);
});

test('con menos de 3 asistencias no se inventa una costumbre: se dice que es la próxima con hueco', () => {
  const ses = [1, 2].map(k => sesion({ id: `h${k}`, inicio: martes20h(k) }));
  const futura = sesion({ id: 'f1', inicio: domingo9h(0) });
  const s = sugerirClase(entrada({
    sesiones: [...ses, futura],
    misReservas: ses.map(x => reserva({ socioId: 'ana', estado: 'ASISTIDA', sesionId: x.id })),
  }));
  assert.ok(s);
  assert.equal(s.porCostumbre, false);
  assert.equal(s.motivo, 'es la próxima con hueco que te cubre tu plan');
});

test('socia nueva sin historial: se le ofrece la más próxima que su plan cubre', () => {
  const pronto = sesion({ id: 'pronto', inicio: iso(NOW.getTime() + 2 * MS_DIA) });
  const tarde = sesion({ id: 'tarde', inicio: iso(NOW.getTime() + 5 * MS_DIA) });
  const s = sugerirClase(entrada({ sesiones: [tarde, pronto] }));
  assert.ok(s);
  assert.equal(s.sesion.id, 'pronto');
  assert.equal(s.porCostumbre, false);
});

test('la costumbre se calcula en hora del estudio: una clase de las 00:30 del martes es martes', () => {
  // 2026-07-14 00:30 Madrid = 2026-07-13 22:30 UTC (lunes en UTC).
  const ses = [0, 1, 2, 3].map(k => sesion({ id: `h${k}`, inicio: iso(Date.UTC(2026, 6, 13, 22, 30) - (k + 1) * 7 * MS_DIA) }));
  const futuroMartes = sesion({ id: 'fut', inicio: iso(Date.UTC(2026, 6, 13, 22, 30) + 7 * MS_DIA) });
  const s = sugerirClase(entrada({
    sesiones: [...ses, futuroMartes],
    misReservas: ses.map(x => reserva({ socioId: 'ana', estado: 'ASISTIDA', sesionId: x.id })),
  }));
  assert.ok(s);
  assert.match(s.motivo, /los martes/);
});

test('no se propone nada más allá de la ventana de 10 días', () => {
  const lejos = sesion({ id: 'lejos', inicio: iso(NOW.getTime() + 20 * MS_DIA) });
  assert.equal(sugerirClase(entrada({ sesiones: [lejos] })), null);
});

// ── Alternativas tras cancelar ──────────────────────────────────────────────

test('alternativasTras: devuelve hasta 3 y prioriza el mismo tipo de clase', () => {
  const cancelada = sesion({ id: 'cancelada', inicio: martes20h(0), tipoClaseId: 'reformer' });
  const otras = [
    sesion({ id: 'mat-1', inicio: iso(NOW.getTime() + 1 * MS_DIA), tipoClaseId: 'mat' }),
    sesion({ id: 'ref-1', inicio: iso(NOW.getTime() + 2 * MS_DIA), tipoClaseId: 'reformer' }),
    sesion({ id: 'ref-2', inicio: iso(NOW.getTime() + 3 * MS_DIA), tipoClaseId: 'reformer' }),
  ];
  const alts = alternativasTras(cancelada, entrada({ sesiones: [cancelada, ...otras] }));
  assert.equal(alts.length, 3);
  // Los dos Reformer primero, aunque el Mat fuera antes en el tiempo.
  assert.deepEqual(alts.slice(0, 2).map(a => a.sesion.tipoClaseId), ['reformer', 'reformer']);
});

test('alternativasTras: nunca propone la que acaba de cancelar', () => {
  const cancelada = sesion({ id: 'cancelada', inicio: iso(NOW.getTime() + MS_DIA) });
  const alts = alternativasTras(cancelada, entrada({ sesiones: [cancelada] }));
  assert.equal(alts.length, 0);
});

test('alternativasTras: sin alternativas posibles devuelve lista vacía, no null', () => {
  const cancelada = sesion({ id: 'cancelada', inicio: iso(NOW.getTime() + MS_DIA) });
  const alts = alternativasTras(cancelada, entrada({ sesiones: [cancelada], suscripciones: [], planesTarifa: [] }));
  assert.deepEqual(alts, []);
});

// ── cuandoSugerencia ────────────────────────────────────────────────────────

test('cuandoSugerencia: hoy / mañana / el día de la semana, en hora del estudio', () => {
  // NOW es 2026-07-11 12:00 UTC = 14:00 en Madrid.
  assert.equal(cuandoSugerencia(iso(Date.UTC(2026, 6, 11, 17, 0)), NOW), 'hoy a las 19:00');
  assert.equal(cuandoSugerencia(iso(Date.UTC(2026, 6, 12, 7, 0)), NOW), 'mañana a las 09:00');
  assert.equal(cuandoSugerencia(iso(Date.UTC(2026, 6, 14, 18, 0)), NOW), 'el martes a las 20:00');
});

test('cuandoSugerencia: el corte es por DÍA NATURAL, no por horas de diferencia', () => {
  // Faltan menos de 11 h pero ya es otro día natural → "mañana", no "hoy".
  assert.equal(cuandoSugerencia(iso(Date.UTC(2026, 6, 11, 22, 30)), NOW), 'mañana a las 00:30');
  // Faltan más de 8 h y sigue siendo hoy.
  assert.equal(cuandoSugerencia(iso(Date.UTC(2026, 6, 11, 20, 30)), NOW), 'hoy a las 22:30');
});
