// Una cuota trimestral o anual vale POR MES su precio entre los meses del
// ciclo (`periodicidadMeses`). Antes, el margen por clase de Informes, el valor
// mensual de una socia, el precio medio de la sesión y el impacto real de una
// renovación tomaban `precio` como si fuera de un mes: una trimestral contaba
// ×3 y una anual ×12. Hoy (13-oct-2026) todas las cuotas son mensuales, así
// que lo que fijan estos tests es que ningún estudio llegue a verlo.
//
// La prueba de fondo es de EQUIVALENCIA: el mismo estudio con su cuota cobrada
// al mes, al trimestre o al año (al mismo precio por mes) tiene que dar al
// Centro de Control exactamente las mismas tarjetas, con las mismas cifras y
// la misma confianza. Si un umbral de un especialista dependiera de cómo se
// cobra la cuota, aquí saltaría.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Sesion, Sala, Suscripcion, PlanTarifa, Instructor } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio, SustitucionSnapshot, Candidata } from './tipos.ts';
import { construirIndices, precioMedioSesion, valorMensual } from './senales.ts';
import { margenSesion } from './margen-clase.ts';
import { precioMensualDePlanRenovado } from './outcomes.ts';
import { ESPECIALISTAS } from './especialistas/contrato.ts';
import { ingresos } from './especialistas/ingresos.ts';
import { ejecutarAnalisis } from './motor.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const MS_DIA = 86400000;
const diasAntes = (d: number) => new Date(NOW.getTime() - d * MS_DIA).toISOString();
const horasAntes = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: `Socia ${p.id}`, apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado' | 'sesionId'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: diasAntes(1), ...p };
}
function asistencias(socioId: string, cadaDias: number, cuantas: number, offsetDias: number): Reserva[] {
  return Array.from({ length: cuantas }, (_, i) => reserva({ socioId, estado: 'ASISTIDA', sesionId: 'historica', creadoEn: diasAntes(offsetDias + i * cadaDias) }));
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
  return { studioId: 'e1', nombre: 'Cuota', descripcion: null, precio: 90, tipo: 'MENSUAL', sesiones: null, activo: true, periodicidadMeses: 1, ...p };
}
function instructor(id: string, p: Partial<Instructor> = {}): Instructor {
  return { id, studioId: 'e1', nombre: `Ins ${id}`, email: null, telefono: null, color: '#000', activo: true, rol: 'INSTRUCTOR', authUserId: null, ...p };
}
function sustitucion(p: Partial<SustitucionSnapshot> & Pick<SustitucionSnapshot, 'sesionId'>): SustitucionSnapshot {
  return { id: `sub-${++n}`, studioId: 'e1', instructorOriginalId: null, estado: 'contactando', creadoEn: diasAntes(1), ...p };
}
function snapshot(over: Partial<SnapshotEstudio>): SnapshotEstudio {
  return {
    studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [], sustituciones: [], instructorTarifas: [], intentosFallidos: [], bloqueosAgenda: [], widgetEventosCheckout: [], contactosManuales: [], contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
    ...over,
  };
}
const memoriaVacia = (): MemoriaEstudio => new Map();

/** El mismo estudio con sus cuotas cobradas cada `meses` meses, al MISMO
 *  precio por mes. Copia: un snapshot no se muta nunca (`construirIndices`
 *  cachea por identidad). */
function cobradoCada(meses: number, s: SnapshotEstudio): SnapshotEstudio {
  return {
    ...s,
    planesTarifa: s.planesTarifa.map(p => p.tipo === 'MENSUAL' ? { ...p, precio: p.precio * meses, periodicidadMeses: meses } : p),
  };
}

/** Lo que calculaba el código de antes con una trimestral: el precio del ciclo
 *  leído como si fuera de un mes. Solo sirve para comprobar que estos tests
 *  distinguen el bien del mal. */
function precioDelCicloComoSiFueraDeUnMes(meses: number, s: SnapshotEstudio): SnapshotEstudio {
  return {
    ...s,
    planesTarifa: s.planesTarifa.map(p => p.tipo === 'MENSUAL' ? { ...p, precio: p.precio * meses, periodicidadMeses: 1 } : p),
  };
}

// ── Informes: «Ingreso» y «Margen» de la tabla de clases ────────────────────

function claseConSociaDeCuota(precio: number, periodicidadMeses: number) {
  const se = sesion({ id: 's1', inicio: '2026-07-10T19:00:00.000Z', fin: '2026-07-10T20:00:00.000Z' });
  // 8 asistencias en las últimas 8 semanas → 1 clase por semana.
  const historico = Array.from({ length: 8 }, (_, i) => reserva({ socioId: 'soc1', estado: 'ASISTIDA', sesionId: `otra${i}`, creadoEn: diasAntes(i * 7 + 1) }));
  return snapshot({
    sesiones: [se],
    reservas: [reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' }), ...historico],
    socios: [socio({ id: 'soc1' })],
    suscripciones: [suscripcion({ socioId: 'soc1', planId: 'cuota' })],
    planesTarifa: [plan({ id: 'cuota', precio, periodicidadMeses })],
    instructorTarifas: [{ instructorId: 'i1', tarifaHora: 30 }],
  });
}

for (const [nombre, precio, meses] of [['trimestral', 259.8, 3], ['semestral', 519.6, 6], ['anual', 1039.2, 12]] as const) {
  test(`Informes: una cuota ${nombre} imputa a la clase lo que se paga al mes, no el precio del ${nombre === 'anual' ? 'año' : 'ciclo'}`, () => {
    const s = claseConSociaDeCuota(precio, meses);
    const r = margenSesion(s.sesiones[0], s, construirIndices(s));
    // 86,6 €/mes ÷ (1 clase/semana × 4,33) = 20 €, igual que la mensual de 86,6 €.
    assert.equal(r.ingresoImputado, 20);
    assert.equal(r.costeInstructora, 30);
    assert.equal(r.margen, -10);
    // El punto de equilibrio sale del precio medio de la sesión: 30 € ÷ 20 € → 2.
    assert.equal(r.breakEvenAsistentes, 2);

    const mensual = claseConSociaDeCuota(86.6, 1);
    assert.deepEqual(r, margenSesion(mensual.sesiones[0], mensual, construirIndices(mensual)));
  });
}

test('Informes: el test distingue — leer el precio del trimestre como de un mes saldría ×3', () => {
  const s = claseConSociaDeCuota(259.8, 1);
  assert.equal(margenSesion(s.sesiones[0], s, construirIndices(s)).ingresoImputado, 60);
});

// ── Señales compartidas: valor mensual y precio medio de la sesión ──────────

test('valorMensual: una trimestral de 240 € vale 80 € al mes, y una anual de 960 €, también', () => {
  for (const [precio, meses] of [[80, 1], [240, 3], [480, 6], [960, 12]]) {
    const s = snapshot({
      socios: [socio({ id: 'ana' })],
      suscripciones: [suscripcion({ socioId: 'ana', planId: 'cuota' })],
      planesTarifa: [plan({ id: 'cuota', precio, periodicidadMeses: meses })],
    });
    assert.equal(valorMensual('ana', construirIndices(s), NOW), 80, `${precio} € cada ${meses} meses`);
  }
});

test('valorMensual: la periodicidad no toca a una tarifa suelta, que no es una cuota', () => {
  const s = snapshot({
    socios: [socio({ id: 'ana' })],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'suelta' })],
    planesTarifa: [plan({ id: 'suelta', tipo: 'PUNTUAL', precio: 18, sesiones: 1, periodicidadMeses: 3 })],
  });
  assert.equal(valorMensual('ana', construirIndices(s), NOW), 18);
});

test('precioMedioSesion: la misma socia con la cuota mensual, trimestral o anual da el mismo precio por clase', () => {
  const base = snapshot({
    socios: [socio({ id: 'ana' }), socio({ id: 'bea' })],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'cuota' }), suscripcion({ socioId: 'bea', planId: 'bono' })],
    planesTarifa: [plan({ id: 'cuota', precio: 86.6 }), plan({ id: 'bono', tipo: 'BONO', precio: 100, sesiones: 10 })],
    reservas: [...asistencias('ana', 7, 8, 1), ...asistencias('bea', 7, 8, 1)],
  });
  const mensual = precioMedioSesion(base, construirIndices(base));
  assert.equal(Math.round(mensual * 100) / 100, 15); // (20 + 10) / 2
  for (const meses of [3, 6, 12]) {
    const s = cobradoCada(meses, base);
    assert.ok(Math.abs(precioMedioSesion(s, construirIndices(s)) - mensual) < 1e-9, `cada ${meses} meses`);
  }
  const mal = precioDelCicloComoSiFueraDeUnMes(3, base);
  assert.equal(Math.round(precioMedioSesion(mal, construirIndices(mal)) * 100) / 100, 35); // (60 + 10) / 2
});

// ── Medición diferida: impacto real de una renovación ───────────────────────

test('precioMensualDePlanRenovado: la renovación de una trimestral cuenta lo que paga al mes', () => {
  assert.equal(precioMensualDePlanRenovado({ precio: 80, tipo: 'MENSUAL', periodicidad_meses: 1 }), 80);
  assert.equal(precioMensualDePlanRenovado({ precio: 240, tipo: 'MENSUAL', periodicidad_meses: 3 }), 80);
  assert.equal(precioMensualDePlanRenovado({ precio: 960, tipo: 'MENSUAL', periodicidad_meses: 12 }), 80);
  // PostgREST puede devolver un numeric como texto.
  assert.equal(precioMensualDePlanRenovado({ precio: '240.00', tipo: 'MENSUAL', periodicidad_meses: 3 }), 80);
  // Una fila de antes de la columna es la mensual de siempre.
  assert.equal(precioMensualDePlanRenovado({ precio: 80, tipo: 'MENSUAL', periodicidad_meses: null }), 80);
});

test('precioMensualDePlanRenovado: un bono no se divide, y sin precio no se inventa uno', () => {
  assert.equal(precioMensualDePlanRenovado({ precio: 150, tipo: 'BONO', periodicidad_meses: 3 }), 150);
  assert.equal(precioMensualDePlanRenovado({ precio: null, tipo: 'MENSUAL', periodicidad_meses: 3 }), null);
  assert.equal(precioMensualDePlanRenovado(null), null);
});

// ── Centro de Control: los especialistas no cambian de umbral ───────────────

/** Un estudio que despierta a casi todos los especialistas que miran precios:
 *  Retención (valor mensual), Ingresos I1 (precio medio de la sesión), Agenda
 *  A3 (mover la franja floja a la que se llena, plazas × precio medio), Equipo
 *  E2 (reservas sin cubrir × precio medio), Finanzas F2 (bono contra cuota) y
 *  F4 (cuota que no se podrá cobrar). */
function estudioQueDespiertaALosEspecialistas(): SnapshotEstudio {
  const regulares = Array.from({ length: 5 }, (_, i) => `regular${i}`);
  const socios: Socio[] = [
    socio({ id: 'laura', nombre: 'Laura' }),
    socio({ id: 'bea', nombre: 'Bea' }),
    socio({ id: 'ana', nombre: 'Ana', stripePaymentMethodId: 'pm_1', tarjetaExpMes: 1, tarjetaExpAnio: 2026, tarjetaMarca: 'visa', tarjetaUltimos4: '4242' }),
    ...regulares.map(id => socio({ id })),
  ];
  const planesTarifa: PlanTarifa[] = [
    plan({ id: 'cuota', nombre: 'Ilimitado', precio: 90 }),
    plan({ id: 'bono10', nombre: 'Bono 10', tipo: 'BONO', precio: 150, sesiones: 10 }),
  ];
  const suscripciones: Suscripcion[] = [
    suscripcion({ socioId: 'laura', planId: 'cuota', fechaFin: diasAntes(-10) }),
    suscripcion({ socioId: 'ana', planId: 'cuota', fechaFin: diasAntes(-20) }),
    ...regulares.map(id => suscripcion({ socioId: id, planId: 'cuota' })),
    // Bea encadena bonos: el de ahora y uno anterior dentro de los 90 días.
    suscripcion({ socioId: 'bea', planId: 'bono10', sesionesRestantes: 5, fechaInicio: diasAntes(10) }),
    suscripcion({ socioId: 'bea', planId: 'bono10', estado: 'EXPIRADA', sesionesRestantes: 0, fechaInicio: diasAntes(40) }),
  ];

  // Franja llena con lista de espera y una sala libre → Ingresos abre otra clase.
  const llena = (d: number) => {
    const t = new Date(NOW.getTime() - d * MS_DIA);
    t.setUTCHours(19, 0, 0, 0);
    return sesion({ id: `llena-${d}`, inicio: t.toISOString() });
  };
  const llenas = [7, 14, 21, 28, 35, 42].map(llena);
  // Franja al 25 % con clase futura → Agenda propone llevarla a la que se llena.
  const floja = (d: number) => {
    const t = new Date(NOW.getTime() + d * MS_DIA);
    t.setUTCHours(10, 0, 0, 0);
    return sesion({ id: `floja${d}`, inicio: t.toISOString() });
  };
  const flojas = [-7, -14, -21, 7].map(floja);
  // Clase cuya sustitución lleva 4 h sin resolverse, con dos plazas reservadas.
  const sinCubrir = sesion({ id: 'sin-cubrir', inicio: diasAntes(-2) });

  const reservas: Reserva[] = [
    ...asistencias('laura', 2, 24, 25), // venía 3×/semana y lleva 25 días sin venir
    ...asistencias('bea', 3, 16, 2),    // ~2×/semana con su bono
    ...asistencias('ana', 7, 8, 2),
    ...regulares.flatMap(id => asistencias(id, 7, 8, 2)),
    ...llenas.flatMap(se => Array.from({ length: 8 }, (_, i) => reserva({ socioId: `llena-${se.id}-${i}`, estado: 'CONFIRMADA', sesionId: se.id }))),
    ...llenas.flatMap(se => [0, 1].map(i => reserva({ socioId: `espera-${se.id}-${i}`, estado: 'LISTA_ESPERA', sesionId: se.id }))),
    ...flojas.slice(0, 3).flatMap(se => [0, 1].map(i => reserva({ socioId: `floja-${se.id}-${i}`, estado: 'CONFIRMADA', sesionId: se.id }))),
    reserva({ socioId: 'regular0', estado: 'CONFIRMADA', sesionId: 'sin-cubrir' }),
    reserva({ socioId: 'regular1', estado: 'CONFIRMADA', sesionId: 'sin-cubrir' }),
  ];

  return snapshot({
    socios, planesTarifa, suscripciones, reservas,
    sesiones: [...llenas, ...flojas, sinCubrir],
    salas: [sala({ id: 's1' }), sala({ id: 's2' })],
    instructores: [instructor('i1', { nombre: 'Marta' })],
    sustituciones: [sustitucion({ sesionId: 'sin-cubrir', instructorOriginalId: 'i1', creadoEn: horasAntes(4) })],
    contexto: { nSociasActivas: socios.length, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
  });
}

/** Lo que la propietaria ve de cada tarjeta: qué es, cuánto vale, cuánto se
 *  fía el motor y lo que dice. `datosUsados` se deja fuera a propósito: lleva
 *  el precio de la tarifa tal cual (240 € en una trimestral es su precio). */
const loQueSeVe = (c: Candidata) => ({
  dedupeKey: c.dedupeKey, tipo: c.tipo, impacto: c.impacto, confianza: c.confianza,
  urgencia: c.urgencia, tituloMotor: c.tituloMotor, motivoMotor: c.motivoMotor,
});
const detectarTodo = (s: SnapshotEstudio) =>
  ESPECIALISTAS.flatMap(e => e.detectar(s, memoriaVacia(), NOW)).map(loQueSeVe)
    .sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));

test('Centro de Control: el estudio de prueba despierta a los especialistas que valoran en €', () => {
  // Si alguno deja de dispararse, o sale sin cifra, la equivalencia de abajo
  // deja de probar nada sobre él.
  const candidatas = detectarTodo(estudioQueDespiertaALosEspecialistas());
  for (const tipo of ['RECUPERAR_SOCIA', 'ABRIR_SESION', 'MOVER_HORARIO', 'REVISAR_CARGA_EQUIPO', 'PROPONER_SUSCRIPCION_MENSUAL', 'COBRAR_PENDIENTE'] as const) {
    const c = candidatas.find(x => x.tipo === tipo);
    assert.ok(c, `falta ${tipo}: ${candidatas.map(x => x.tipo).join(', ')}`);
    assert.ok(c.impacto && c.impacto.valor > 0, `${tipo} sin impacto en €`);
  }
});

for (const [nombre, meses] of [['trimestral', 3], ['semestral', 6], ['anual', 12]] as const) {
  test(`Centro de Control: con la cuota ${nombre} salen las mismas tarjetas, con las mismas cifras y confianza`, () => {
    const mensual = estudioQueDespiertaALosEspecialistas();
    assert.deepEqual(detectarTodo(cobradoCada(meses, mensual)), detectarTodo(mensual));
  });
}

test('Centro de Control: el test distingue — leer el precio del trimestre como de un mes cambia las tarjetas', () => {
  const mensual = estudioQueDespiertaALosEspecialistas();
  assert.notDeepEqual(detectarTodo(precioDelCicloComoSiFueraDeUnMes(3, mensual)), detectarTodo(mensual));
});

test('Ingresos I4: una cuota barata y muy usada se detecta igual aunque se cobre al año', () => {
  // 3 socias en una cuota barata que vienen 1×/semana y 3 en una cara que
  // vienen la mitad: la barata queda muy por debajo de la media por clase.
  const baratas = ['a1', 'a2', 'a3'];
  const caras = ['b1', 'b2', 'b3'];
  const estudio = (barato: Partial<PlanTarifa>) => snapshot({
    socios: [...baratas, ...caras].map(id => socio({ id })),
    planesTarifa: [plan({ id: 'barato', nombre: 'Básico', precio: 20, ...barato }), plan({ id: 'caro', nombre: 'Premium', precio: 80 })],
    suscripciones: [...baratas.map(id => suscripcion({ socioId: id, planId: 'barato' })), ...caras.map(id => suscripcion({ socioId: id, planId: 'caro' }))],
    reservas: [...baratas.flatMap(id => asistencias(id, 7, 8, 1)), ...caras.flatMap(id => asistencias(id, 7, 4, 1))],
  });
  const revisarPrecio = (s: SnapshotEstudio) =>
    ingresos.detectar(s, memoriaVacia(), NOW).filter(c => c.tipo === 'REVISAR_PRECIO').map(loQueSeVe);

  const todoMensual = revisarPrecio(estudio({}));
  assert.equal(todoMensual.length, 1);
  assert.equal(todoMensual[0].dedupeKey, 'INGRESOS:REVISAR_PRECIO:barato');
  // La básica cobrada al año (240 €, 20 € al mes) junto a la premium mensual.
  assert.deepEqual(revisarPrecio(estudio({ precio: 240, periodicidadMeses: 12 })), todoMensual);
  // Leyendo los 240 € como de un mes, la básica pasaba por la cara y no se avisaba.
  assert.deepEqual(revisarPrecio(estudio({ precio: 240, periodicidadMeses: 1 })), []);
});

test('Centro de Control: Prioridades y el resto del análisis no cambian con una cuota anual', () => {
  const analizar = (s: SnapshotEstudio) => {
    const r = ejecutarAnalisis({
      snapshot: s, memoria: memoriaVacia(), pendientesActuales: [], resueltas90d: [],
      nombrePropietario: 'Marco', ventanaMientrasDormiasDesde: new Date(NOW.getTime() - 2 * MS_DIA), now: NOW,
    });
    return {
      prioridades: r.prioridadesHome.map(loQueSeVe),
      finales: r.candidatasFinales.map(loQueSeVe),
    };
  };
  const mensual = estudioQueDespiertaALosEspecialistas();
  const resultado = analizar(mensual);
  assert.ok(resultado.prioridades.length > 0);
  assert.deepEqual(analizar(cobradoCada(12, mensual)), resultado);
});
