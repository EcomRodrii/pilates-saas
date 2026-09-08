// Tests de «Hoy en el estudio»: el conteo por clase, la señal (problema /
// atención / ok) y a quién ofrecer un hueco.
// Runner nativo de Node (sin dependencias): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Reserva, Sesion, Socio, Suscripcion } from '@/lib/types';
import {
  candidatasParaRellenar,
  claseEnCurso,
  construirAgendaDelDia,
  proximaClase,
  resumirClaseDelDia,
  resumirDia,
  type SesionAgenda,
} from './hoy-agenda.ts';

// ── Fixtures ─────────────────────────────────────────────────────────────────
let n = 0;
function res(p: Partial<Reserva> & Pick<Reserva, 'sesionId' | 'socioId' | 'estado'>): Reserva {
  return {
    id: `res-${++n}`,
    studioId: 'estudio-1',
    spotId: null,
    posicionEspera: null,
    ofertaExpiraEn: null,
    checkInEn: null,
    creadoEn: '2026-09-08T06:00:00.000Z',
    ...p,
  };
}
function ses(p: Partial<SesionAgenda> & Pick<SesionAgenda, 'id' | 'inicio' | 'fin'>): SesionAgenda {
  return {
    tipoClaseId: 'tipo-1', salaId: 'sala-1', instructorId: 'inst-1',
    aforoMaximo: 10, cancelada: false, incidenciaTexto: null, sustitucionAbierta: false,
    ...p,
  };
}
const AHORA = new Date('2026-09-08T09:40:00.000Z');
const A_LAS_10 = ses({ id: 's10', inicio: '2026-09-08T10:00:00.000Z', fin: '2026-09-08T11:00:00.000Z' });

// ── Conteo ───────────────────────────────────────────────────────────────────

test('la clase del ejemplo: 9 apuntadas de 10, 1 hueco, todas confirmadas', () => {
  const reservas = Array.from({ length: 9 }, (_, i) =>
    res({ sesionId: 's10', socioId: `soc-${i}`, estado: 'CONFIRMADA' }));
  const c = resumirClaseDelDia(A_LAS_10, reservas, AHORA);
  assert.equal(c.ocupadas, 9);
  assert.equal(c.confirmadas, 9);
  assert.equal(c.pendientes, 0);
  assert.equal(c.huecos, 1);
  assert.equal(c.senal, 'ATENCION'); // hay un hueco que se puede llenar
  assert.equal(c.motivos[0].clave, 'huecos');
});

test('una clase llena y sin nada pendiente se lee tranquila', () => {
  const reservas = Array.from({ length: 10 }, (_, i) =>
    res({ sesionId: 's10', socioId: `soc-${i}`, estado: 'CONFIRMADA' }));
  const c = resumirClaseDelDia(A_LAS_10, reservas, AHORA);
  assert.equal(c.huecos, 0);
  assert.equal(c.senal, 'OK');
  assert.equal(c.motivos[0].clave, 'completa');
});

// El bug que esto evita: dar por «pendiente» a quien nunca recibió la
// pregunta. `pedir_confirmacion_riesgo` está apagado por defecto, así que en
// la inmensa mayoría de estudios una reserva CONFIRMADA es todo lo que se
// sabe — y es una confirmación, no una duda.
test('CONFIRMADA sin petición de confirmar NO cuenta como pendiente', () => {
  const c = resumirClaseDelDia(A_LAS_10, [
    res({ sesionId: 's10', socioId: 'a', estado: 'CONFIRMADA' }),
  ], AHORA);
  assert.equal(c.confirmadas, 1);
  assert.equal(c.pendientes, 0);
});

test('a quien se le pidió confirmar y no ha contestado, sí', () => {
  const c = resumirClaseDelDia(A_LAS_10, [
    res({ sesionId: 's10', socioId: 'a', estado: 'CONFIRMADA', confirmacionPedidaEn: '2026-09-08T08:00:00.000Z' }),
    res({ sesionId: 's10', socioId: 'b', estado: 'CONFIRMADA', confirmacionPedidaEn: '2026-09-08T08:00:00.000Z', confirmadoEn: '2026-09-08T08:30:00.000Z' }),
  ], AHORA);
  assert.equal(c.pendientes, 1);
  assert.equal(c.confirmadas, 1);
  assert.equal(c.ocupadas, 2, 'las dos siguen ocupando plaza');
  assert.equal(c.motivos[0].clave, 'pendientes');
});

test('PENDIENTE_APROBACION no ocupa plaza pero sí pide una decisión', () => {
  const c = resumirClaseDelDia(A_LAS_10, [
    res({ sesionId: 's10', socioId: 'a', estado: 'PENDIENTE_APROBACION' }),
  ], AHORA);
  assert.equal(c.ocupadas, 0);
  assert.equal(c.pendientes, 1);
  assert.equal(c.huecos, 10);
  assert.match(c.motivos[0].texto, /aprobar/);
});

test('LISTA_ESPERA no ocupa aforo; con hueco libre la clase pasa a problema', () => {
  const reservas = [
    ...Array.from({ length: 9 }, (_, i) => res({ sesionId: 's10', socioId: `soc-${i}`, estado: 'CONFIRMADA' as const })),
    res({ sesionId: 's10', socioId: 'espera-1', estado: 'LISTA_ESPERA', posicionEspera: 1 }),
  ];
  const c = resumirClaseDelDia(A_LAS_10, reservas, AHORA);
  assert.equal(c.ocupadas, 9);
  assert.equal(c.enEspera, 1);
  assert.equal(c.huecos, 1);
  assert.equal(c.senal, 'PROBLEMA', 'alguien espera un sitio que está libre');
  assert.equal(c.accion, 'OFRECER');
});

// Una clase LLENA con lista de espera es un estado SANO — lo dice
// `pideDecision` y esta pantalla no puede contradecirlo.
test('clase llena con lista de espera no pide nada', () => {
  const reservas = [
    ...Array.from({ length: 10 }, (_, i) => res({ sesionId: 's10', socioId: `soc-${i}`, estado: 'CONFIRMADA' as const })),
    res({ sesionId: 's10', socioId: 'espera-1', estado: 'LISTA_ESPERA', posicionEspera: 1 }),
  ];
  const c = resumirClaseDelDia(A_LAS_10, reservas, AHORA);
  assert.equal(c.senal, 'OK');
  assert.equal(c.accion, null);
});

test('una oferta de plaza viva no se cuenta como si nadie hubiera contestado', () => {
  const reservas = [
    ...Array.from({ length: 9 }, (_, i) => res({ sesionId: 's10', socioId: `soc-${i}`, estado: 'CONFIRMADA' as const })),
    res({ sesionId: 's10', socioId: 'e1', estado: 'LISTA_ESPERA', posicionEspera: 1, ofertaExpiraEn: '2026-09-08T09:55:00.000Z' }),
  ];
  const c = resumirClaseDelDia(A_LAS_10, reservas, AHORA);
  assert.equal(c.ofertasVivas, 1);
  assert.equal(c.motivos.some(m => m.clave === 'espera-con-hueco'), false, 'ya se le ofreció: no vuelve a salir como problema');
  assert.equal(c.motivos[0].clave, 'oferta-viva');
});

test('una oferta ya caducada deja de contar como viva', () => {
  const c = resumirClaseDelDia(A_LAS_10, [
    res({ sesionId: 's10', socioId: 'e1', estado: 'LISTA_ESPERA', posicionEspera: 1, ofertaExpiraEn: '2026-09-08T09:00:00.000Z' }),
  ], AHORA);
  assert.equal(c.ofertasVivas, 0);
});

test('sin instructora es el problema más grave, y manda sobre el resto', () => {
  const c = resumirClaseDelDia({ ...A_LAS_10, sustitucionAbierta: true, incidenciaTexto: 'Aire roto' }, [], AHORA);
  assert.equal(c.estado, 'SIN_INSTRUCTORA');
  assert.equal(c.senal, 'PROBLEMA');
  assert.equal(c.motivos[0].clave, 'sin-instructora');
  assert.equal(c.accion, 'CUBRIR');
});

// Regresión del bug que ya documenta `pideDecision`: nadie puede cubrir una
// clase de hace tres horas. Se sigue viendo, pero deja de gritar.
test('una clase que YA pasó sin instructora no sigue pidiendo cubrirla', () => {
  const pasada = ses({ id: 'sp', inicio: '2026-09-08T07:00:00.000Z', fin: '2026-09-08T08:00:00.000Z', sustitucionAbierta: true });
  const c = resumirClaseDelDia(pasada, [], AHORA);
  assert.equal(c.estado, 'SIN_INSTRUCTORA');
  assert.equal(c.accion, null);
  assert.equal(c.senal, 'ATENCION');
  assert.match(c.motivos[0].texto, /Pasó sin instructora/);
});

test('clase terminada con gente sin check-in pide pasar lista', () => {
  const pasada = ses({ id: 'sp', inicio: '2026-09-08T07:00:00.000Z', fin: '2026-09-08T08:00:00.000Z' });
  const c = resumirClaseDelDia(pasada, [
    res({ sesionId: 'sp', socioId: 'a', estado: 'CONFIRMADA' }),
    res({ sesionId: 'sp', socioId: 'b', estado: 'ASISTIDA', checkInEn: '2026-09-08T07:02:00.000Z' }),
  ], AHORA);
  assert.equal(c.estado, 'SIN_PASAR_LISTA');
  assert.equal(c.accion, 'PASAR_LISTA');
  assert.equal(c.sinPasarLista, 1);
  assert.equal(c.senal, 'PROBLEMA');
});

test('una clase terminada y con lista pasada no aparece con huecos que llenar', () => {
  const pasada = ses({ id: 'sp', inicio: '2026-09-08T07:00:00.000Z', fin: '2026-09-08T08:00:00.000Z' });
  const c = resumirClaseDelDia(pasada, [
    res({ sesionId: 'sp', socioId: 'a', estado: 'ASISTIDA', checkInEn: '2026-09-08T07:02:00.000Z' }),
  ], AHORA);
  assert.equal(c.estado, 'FINALIZADA');
  assert.equal(c.huecos, 9, 'el hueco existe…');
  assert.equal(c.motivos.some(m => m.clave === 'huecos'), false, '…pero ya no se puede llenar');
  assert.equal(c.senal, 'OK');
});

test('sobreaforo es un problema aunque la clase esté tranquila por lo demás', () => {
  const reservas = Array.from({ length: 12 }, (_, i) =>
    res({ sesionId: 's10', socioId: `soc-${i}`, estado: 'CONFIRMADA' as const }));
  const c = resumirClaseDelDia(A_LAS_10, reservas, AHORA);
  assert.equal(c.sobreaforo, 2);
  assert.equal(c.senal, 'PROBLEMA');
  assert.equal(c.accion, 'AJUSTAR_AFORO');
});

test('una clase cancelada no pide nada y no se lee como alarma', () => {
  const c = resumirClaseDelDia({ ...A_LAS_10, cancelada: true }, [
    res({ sesionId: 's10', socioId: 'a', estado: 'CANCELADA' }),
  ], AHORA);
  assert.equal(c.estado, 'CANCELADA');
  assert.equal(c.senal, 'OK');
  assert.equal(c.accion, null);
});

// El ejemplo que puso el encargo: «14:00 — Laura · 5 confirmadas · 2
// pendientes · 1 cancelación reciente · 3 huecos». La cancelación se ve, pero
// no dispara la alarma: lo que pide acción es el hueco que ha dejado.
test('una cancelación de una clase que aún no ha pasado se ve, sin gritar', () => {
  const c = resumirClaseDelDia(A_LAS_10, [
    ...Array.from({ length: 5 }, (_, i) => res({ sesionId: 's10', socioId: `s${i}`, estado: 'CONFIRMADA' as const })),
    res({ sesionId: 's10', socioId: 'baja', estado: 'CANCELADA' }),
  ], AHORA);
  assert.equal(c.canceladas, 1);
  assert.equal(c.ocupadas, 5);
  assert.equal(c.huecos, 5);
  const cancel = c.motivos.find(m => m.clave === 'canceladas');
  assert.equal(cancel?.texto, '1 cancelación');
  assert.equal(cancel?.tono, 'OK');
  assert.equal(c.senal, 'ATENCION', 'lo que pide atención es el hueco, no la baja');
});

test('las cancelaciones de una clase ya pasada no se sacan como si hubiera algo que hacer', () => {
  const pasada = ses({ id: 'sp', inicio: '2026-09-08T07:00:00.000Z', fin: '2026-09-08T08:00:00.000Z' });
  const c = resumirClaseDelDia(pasada, [
    res({ sesionId: 'sp', socioId: 'a', estado: 'ASISTIDA', checkInEn: '2026-09-08T07:02:00.000Z' }),
    res({ sesionId: 'sp', socioId: 'b', estado: 'CANCELADA' }),
  ], AHORA);
  assert.equal(c.motivos.some(m => m.clave === 'canceladas'), false);
});

test('NO_ASISTIO cuenta como «no vino», no como confirmada', () => {
  const pasada = ses({ id: 'sp', inicio: '2026-09-08T07:00:00.000Z', fin: '2026-09-08T08:00:00.000Z' });
  const c = resumirClaseDelDia(pasada, [
    res({ sesionId: 'sp', socioId: 'a', estado: 'NO_ASISTIO' }),
    res({ sesionId: 'sp', socioId: 'b', estado: 'ASISTIDA', checkInEn: '2026-09-08T07:02:00.000Z' }),
  ], AHORA);
  assert.equal(c.noAsistio, 1);
  assert.equal(c.canceladas, 1);
  assert.equal(c.confirmadas, 1);
  assert.equal(c.ocupadas, 1);
});

// ── Día completo ─────────────────────────────────────────────────────────────

test('la agenda sale en orden cronológico y reparte las reservas por clase', () => {
  const clases = construirAgendaDelDia({
    sesiones: [
      ses({ id: 'b', inicio: '2026-09-08T12:00:00.000Z', fin: '2026-09-08T13:00:00.000Z' }),
      ses({ id: 'a', inicio: '2026-09-08T10:00:00.000Z', fin: '2026-09-08T11:00:00.000Z' }),
    ],
    reservas: [
      res({ sesionId: 'a', socioId: 's1', estado: 'CONFIRMADA' }),
      res({ sesionId: 'b', socioId: 's1', estado: 'CONFIRMADA' }),
      res({ sesionId: 'b', socioId: 's2', estado: 'CONFIRMADA' }),
    ],
    ahora: AHORA,
  });
  assert.deepEqual(clases.map(c => c.sesionId), ['a', 'b']);
  assert.deepEqual(clases.map(c => c.ocupadas), [1, 2]);
});

test('el resumen del día no cuenta las canceladas ni los huecos de lo ya pasado', () => {
  const clases = construirAgendaDelDia({
    sesiones: [
      ses({ id: 'pasada', inicio: '2026-09-08T07:00:00.000Z', fin: '2026-09-08T08:00:00.000Z' }),
      ses({ id: 'futura', inicio: '2026-09-08T18:00:00.000Z', fin: '2026-09-08T19:00:00.000Z' }),
      ses({ id: 'anulada', inicio: '2026-09-08T20:00:00.000Z', fin: '2026-09-08T21:00:00.000Z', cancelada: true }),
    ],
    reservas: [
      res({ sesionId: 'pasada', socioId: 'a', estado: 'ASISTIDA', checkInEn: '2026-09-08T07:01:00.000Z' }),
      res({ sesionId: 'futura', socioId: 'a', estado: 'CONFIRMADA' }),
      res({ sesionId: 'futura', socioId: 'b', estado: 'CONFIRMADA' }),
    ],
    ahora: AHORA,
  });
  const r = resumirDia(clases);
  assert.equal(r.clases, 2);
  assert.equal(r.canceladas, 1);
  assert.equal(r.alumnas, 3);
  assert.equal(r.huecos, 8, 'solo los de la clase que aún no ha pasado');
  assert.equal(r.problemas, 0);
});

test('«ahora» y «la siguiente» salen de la agenda, no de otro reloj', () => {
  const clases = construirAgendaDelDia({
    sesiones: [
      ses({ id: 'ahora', inicio: '2026-09-08T09:15:00.000Z', fin: '2026-09-08T10:10:00.000Z' }),
      ses({ id: 'luego', inicio: '2026-09-08T10:30:00.000Z', fin: '2026-09-08T11:25:00.000Z' }),
    ],
    reservas: [],
    ahora: AHORA,
  });
  assert.equal(claseEnCurso(clases)?.sesionId, 'ahora');
  assert.equal(proximaClase(clases, AHORA)?.sesionId, 'luego');
});

test('sin clases el resumen es cero y no hay ni «ahora» ni «siguiente»', () => {
  const clases = construirAgendaDelDia({ sesiones: [], reservas: [], ahora: AHORA });
  assert.deepEqual(resumirDia(clases), { clases: 0, alumnas: 0, huecos: 0, pendientes: 0, problemas: 0, canceladas: 0 });
  assert.equal(claseEnCurso(clases), null);
  assert.equal(proximaClase(clases, AHORA), null);
});

// ── Rellenar hueco ───────────────────────────────────────────────────────────

function socia(id: string): Socio {
  return {
    id, studioId: 'estudio-1', nombre: `Socia ${id}`, apellidos: 'Test', email: `${id}@x.es`,
    telefono: null, nif: null, fechaAlta: '2026-01-01', activo: true,
  };
}
function sesionCompleta(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio' | 'fin'>): Sesion {
  return {
    studioId: 'estudio-1', tipoClaseId: 'tipo-1', salaId: 'sala-1', instructorId: 'inst-1',
    aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null, ...p,
  };
}
const PLAN: PlanTarifa = {
  id: 'plan-1', studioId: 'estudio-1', nombre: 'Bono 10', precio: 100, tipo: 'BONO',
  sesionesIncluidas: 10, validezDias: null, activo: true,
} as PlanTarifa;
function sus(socioId: string): Suscripcion {
  return {
    id: `sus-${socioId}`, studioId: 'estudio-1', socioId, planId: 'plan-1', estado: 'ACTIVA',
    fechaInicio: '2026-01-01', fechaFin: null, sesionesRestantes: 5, stripeSubscriptionId: null,
  } as Suscripcion;
}

test('quien está en lista de espera va primero, y con su motivo', () => {
  // Martes 8-sep-2026 a las 18:00 (hora del estudio); los martes anteriores a
  // la misma hora vino «habitual».
  const hoy = sesionCompleta({ id: 'hoy', inicio: '2026-09-08T16:00:00.000Z', fin: '2026-09-08T17:00:00.000Z' });
  const martesPasado = sesionCompleta({ id: 'ant1', inicio: '2026-09-01T16:00:00.000Z', fin: '2026-09-01T17:00:00.000Z' });
  const otroMartes = sesionCompleta({ id: 'ant2', inicio: '2026-08-25T16:00:00.000Z', fin: '2026-08-25T17:00:00.000Z' });
  const sueltaDeManana = sesionCompleta({ id: 'ant3', inicio: '2026-09-01T07:00:00.000Z', fin: '2026-09-01T08:00:00.000Z' });

  const socios = [socia('espera'), socia('habitual'), socia('esporadica')];
  const reservas: Reserva[] = [
    res({ sesionId: 'hoy', socioId: 'espera', estado: 'LISTA_ESPERA', posicionEspera: 1 }),
    res({ sesionId: 'ant1', socioId: 'habitual', estado: 'ASISTIDA' }),
    res({ sesionId: 'ant2', socioId: 'habitual', estado: 'ASISTIDA' }),
    res({ sesionId: 'ant3', socioId: 'esporadica', estado: 'ASISTIDA' }),
  ];

  const out = candidatasParaRellenar({
    sesion: hoy,
    sesiones: [hoy, martesPasado, otroMartes, sueltaDeManana],
    socios,
    reservas,
    suscripciones: [sus('espera'), sus('habitual'), sus('esporadica')],
    planesTarifa: [PLAN],
    hoyISO: '2026-09-08',
    ahora: new Date('2026-09-08T09:40:00.000Z'),
  });

  assert.deepEqual(out.map(c => c.socioId), ['espera', 'habitual', 'esporadica']);
  assert.deepEqual(out[0].motivos, ['LISTA_ESPERA']);
  assert.equal(out[0].posicionEspera, 1);
  assert.equal(out[1].motivos[0], 'SUELE_VENIR');
  assert.equal(out[2].motivos[0], 'YA_VINO_A_ESTA_CLASE');
});

test('no se propone a quien no puede reservar esta clase', () => {
  const hoy = sesionCompleta({ id: 'hoy', inicio: '2026-09-08T16:00:00.000Z', fin: '2026-09-08T17:00:00.000Z' });
  const antes = sesionCompleta({ id: 'ant', inicio: '2026-09-01T16:00:00.000Z', fin: '2026-09-01T17:00:00.000Z' });
  const out = candidatasParaRellenar({
    sesion: hoy,
    sesiones: [hoy, antes],
    socios: [socia('sin-bono')],
    reservas: [res({ sesionId: 'ant', socioId: 'sin-bono', estado: 'ASISTIDA' })],
    suscripciones: [], // sin plan activo
    planesTarifa: [PLAN],
    hoyISO: '2026-09-08',
    ahora: new Date('2026-09-08T09:40:00.000Z'),
  });
  assert.deepEqual(out, []);
});

test('quien ya tiene plaza en esta clase no se propone otra vez', () => {
  const hoy = sesionCompleta({ id: 'hoy', inicio: '2026-09-08T16:00:00.000Z', fin: '2026-09-08T17:00:00.000Z' });
  const antes = sesionCompleta({ id: 'ant', inicio: '2026-09-01T16:00:00.000Z', fin: '2026-09-01T17:00:00.000Z' });
  const out = candidatasParaRellenar({
    sesion: hoy,
    sesiones: [hoy, antes],
    socios: [socia('ya-viene')],
    reservas: [
      res({ sesionId: 'ant', socioId: 'ya-viene', estado: 'ASISTIDA' }),
      res({ sesionId: 'hoy', socioId: 'ya-viene', estado: 'CONFIRMADA' }),
    ],
    suscripciones: [sus('ya-viene')],
    planesTarifa: [PLAN],
    hoyISO: '2026-09-08',
    ahora: new Date('2026-09-08T09:40:00.000Z'),
  });
  assert.deepEqual(out, []);
});
