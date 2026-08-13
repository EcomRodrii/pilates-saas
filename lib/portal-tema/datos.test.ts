import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bonoDe, clasesDeLaSemana, construirDatosPortal, fechaLarga, filtrosDe,
  bonosDe, comprasDe, horaLocal, horarioDe, hoyDe, inicialDe, planesDe, plazasDeSesion, reservadasDe, rejillaMesPortal, semanaDe, sociaDe,
} from './datos.ts';
import type { StudioClass } from './tipos.ts';
import type { Spot } from '../types.ts';
import type { Instructor, PlanTarifa, Reserva, Sala, Sesion, Socio, Suscripcion, TipoClase } from '../types.ts';

// ── Fixtures mínimos. Solo lo que el adaptador mira. ────────────────────────

const tipo = (id: string, nombre: string, extra: Partial<TipoClase> = {}): TipoClase => ({
  id, studioId: 's1', nombre, color: '#000', duracionMinutos: 50, descripcion: null,
  nivel: 'TODOS', fotoUrl: null, ventanaCancelacionHoras: null, reservaExigirPlan: null,
  reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null, permiteListaEspera: null,
  requiereAprobacion: null, listaEsperaPlazoAceptacionMinutos: null, minimoAsistentesPorClase: null,
  penalizacionImporteEur: null, ...extra,
});

const sala = (id: string, nombre: string): Sala => ({ id, studioId: 's1', nombre, capacidad: 10, color: '#000' });

const instructor = (id: string, nombre: string): Instructor => ({
  id, studioId: 's1', nombre, email: null, telefono: null, color: '#000', activo: true,
  rol: 'INSTRUCTOR', authUserId: null,
});

const sesion = (id: string, inicio: string, fin: string, extra: Partial<Sesion> = {}): Sesion => ({
  id, studioId: 's1', tipoClaseId: 't1', salaId: 'sa1', instructorId: 'i1',
  inicio, fin, aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null, ...extra,
});

const reserva = (id: string, sesionId: string, estado: Reserva['estado']): Reserva => ({
  id, studioId: 's1', sesionId, socioId: 'so1', estado, spotId: null, posicionEspera: null,
  ofertaExpiraEn: null, checkInEn: null, creadoEn: '2026-09-01T00:00:00.000Z',
});

const plan = (id: string, nombre: string, extra: Partial<PlanTarifa> = {}): PlanTarifa => ({
  id, studioId: 's1', nombre, descripcion: null, precio: 100, tipo: 'BONO', sesiones: 10, activo: true, ...extra,
});

const suscripcion = (id: string, planId: string, extra: Partial<Suscripcion> = {}): Suscripcion => ({
  id, studioId: 's1', socioId: 'so1', planId, estado: 'ACTIVA',
  fechaInicio: '2026-09-01T00:00:00.000Z', fechaFin: null, sesionesRestantes: 5,
  stripeSubscriptionId: null, ...extra,
});

const BASE = {
  sesiones: [], reservas: [], tiposClase: [], salas: [], instructores: [],
  socio: null, suscripciones: [], planes: [],
};

// ── La semana ───────────────────────────────────────────────────────────────

test('semanaDe: siete días de lunes a domingo, con el día del mes', () => {
  // Jueves 3 de septiembre de 2026.
  const semana = semanaDe(new Date('2026-09-03T10:00:00.000Z'));
  assert.equal(semana.length, 7);
  assert.deepEqual(semana.map((d) => d.label), ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']);
  assert.deepEqual(semana.map((d) => d.num), [31, 1, 2, 3, 4, 5, 6]);
});

test('semanaDe: un lunes se queda en su propia semana, no salta a la anterior', () => {
  const semana = semanaDe(new Date('2026-09-07T08:00:00.000Z')); // lunes
  assert.equal(semana[0].num, 7);
  assert.equal(semana[6].num, 13);
});

// ⚠️ El bug que ya se comió la migración 0105: una clase de madrugada cae el
// día ANTERIOR en UTC. Si la semana se calculara en UTC, un domingo a las 00:30
// de Madrid se contaría como sábado y el horario lo enseñaría en el día que no
// es.
test('semanaDe: la medianoche de Madrid no se va al día anterior', () => {
  // 2026-09-07T00:30 en Madrid = 2026-09-06T22:30Z (domingo en UTC, lunes en Madrid).
  const semana = semanaDe(new Date('2026-09-06T22:30:00.000Z'));
  assert.equal(semana[0].num, 7, 'la semana empieza el lunes 7, no el 31 de agosto');
});

test('semanaDe: el cambio de hora de octubre no descuadra la semana', () => {
  // El domingo 25/10/2026 se atrasa el reloj en España.
  const semana = semanaDe(new Date('2026-10-28T09:00:00.000Z'));
  assert.deepEqual(semana.map((d) => d.num), [26, 27, 28, 29, 30, 31, 1]);
});

// ── Las clases ──────────────────────────────────────────────────────────────

test('clasesDeLaSemana: resuelve tipo, sala e instructora, y la hora es de Madrid', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T16:50:00.000Z')],
    tiposClase: [tipo('t1', 'Reformer', { nivel: 'MEDIO', descripcion: 'Fuerza y control' })],
    salas: [sala('sa1', 'Sala 2')],
    instructores: [instructor('i1', 'Marta Gómez')],
  });
  assert.equal(clases.length, 1);
  assert.deepEqual(clases[0], {
    id: 'x1', name: 'Reformer', type: 't1', day: 3,
    time: '18:00', end: '18:50', duration: '50 min',
    // La hora de PARED es Madrid (18:00); el instante real es UTC. Las dos
    // salen de la misma sesión, así que no pueden discrepar.
    startsAt: '2026-09-03T16:00:00.000Z', endsAt: '2026-09-03T16:50:00.000Z',
    // ⚠️ 'Intermedio', no 'MEDIO': el portal pinta este campo tal cual en la
    // píldora del detalle y en «Nivel …». Con los datos de muestra no se vio
    // porque ya traían texto humano.
    room: 'Sala 2', level: 'Intermedio', teacher: 'Marta Gómez', initial: 'M',
    seats: 10, plazas: [], description: 'Fuerza y control',
    // Sin objetivos marcados en el tipo de clase, el detalle no pinta la
    // sección «Beneficios» — vacío y ausente significan lo mismo.
    benefits: [],
    // Sin ventana en el tipo NI en el estudio: la hoja de cancelar no promete
    // ninguna, en vez de copiar el «6 horas» del prototipo.
    cancelHoras: null,
  });
});

test('clasesDeLaSemana: fuera de la semana, canceladas y orden', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [
      sesion('tarde', '2026-09-04T18:00:00.000Z', '2026-09-04T19:00:00.000Z'),
      sesion('pronto', '2026-09-04T08:00:00.000Z', '2026-09-04T09:00:00.000Z'),
      sesion('cancelada', '2026-09-04T10:00:00.000Z', '2026-09-04T11:00:00.000Z', { cancelada: true }),
      sesion('otra-semana', '2026-09-20T10:00:00.000Z', '2026-09-20T11:00:00.000Z'),
    ],
    tiposClase: [tipo('t1', 'Reformer')],
  });
  assert.deepEqual(clases.map((c) => c.id), ['pronto', 'tarde']);
});

// ⚠️ Encontrado mirando datos reales, no razonando: al adaptador le llegan
// TODAS las sesiones del estudio. Filtrar por día del mes parecía bastar
// —dentro de una semana los números no se repiten— pero el 5 de septiembre
// tiene el mismo `day` que el 5 de agosto y se colaba en el horario.
test('clasesDeLaSemana: una clase de otro mes con el mismo día NO se cuela', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'), // semana del 31/08 al 06/09
    sesiones: [
      sesion('de-esta-semana', '2026-09-02T16:00:00.000Z', '2026-09-02T17:00:00.000Z'),
      sesion('mismo-dia-otro-mes', '2026-10-02T16:00:00.000Z', '2026-10-02T17:00:00.000Z'),
      sesion('mismo-dia-mes-anterior', '2026-08-02T16:00:00.000Z', '2026-08-02T17:00:00.000Z'),
    ],
    tiposClase: [tipo('t1', 'Reformer')],
  });
  assert.deepEqual(clases.map((c) => c.id), ['de-esta-semana']);
});

// El aforo lo decide `plazasOcupadas`. La lista de espera y las pendientes de
// aprobación NO ocupan; `ASISTIDA` sí — si no, una clase pasada aparecería con
// plazas libres que no existen.
test('clasesDeLaSemana: plazas libres = aforo menos confirmadas y asistidas', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z', { aforoMaximo: 5 })],
    tiposClase: [tipo('t1', 'Reformer')],
    reservas: [
      reserva('r1', 'x1', 'CONFIRMADA'),
      reserva('r2', 'x1', 'ASISTIDA'),
      reserva('r3', 'x1', 'LISTA_ESPERA'),
      reserva('r4', 'x1', 'PENDIENTE_APROBACION'),
      reserva('r5', 'x1', 'CANCELADA'),
      reserva('r6', 'otra', 'CONFIRMADA'),
    ],
  });
  assert.equal(clases[0].seats, 3);
});

test('clasesDeLaSemana: nunca devuelve plazas negativas si hay sobreaforo', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z', { aforoMaximo: 1 })],
    tiposClase: [tipo('t1', 'Reformer')],
    reservas: [reserva('r1', 'x1', 'CONFIRMADA'), reserva('r2', 'x1', 'CONFIRMADA')],
  });
  assert.equal(clases[0].seats, 0);
});

test('clasesDeLaSemana: sin tipo, sala ni instructora no revienta', () => {
  const clases = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z')],
  });
  assert.equal(clases[0].name, 'Clase');
  assert.equal(clases[0].room, '');
  assert.equal(clases[0].teacher, '');
  assert.equal(clases[0].initial, '');
});

// ── Filtros ─────────────────────────────────────────────────────────────────

test('filtrosDe: solo los tipos que aparecen esta semana', () => {
  const tipos = [tipo('t1', 'Reformer'), tipo('t2', 'Suelo'), tipo('t3', 'Prenatal')];
  const clases = [{ type: 't1' }, { type: 't3' }] as Parameters<typeof filtrosDe>[0];
  assert.deepEqual(filtrosDe(clases, tipos), [
    { key: 'todas', label: 'Todas' },
    { key: 't1', label: 'Reformer' },
    { key: 't3', label: 'Prenatal' },
  ]);
});

test('filtrosDe: sin clases, solo queda "Todas"', () => {
  assert.deepEqual(filtrosDe([], [tipo('t1', 'Reformer')]), [{ key: 'todas', label: 'Todas' }]);
});

// ── Planes y bono ───────────────────────────────────────────────────────────

test('planesDe: descarta los inactivos y el ilimitado queda por encima', () => {
  const salida = planesDe([
    plan('p1', 'Bono 10'),
    plan('p2', 'Retirado', { activo: false }),
    plan('p3', 'Mensual', { tipo: 'MENSUAL', sesiones: null }),
  ]);
  assert.deepEqual(salida.map((p) => p.key), ['p1', 'p3']);
  assert.ok(salida[1].classes > salida[0].classes);
});

test('bonoDe: elige el que menos sesiones le quedan', () => {
  const bono = bonoDe(
    [suscripcion('s1', 'p1', { sesionesRestantes: 8 }), suscripcion('s2', 'p2', { sesionesRestantes: 2 })],
    [plan('p1', 'Bono 10'), plan('p2', 'Bono 5', { sesiones: 5 })],
  );
  assert.equal(bono.name, 'Bono 5');
  assert.equal(bono.total, 5);
});

test('bonoDe: ignora las no activas y las de sesiones ilimitadas', () => {
  assert.deepEqual(
    bonoDe(
      [
        suscripcion('s1', 'p1', { estado: 'CANCELADA', sesionesRestantes: 1 }),
        suscripcion('s2', 'p2', { sesionesRestantes: null }),
      ],
      [plan('p1', 'Bono 10'), plan('p2', 'Mensual', { sesiones: null })],
    ),
    { name: '', total: 0, expires: '' },
  );
});

test('bonoDe: la caducidad sale formateada en largo, no en ISO', () => {
  const bono = bonoDe(
    [suscripcion('s1', 'p1', { fechaFin: '2026-09-30T21:59:59.000Z' })],
    [plan('p1', 'Bono 10')],
  );
  assert.equal(bono.expires, '30 de septiembre');
});

// ── Socia ───────────────────────────────────────────────────────────────────

test('sociaDe: nombre completo, nombre corto e inicial', () => {
  const socio = { id: 's1', nombre: 'Laura', apellidos: 'Ortega', email: 'l@x.com', telefono: null } as Socio;
  assert.deepEqual(sociaDe(socio), {
    id: 's1', name: 'Laura Ortega', short: 'Laura', initial: 'L',
    apellidos: 'Ortega', email: 'l@x.com',
    // ⚠️ Cadena vacía y NO null: estos seis alimentan un formulario, y un
    // `<input value={null}>` se vuelve NO controlado a mitad de escritura.
    telefono: '', fechaNacimiento: '', direccion: '', domiciliado: false,
  });
});

test('sociaDe: sin socia (portal sin sesión) devuelve vacíos, no "undefined"', () => {
  assert.deepEqual(sociaDe(null), {
    id: '', name: '', short: '', initial: '',
    apellidos: '', email: '', telefono: '', fechaNacimiento: '', direccion: '', domiciliado: false,
  });
});

test('sociaDe: sin id no se puede guardar — la pantalla lo necesita para saberlo', () => {
  assert.equal(sociaDe(null).id, '');
});

// ── Piezas sueltas ──────────────────────────────────────────────────────────

test('horaLocal: hora de pared de Madrid, en 24h', () => {
  assert.equal(horaLocal('2026-09-03T16:00:00.000Z'), '18:00'); // verano, +02:00
  assert.equal(horaLocal('2026-12-03T16:00:00.000Z'), '17:00'); // invierno, +01:00
});

test('fechaLarga: vacía si no hay fecha', () => {
  assert.equal(fechaLarga(null), '');
  assert.equal(fechaLarga(undefined), '');
});

test('inicialDe: en mayúscula y sin espacios de más', () => {
  assert.equal(inicialDe('  marta '), 'M');
  assert.equal(inicialDe(''), '');
});

// ── El adaptador entero ─────────────────────────────────────────────────────

test('construirDatosPortal: un estudio vacío da datos vacíos pero válidos', () => {
  const datos = construirDatosPortal({ ...BASE, ahora: new Date('2026-09-03T10:00:00.000Z') });
  assert.deepEqual(datos.clases, []);
  assert.equal(datos.dias.length, 7);
  assert.deepEqual(datos.filtros, [{ key: 'todas', label: 'Todas' }]);
  assert.deepEqual(datos.planes, []);
  assert.deepEqual(datos.bono, { name: '', total: 0, expires: '' });
  assert.deepEqual(datos.socia, {
    id: '', name: '', short: '', initial: '',
    apellidos: '', email: '', telefono: '', fechaNacimiento: '', direccion: '', domiciliado: false,
  });
});

test('construirDatosPortal: los filtros solo traen tipos que están en las clases', () => {
  const datos = construirDatosPortal({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T17:00:00.000Z')],
    tiposClase: [tipo('t1', 'Reformer'), tipo('t9', 'Nunca programado')],
  });
  assert.deepEqual(datos.filtros.map((f) => f.key), ['todas', 't1']);
});

// ── Reservas de la socia ────────────────────────────────────────────────────
//
// ⚠️ Regresión. La pantalla de Reservas del kit leía `state.booked`, la lista
// de MENTIRA del store (la rellena un `setTimeout`, no el servidor), que
// arranca vacía: en el portal real la socia no veía ni una de sus reservas,
// con todas guardadas en la base de datos. Y "Cancelar" solo borraba la fila.

// Sin `as StudioClass`: el cast tapaba que el objeto no encajaba (sobraba
// `tag`, faltaba `initial`) y lo cazó CI, no mi tsc — que corrí antes de
// escribir esto. Que el compilador compruebe el molde es justo lo que quiero
// aquí: si `StudioClass` gana un campo, este ayudante tiene que enterarse.
function clase(id: string): StudioClass {
  return {
    id, name: 'Reformer', type: 't1', day: 7, time: '18:15', end: '19:10',
    startsAt: '2026-09-07T16:15:00.000Z', endsAt: '2026-09-07T17:10:00.000Z', cancelHoras: null,
    duration: '55 min', room: 'Sala 1', teacher: 'Ana', initial: 'A',
    level: 'Todos los niveles', seats: 3, plazas: [], description: '', benefits: [],
  };
}

test('reservadasDe: empareja cada reserva viva con su clase', () => {
  const r = reservadasDe(
    [{ id: 'res-1', sesionId: 'ses-a', estado: 'CONFIRMADA', posicionEspera: null }],
    [clase('ses-a')],
  );
  // El id que viaja al servidor para cancelar es el de la RESERVA, no el de la
  // clase: confundirlos cancela algo que no es (o nada).
  assert.deepEqual(r, [{ classId: 'ses-a', reservaId: 'res-1', estado: 'CONFIRMADA', posicion: null }]);
});

test('reservadasDe: una cancelada no cuenta como reserva', () => {
  const r = reservadasDe(
    [{ id: 'res-1', sesionId: 'ses-a', estado: 'CANCELADA', posicionEspera: null }],
    [clase('ses-a')],
  );
  assert.deepEqual(r, []);
});

test('reservadasDe: la lista de espera SÍ se ve', () => {
  // Tiene que poder verla para salirse de la cola. No ocupa aforo, pero existe.
  const r = reservadasDe(
    [{ id: 'res-1', sesionId: 'ses-a', estado: 'LISTA_ESPERA', posicionEspera: null }],
    [clase('ses-a')],
  );
  assert.equal(r.length, 1);
});

test('reservadasDe: una reserva sin clase en pantalla se cae de la lista', () => {
  // La clase se canceló, o es de otra semana: pintar media fila (sin hora ni
  // sala) es peor que no pintarla.
  const r = reservadasDe(
    [{ id: 'res-1', sesionId: 'ses-fantasma', estado: 'CONFIRMADA', posicionEspera: null }],
    [clase('ses-a')],
  );
  assert.deepEqual(r, []);
});

test('construirDatosPortal: sin socia identificada, `reservadas` es undefined', () => {
  // ⚠️ `undefined` y `[]` NO son lo mismo: `[]` significa "identificada y sin
  // reservas" y hace que el portal deje de usar la lista de demostración.
  const datos = construirDatosPortal({
    ahora: new Date('2026-08-07T10:00:00Z'),
    sesiones: [], reservas: [], tiposClase: [], salas: [], instructores: [],
    socio: null, suscripciones: [], planes: [],
  });
  assert.equal(datos.reservadas, undefined);
});

// ── hoyDe: la fecha que pinta la cabecera del Inicio ────────────────────────

test('hoyDe: el número del mes y la fecha en palabras salen de la MISMA fecha local', () => {
  // 5 de agosto de 2026, martes.
  const r = hoyDe(new Date('2026-08-05T09:00:00Z'));
  assert.deepEqual(r, { num: 5, largo: 'miércoles, 5 de agosto', mes: 'agosto' });
});

test('hoyDe: la medianoche de Madrid NO se va al día anterior', () => {
  // 00:30 en Madrid es el día ANTERIOR en UTC. Es el mismo bug que ya se comió
  // `semanaDe`: con UTC la cabecera diría «martes, 4 de agosto» mientras la
  // tira de la semana marca el 5.
  const r = hoyDe(new Date('2026-08-04T22:30:00Z'));
  assert.equal(r.num, 5);
  assert.equal(r.largo, 'miércoles, 5 de agosto');
});

test('hoyDe: el número y la etiqueta nunca discrepan en el cambio de hora', () => {
  // Madrugada del cambio de hora de octubre de 2026 (25/10).
  const r = hoyDe(new Date('2026-10-25T00:30:00Z'));
  assert.equal(r.num, 25);
  assert.ok(r.largo.startsWith('domingo, 25 de octubre'));
});

// ⚠️ Los tests de la racha ya NO están aquí: viven en
// `lib/engines/streak-engine.test.ts`, junto a `calcularRacha`, que es quien
// la calcula de verdad y quien alimenta los logros. Se escribió aquí un
// segundo cálculo (`rachaDe`) sin ver que esa cifra ya tenía dueño.

// ── Tener plaza y estar en la cola no son lo mismo ──────────────────────────

test('reservadasDe: distingue plaza de cola, y la posición SOLO en la cola', () => {
  // ⚠️ El portal las trataba a todas como «Reservada» porque `ReservaPortal` no
  // llevaba el estado. Con una lista de espera de verdad, eso le decía a la
  // socia que tenía plaza cuando estaba tercera.
  const out = reservadasDe([
    { id: 'r1', sesionId: 'ses-a', estado: 'CONFIRMADA', posicionEspera: 4 },
    { id: 'r2', sesionId: 'ses-b', estado: 'LISTA_ESPERA', posicionEspera: 2 },
  ], [clase('ses-a'), clase('ses-b')]);

  assert.deepEqual(out, [
    // `posicionEspera: 4` en una CONFIRMADA es basura de la fila: enseñarla
    // diría «4ª» a quien ya tiene su sitio.
    { classId: 'ses-a', reservaId: 'r1', estado: 'CONFIRMADA', posicion: null },
    { classId: 'ses-b', reservaId: 'r2', estado: 'LISTA_ESPERA', posicion: 2 },
  ]);
});

test('reservadasDe: en la cola sin número asignado, la posición es null y no 0', () => {
  const [r] = reservadasDe(
    [{ id: 'r1', sesionId: 'ses-a', estado: 'LISTA_ESPERA', posicionEspera: null }],
    [clase('ses-a')],
  );
  assert.equal(r.posicion, null);
});

// ── Beneficios: la lista FIJA de objetivos, en palabras ─────────────────────

test('clasesDeLaSemana: los objetivos del tipo salen como etiquetas, en el orden del catálogo', () => {
  const [c] = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T16:50:00.000Z')],
    // A propósito en orden inverso al catálogo: el orden lo manda OBJETIVOS,
    // no cómo los guardó el estudio, para que dos clases con los mismos
    // objetivos no los enseñen en distinto orden.
    tiposClase: [tipo('t1', 'Reformer', { objetivos: ['reformer', 'empezar'] })],
  });
  assert.deepEqual(c.benefits, ['Empezar desde cero', 'Reformer']);
});

test('clasesDeLaSemana: un objetivo que ya no existe se descarta, no se pinta', () => {
  // La lista es CONTRATO (lib/reservar/objetivos.ts): se pueden añadir ids pero
  // los viejos siguen guardados en estudios que los marcaron. Uno desconocido
  // no puede describir nada, y colarlo haría parecer que la clase cubre algo.
  const [c] = clasesDeLaSemana({
    ...BASE,
    ahora: new Date('2026-09-03T10:00:00.000Z'),
    sesiones: [sesion('x1', '2026-09-03T16:00:00.000Z', '2026-09-03T16:50:00.000Z')],
    tiposClase: [tipo('t1', 'Reformer', { objetivos: ['fuerza', 'adelgazar-2019'] })],
  });
  assert.deepEqual(c.benefits, ['Mejorar fuerza']);
});

// ── La cartera completa, no solo el bono que se está gastando ──────────────

const planBono = { id: 'p1', nombre: 'Bono 10 clases', sesiones: 10 };
const planMes = { id: 'p2', nombre: 'Plan Mensual', sesiones: null };
const sus = (o: Record<string, unknown>) => ({
  id: 's1', studioId: 'st', socioId: 'so', planId: 'p1', estado: 'ACTIVA',
  fechaInicio: '2026-08-01', fechaFin: '2026-11-01', sesionesRestantes: 8,
  stripeSubscriptionId: null, ...o,
} as never);

test('bonosDe: ⚠️ el plan ILIMITADO también entra — `bonoDe` lo descarta y no se veía en ninguna pantalla', () => {
  const out = bonosDe(
    [sus({ id: 'a' }), sus({ id: 'b', planId: 'p2', sesionesRestantes: null })],
    [planBono, planMes] as never,
  );
  assert.deepEqual(out.map((b) => b.name), ['Bono 10 clases', 'Plan Mensual']);
  assert.equal(out[1].unlimited, true);
});

test('bonosDe: un bono CADUCA y un plan se RENUEVA — la misma fecha, dos frases', () => {
  const [bono, plan] = bonosDe(
    [sus({ id: 'a' }), sus({ id: 'b', planId: 'p2', sesionesRestantes: null })],
    [planBono, planMes] as never,
  );
  assert.equal(bono.footline, 'Caduca el 1 de noviembre');
  // Decir «caduca» de una mensualidad asusta sin motivo.
  assert.equal(plan.footline, 'Renovación el 1 de noviembre');
});

test('bonosDe: el ilimitado no lleva porcentaje — no hay nada que agotar', () => {
  const [plan] = bonosDe([sus({ planId: 'p2', sesionesRestantes: null })], [planMes] as never);
  assert.equal(plan.percent, 0);
  assert.equal(plan.subline, 'Clases ilimitadas');
});

test('bonosDe: primero lo que se agota, los ilimitados después', () => {
  const out = bonosDe(
    [sus({ id: 'a', planId: 'p2', sesionesRestantes: null }), sus({ id: 'b' })],
    [planBono, planMes] as never,
  );
  assert.deepEqual(out.map((b) => b.unlimited), [false, true]);
});

test('bonosDe: las no activas quedan fuera', () => {
  assert.deepEqual(bonosDe([sus({ estado: 'CANCELADA' })], [planBono] as never), []);
});

test('bonosDe: sin sesiones en el plan, el porcentaje no revienta en NaN', () => {
  const [b] = bonosDe([sus({ sesionesRestantes: 0 })], [{ ...planBono, sesiones: 0 }] as never);
  assert.equal(b.percent, 0);
  assert.equal(Number.isNaN(b.percent), false);
});

// ── El historial: compras HECHAS, no intentadas ────────────────────────────

const recibo = (o: Record<string, unknown>) => ({
  id: 'r1', studioId: 'st', socioId: 'so', suscripcionId: null,
  concepto: 'Bono 10 clases', importe: 145, estado: 'COBRADO',
  fechaVencimiento: '2026-03-12', fechaCobro: '2026-03-12T10:00:00.000Z',
  fechaDevolucion: null, intentosReintento: 0, ...o,
} as never);

test('comprasDe: solo las COBRADAS — un recibo pendiente no es una compra', () => {
  // Listarlo diría que pagó algo que el estudio no ha cobrado.
  const out = comprasDe([recibo({}), recibo({ id: 'r2', estado: 'PENDIENTE', fechaCobro: null })]);
  assert.deepEqual(out.map((c) => c.id), ['r1']);
});

test('comprasDe: de la más reciente a la más antigua, con importe en euros', () => {
  const out = comprasDe([
    recibo({ id: 'viejo', fechaCobro: '2026-01-05T10:00:00.000Z' }),
    recibo({ id: 'nuevo', fechaCobro: '2026-06-05T10:00:00.000Z', importe: 18 }),
  ]);
  assert.deepEqual(out.map((c) => c.id), ['nuevo', 'viejo']);
  assert.equal(out[0].importe, '18,00 €');
  assert.equal(out[0].cuando, 'Comprado el 5 de junio');
});

// ── El horario de apertura ─────────────────────────────────────────────────

const dia = (d: number, o: Record<string, unknown> = {}) => ({
  diaSemana: d, abierto: true, horaApertura: '08:00:00', horaCierre: '21:00:00', ...o,
});

test('horarioDe: ⚠️ se lee de LUNES a domingo, aunque la BD use 0=domingo', () => {
  // `dia_semana` usa EXTRACT(DOW) (0=domingo), igual que lib/sustituciones.
  // Sin reordenar aquí, el domingo sale el primero — y cada pantalla acabaría
  // resolviéndolo a su manera.
  const out = horarioDe([0, 1, 2, 3, 4, 5, 6].map((d) => dia(d)));
  assert.deepEqual(out.map((x) => x.dia),
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
});

test('horarioDe: los segundos se recortan — nadie lee 08:00:00', () => {
  assert.equal(horarioDe([dia(1)])[0].cuando, '08:00 – 21:00');
});

test('horarioDe: un día cerrado lo dice, no enseña un guion', () => {
  assert.equal(horarioDe([dia(0, { abierto: false })])[0].cuando, 'Cerrado');
});

test('horarioDe: abierto pero sin horas puestas cuenta como cerrado, no como «– »', () => {
  const [d] = horarioDe([dia(1, { horaApertura: null, horaCierre: null })]);
  assert.equal(d.cuando, 'Cerrado');
});

test('horarioDe: sin horario configurado devuelve vacío — la sección no se pinta', () => {
  assert.deepEqual(horarioDe(undefined), []);
  assert.deepEqual(horarioDe([]), []);
});

test('horarioDe: un día que falta en la BD no inventa una fila', () => {
  // Un estudio puede tener solo cinco filas. Rellenar los dos que faltan con
  // «Cerrado» sería afirmar algo que nadie ha dicho.
  assert.deepEqual(horarioDe([dia(1), dia(2)]).map((x) => x.dia), ['Lunes', 'Martes']);
});

test('sociaDe: «Domiciliado» exige mandato SEPA, no solo el método preferido', () => {
  // Las DOS condiciones, igual que `PortalPerfilView`: con el método puesto
  // pero sin mandato no se domicilia nada, y decir «Domiciliado» ahí le haría
  // creer que su recibo se cobra solo.
  const base = { id: 's1', nombre: 'Laura', apellidos: '', email: '', telefono: null } as Socio;
  assert.equal(sociaDe({ ...base, metodoPagoPreferido: 'SEPA', sepaMandateId: 'mnd_1' } as Socio).domiciliado, true);
  assert.equal(sociaDe({ ...base, metodoPagoPreferido: 'SEPA', sepaMandateId: null } as Socio).domiciliado, false);
  assert.equal(sociaDe({ ...base, metodoPagoPreferido: 'TARJETA', sepaMandateId: 'mnd_1' } as Socio).domiciliado, false);
});

// ── Rejilla del mes (Calendario) ────────────────────────────────────────────
// Reemplaza el mes de muestra ("Septiembre 2026", 30 días, hoy=3) que vivía en
// `useViewModel`. Punto 4 de `themes/RETOMAR.md`.

const claseEn = (iso: string): StudioClass => ({
  id: `c-${iso}`, name: 'Reformer', type: 'reformer',
  day: Number(iso.slice(8, 10)), time: '10:00', end: '10:50',
  startsAt: iso, endsAt: iso, duration: '50 min', room: 'Sala 1',
  level: 'Todos los niveles', teacher: 'Ana', cancelHoras: null,
  initial: 'A', seats: 10, plazas: [], description: '', benefits: [],
});

test('la rejilla empieza en lunes y cubre el mes entero', () => {
  // Agosto de 2026 empieza en SÁBADO: el peor relleno por delante.
  const r = rejillaMesPortal(new Date('2026-08-13T10:00:00Z'), [], 13);
  assert.equal(r.month, 'Agosto 2026');
  assert.equal(r.cells[0].fecha, '2026-07-27'); // el lunes anterior al día 1
  assert.equal(r.cells[0].outside, true);
  assert.ok(r.cells.some((c) => c.fecha === '2026-08-01' && !c.outside));
  assert.ok(r.cells.some((c) => c.fecha === '2026-08-31' && !c.outside));
});

test('siempre son semanas completas, y ninguna fila entera de relleno', () => {
  const r = rejillaMesPortal(new Date('2026-08-13T10:00:00Z'), [], 13);
  assert.equal(r.cells.length % 7, 0);
  const filas = Array.from({ length: r.cells.length / 7 }, (_, i) => r.cells.slice(i * 7, i * 7 + 7));
  assert.ok(filas.every((f) => f.some((c) => !c.outside)));
});

test('un mes que empieza en lunes no lleva relleno por delante', () => {
  // Junio de 2026 empieza en lunes.
  const r = rejillaMesPortal(new Date('2026-06-10T10:00:00Z'), [], 10);
  assert.equal(r.cells[0].fecha, '2026-06-01');
  assert.equal(r.cells[0].outside, false);
});

test('⚠️ las marcas casan por FECHA COMPLETA, no por día del mes', () => {
  // El fallo que este pase existe para no repetir: al adaptador le llegan
  // TODAS las sesiones del estudio, y el 13 de septiembre tiene el mismo
  // `day` que el 13 de agosto.
  const r = rejillaMesPortal(new Date('2026-08-13T10:00:00Z'), [
    claseEn('2026-09-13T08:00:00Z'),
  ], 13);
  const trece = r.cells.find((c) => c.fecha === '2026-08-13')!;
  assert.equal(trece.marked, false);
});

test('una clase del propio mes sí marca su día', () => {
  const r = rejillaMesPortal(new Date('2026-08-13T10:00:00Z'), [
    claseEn('2026-08-14T08:00:00Z'),
  ], 13);
  assert.equal(r.cells.find((c) => c.fecha === '2026-08-14')!.marked, true);
});

test('hoy es hoy en la zona del estudio, no en UTC', () => {
  // 23:30 UTC del 13 de agosto ya son las 01:30 del 14 en Madrid.
  const r = rejillaMesPortal(new Date('2026-08-13T23:30:00Z'), [], 1);
  assert.equal(r.cells.find((c) => c.today)!.fecha, '2026-08-14');
});

test('⚠️ el día seleccionado no se marca en el relleno del mes vecino', () => {
  // Sin la guarda, el 1 de septiembre (relleno) saldría seleccionado a la vez
  // que el 1 de agosto.
  const r = rejillaMesPortal(new Date('2026-08-13T10:00:00Z'), [], 1);
  const seleccionadas = r.cells.filter((c) => c.selected);
  assert.equal(seleccionadas.length, 1);
  assert.equal(seleccionadas[0].fecha, '2026-08-01');
});

// ── Plazas de la sala ───────────────────────────────────────────────────────
// El kit reservaba SIEMPRE con `spotId: null`, así que `PortalShell` deja fuera
// la pantalla de Clases en los estudios con plaza fija: un diseño nuevo no
// puede costar funcionalidad. Esta es la capa de datos que lo desbloquea.

const spot = (id: string, salaId: string, fila: number, columna: number, nombre = ''): Spot => ({
  id, salaId, studioId: 's1', numero: columna, nombre, fila, columna, tipo: 'REFORMER' as Spot['tipo'], activo: true,
});
const sesionRef = { id: 'ses-1', salaId: 'sala-1' };

test('sin spots la lista va vacía: este estudio no asigna sitio', () => {
  // ⚠️ Vacío NO es «sala llena»: es «se reserva sin elegir», como hasta ahora.
  assert.deepEqual(plazasDeSesion(sesionRef, undefined, []), []);
  assert.deepEqual(plazasDeSesion(sesionRef, [], []), []);
});

test('solo entran las plazas de SU sala', () => {
  const r = plazasDeSesion(sesionRef, [
    spot('a', 'sala-1', 1, 1), spot('b', 'sala-2', 1, 1),
  ], []);
  assert.deepEqual(r.map((p) => p.id), ['a']);
});

test('el orden es fila, columna y número — el mismo que la hoja de siempre', () => {
  const r = plazasDeSesion(sesionRef, [
    spot('c', 'sala-1', 2, 1), spot('a', 'sala-1', 1, 1), spot('b', 'sala-1', 1, 2),
  ], []);
  assert.deepEqual(r.map((p) => p.id), ['a', 'b', 'c']);
});

test('⚠️ lista de espera y pendiente de aprobación NO bloquean plaza', () => {
  // No ocupan aforo (Fase 2a), así que tampoco pueden reservar un sitio:
  // quien está en la cola todavía no tiene reformer asignado. Contarlas
  // dejaría plazas libres pintadas como cogidas.
  const spots = [spot('a', 'sala-1', 1, 1), spot('b', 'sala-1', 1, 2), spot('c', 'sala-1', 1, 3)];
  const r = plazasDeSesion(sesionRef, spots, [
    { sesionId: 'ses-1', estado: 'CONFIRMADA', spotId: 'a' },
    { sesionId: 'ses-1', estado: 'LISTA_ESPERA', spotId: 'b' },
    { sesionId: 'ses-1', estado: 'PENDIENTE_APROBACION', spotId: 'c' },
  ]);
  assert.deepEqual(r.filter((p) => p.ocupada).map((p) => p.id), ['a']);
});

test('ASISTIDA sí ocupa: la clase ya pasó pero el sitio estuvo cogido', () => {
  const r = plazasDeSesion(sesionRef, [spot('a', 'sala-1', 1, 1)], [
    { sesionId: 'ses-1', estado: 'ASISTIDA', spotId: 'a' },
  ]);
  assert.equal(r[0].ocupada, true);
});

test('una reserva de OTRA sesión no bloquea esta', () => {
  const r = plazasDeSesion(sesionRef, [spot('a', 'sala-1', 1, 1)], [
    { sesionId: 'otra', estado: 'CONFIRMADA', spotId: 'a' },
  ]);
  assert.equal(r[0].ocupada, false);
});

test('una reserva confirmada SIN plaza no bloquea ninguna', () => {
  // Pasa de verdad: el estudio activa plazas con reservas ya hechas sin sitio.
  const r = plazasDeSesion(sesionRef, [spot('a', 'sala-1', 1, 1)], [
    { sesionId: 'ses-1', estado: 'CONFIRMADA', spotId: null },
  ]);
  assert.equal(r[0].ocupada, false);
});

test('el nombre del estudio manda; sin él, el número', () => {
  const r = plazasDeSesion(sesionRef, [
    spot('a', 'sala-1', 1, 1, 'Reformer 1'), spot('b', 'sala-1', 1, 2),
  ], []);
  assert.deepEqual(r.map((p) => p.nombre), ['Reformer 1', '2']);
});
