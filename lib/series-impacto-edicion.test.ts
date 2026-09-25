import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularImpactoEdicionSerie, cambiosPorClase, lineasDeImpacto, tituloDeEdicion,
  type EdicionDeSerie, type ReservaDeImpacto, type SesionDeSerie,
} from './series-impacto-edicion.ts';
import { franjaLocalDe } from './utils.ts';
import { horaInicioLocalDe } from './plazas-fijas-slot.ts';
import type { PlazaFija } from './types.ts';

// Martes 2026-09-01 10:00 UTC = 12:00 en Madrid (verano). Serie semanal de 4.
const MARTES = '2026-09-01T10:00:00Z';
const DIA_MS = 86_400_000;
const FRANJA = franjaLocalDe(MARTES);
const HORA = horaInicioLocalDe(MARTES); // la hora LOCAL de la serie, derivada con el mismo código que los tests de plazas

const clase = (i: number, o: Partial<SesionDeSerie> = {}): SesionDeSerie => ({
  id: `s${i}`, inicio: new Date(Date.parse(MARTES) + i * 7 * DIA_MS).toISOString(),
  salaId: 'sala-1', tipoClaseId: 'tc-1', instructorId: 'ins-1', aforoMaximo: 8, cancelada: false, notas: null, ...o,
});
const tramo = (n = 4, o: Partial<SesionDeSerie> = {}) => Array.from({ length: n }, (_, i) => clase(i, o));

/** El formulario tal cual está: no cambia nada. */
const igual: EdicionDeSerie = {
  tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', aforoMaximo: 8,
  horaInicio: '12:00', horaFin: '13:00', notas: null,
};

const res = (id: string, sesionId: string, socioId: string, estado = 'CONFIRMADA'): ReservaDeImpacto => ({ id, sesionId, socioId, estado });
const plaza = (socioId: string, o: Partial<PlazaFija> = {}): PlazaFija => ({
  id: `pf-${socioId}`, studioId: 's', socioId, diaSemana: FRANJA.dow, horaInicio: HORA, salaId: 'sala-1',
  tipoClaseId: null, spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null,
  estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', ...o,
} as PlazaFija);

const calcular = (over: {
  tramo?: SesionDeSerie[]; edicion?: Partial<EdicionDeSerie>; reservas?: ReservaDeImpacto[];
  plazasFijas?: PlazaFija[]; recuperaciones?: { estado: 'USADA' | 'DISPONIBLE'; usadaEnReservaId: string | null }[];
} = {}) => calcularImpactoEdicionSerie({
  tramo: over.tramo ?? tramo(),
  edicion: { ...igual, ...over.edicion },
  reservas: over.reservas ?? [],
  plazasFijas: over.plazasFijas ?? [],
  recuperaciones: over.recuperaciones ?? [],
});

test('sin tocar nada no cambia nada, y así se dice', () => {
  const i = calcular({ reservas: [res('r1', 's0', 'ana')] });
  assert.equal(i.sinCambios, true);
  assert.equal(i.clases, 4);
  assert.deepEqual(lineasDeImpacto(i), [{ tono: 'calma', texto: 'Estas clases ya tienen estos datos: no cambia nada.' }]);
});

test('cambiar la hora: cada reserva confirmada cambia y cada alumna recibe UN aviso', () => {
  // Ana está en las 4 clases, Marta solo en la 3.ª, Lucía en la 1.ª y en la 2.ª.
  const reservas = [
    ...[0, 1, 2, 3].map(i => res(`a${i}`, `s${i}`, 'ana')),
    res('m2', 's2', 'marta'),
    res('l0', 's0', 'lucia'), res('l1', 's1', 'lucia'),
  ];
  const i = calcular({ edicion: { horaInicio: '13:00', horaFin: '14:00' }, reservas });
  assert.equal(i.cambian.hora, 4);
  assert.equal(i.reservasAfectadas, 7);
  assert.equal(i.alumnasAvisadas, 3, 'tres alumnas distintas, no siete avisos');
  const l = lineasDeImpacto(i).map(x => x.texto);
  assert.ok(l.includes('7 reservas confirmadas cambian de hora.'));
  assert.ok(l.includes('Se avisará a 3 alumnas, una sola vez a cada una aunque cambien varias de sus clases.'));
});

test('SOLO las reservas confirmadas cuentan: la lista de espera no recibe aviso, pero se dice', () => {
  const reservas = [
    res('a0', 's0', 'ana'),
    res('e0', 's0', 'berta', 'LISTA_ESPERA'), res('e1', 's1', 'berta', 'LISTA_ESPERA'), res('e2', 's1', 'carla', 'LISTA_ESPERA'),
    res('c0', 's1', 'dora', 'CANCELADA'), res('p0', 's1', 'eva', 'PENDIENTE_APROBACION'),
  ];
  const i = calcular({ edicion: { horaInicio: '13:00', horaFin: '14:00' }, reservas });
  assert.equal(i.reservasAfectadas, 1);
  assert.equal(i.alumnasAvisadas, 1);
  assert.equal(i.enEspera, 2, 'Berta cuenta una vez aunque espere en dos clases');
  assert.ok(lineasDeImpacto(i).some(x => x.texto === '2 personas en lista de espera de estas clases (no reciben aviso).'));
});

test('una clase cancelada del tramo no aporta reservas ni avisos', () => {
  const t = tramo(4); t[1] = clase(1, { cancelada: true });
  const i = calcular({
    tramo: t, edicion: { horaInicio: '13:00', horaFin: '14:00' },
    reservas: [res('a1', 's1', 'ana'), res('a2', 's2', 'ana')],
  });
  assert.equal(i.clases, 4, 'cuenta como clase del tramo, igual que el toast');
  assert.equal(i.reservasAfectadas, 1);
});

test('cambiar solo la instructora avisa; cambiar solo aforo o notas NO', () => {
  const reservas = [res('a0', 's0', 'ana'), res('m1', 's1', 'marta')];
  const instr = calcular({ edicion: { instructorId: 'ins-2' }, reservas });
  assert.equal(instr.alumnasAvisadas, 2);
  assert.ok(lineasDeImpacto(instr).some(x => x.texto === '2 reservas confirmadas cambian de instructora.'));

  const aforo = calcular({ edicion: { aforoMaximo: 10 }, reservas });
  assert.equal(aforo.alumnasAvisadas, 0);
  assert.equal(aforo.reservasAfectadas, 0);
  assert.deepEqual(lineasDeImpacto(aforo), [{ tono: 'calma', texto: 'Este cambio no genera avisos a las alumnas.' }]);

  const notas = calcular({ edicion: { notas: 'Traer calcetines' }, reservas });
  assert.equal(notas.cambian.notas, 4);
  assert.equal(notas.alumnasAvisadas, 0);
});

test('varios cambios a la vez se enumeran: «hora y sala», «hora, sala e instructora»', () => {
  const reservas = [res('a0', 's0', 'ana')];
  const dos = lineasDeImpacto(calcular({ edicion: { horaInicio: '13:00', horaFin: '14:00', salaId: 'sala-2' }, reservas }));
  assert.ok(dos.some(x => x.texto === '1 reserva confirmada cambia de hora y sala.'));
  const tres = lineasDeImpacto(calcular({ edicion: { horaInicio: '13:00', horaFin: '14:00', salaId: 'sala-2', instructorId: 'ins-2' }, reservas }));
  assert.ok(tres.some(x => x.texto === '1 reserva confirmada cambia de hora, sala e instructora.'));
});

test('con avisos y nadie apuntada, lo dice en vez de callar', () => {
  const i = calcular({ edicion: { horaInicio: '13:00', horaFin: '14:00' } });
  assert.deepEqual(lineasDeImpacto(i), [{ tono: 'calma', texto: 'Ninguna alumna está apuntada a estas clases: no se avisa a nadie.' }]);
});

test('plazas fijas: cuenta alumnas (no plazas), y dice que se mueven solo si cambia hora o sala', () => {
  const plazasFijas = [
    plaza('ana'), plaza('ana', { id: 'pf-ana-2' }), // dos plazas de la misma alumna = una alumna
    plaza('bea', { estado: 'PAUSADA' }),
    plaza('cris', { estado: 'BAJA' }),               // de baja: no cuenta
    plaza('dani', { salaId: 'sala-9' }),             // otra sala: no es de esta serie
  ];
  const hora = calcular({ edicion: { horaInicio: '13:00', horaFin: '14:00' }, plazasFijas });
  assert.equal(hora.alumnasConPlazaFija, 2);
  assert.ok(lineasDeImpacto(hora).some(x => x.texto === '2 alumnas tienen plaza fija en estas clases: su plaza se mueve con la serie.'));

  const aforo = calcular({ edicion: { aforoMaximo: 10 }, plazasFijas });
  assert.ok(lineasDeImpacto(aforo).some(x => x.texto === '2 alumnas tienen plaza fija en estas clases.'), 'sin cambio de hora ni sala no se dice que se mueva');
});

test('plaza fija con vigencia terminada antes de la serie: no cuenta', () => {
  const i = calcular({ plazasFijas: [plaza('ana', { vigenciaHasta: '2026-08-01' })] });
  assert.equal(i.alumnasConPlazaFija, 0);
});

test('recuperaciones: cuenta las reservas hechas gastando una, solo en clases afectadas', () => {
  const reservas = [res('a0', 's0', 'ana'), res('b1', 's1', 'bea'), res('c2', 's2', 'cris')];
  const recuperaciones = [
    { estado: 'USADA' as const, usadaEnReservaId: 'a0' },
    { estado: 'USADA' as const, usadaEnReservaId: 'c2' },
    { estado: 'USADA' as const, usadaEnReservaId: 'otra-clase-fuera' },
    { estado: 'DISPONIBLE' as const, usadaEnReservaId: null },
  ];
  const i = calcular({ edicion: { horaInicio: '13:00', horaFin: '14:00' }, reservas, recuperaciones });
  assert.equal(i.reservasConRecuperacion, 2);
  assert.ok(lineasDeImpacto(i).some(x => x.texto === '2 reservas se hicieron gastando una recuperación.'));
});

test('bajar el aforo: avisa de las clases que quedan por encima del cupo', () => {
  const reservas = ['a', 'b', 'c', 'd', 'e'].map((s, k) => res(`r${k}`, 's0', s)); // 5 confirmadas en la 1.ª
  const i = calcular({ edicion: { aforoMaximo: 4 }, reservas });
  assert.equal(i.clasesSobreAforo, 1);
  assert.ok(lineasDeImpacto(i).some(x => x.tono === 'aviso' && x.texto === 'Con el aforo en 4, en 1 clase hay más confirmadas que plazas. No se mueven a lista de espera solas.'));
  // Subirlo, o dejarlo igual, no avisa de nada.
  assert.equal(calcular({ edicion: { aforoMaximo: 10 }, reservas }).clasesSobreAforo, 0);
  assert.equal(calcular({ reservas }).clasesSobreAforo, 0);
});

test('una hora vacía no lanza: se trata como «la hora no cambia»', () => {
  // Un <input type="time"> borrado da '' y horaParedAInstante devolvería una fecha inválida.
  const i = calcular({ edicion: { horaInicio: '', horaFin: '' }, reservas: [res('a0', 's0', 'ana')] });
  assert.equal(i.cambian.hora, 0);
  assert.equal(i.sinCambios, true);
});

test('el cambio de horario de verano: la hora es de pared, no un desplazamiento fijo', () => {
  // La serie cruza el cambio de hora (25-oct-2026). 12:00 Madrid es 10:00 UTC antes y 11:00 UTC después.
  const t = [
    clase(0, { inicio: '2026-10-20T10:00:00Z' }),
    clase(1, { inicio: '2026-10-27T11:00:00Z' }),
  ];
  const i = calcular({ tramo: t, edicion: { horaInicio: '12:00', horaFin: '13:00' } });
  assert.equal(i.cambian.hora, 0, 'ya están a las 12:00 locales las dos: no cambia');
  assert.equal(calcular({ tramo: t, edicion: { horaInicio: '13:00', horaFin: '14:00' } }).cambian.hora, 2);
});

test('el título y la enumeración', () => {
  assert.equal(tituloDeEdicion(1), '¿Guardar los cambios en 1 clase?');
  assert.equal(tituloDeEdicion(14), '¿Guardar los cambios en 14 clases?');
});

test('el ejemplo del informe: 14 clases, con todo lo que conlleva', () => {
  const t = tramo(14);
  const reservas: ReservaDeImpacto[] = [];
  const alumnas = Array.from({ length: 6 }, (_, k) => `a${k}`);
  let n = 0;
  for (const s of t) for (const a of alumnas.slice(0, 4)) reservas.push(res(`r${n++}`, s.id, a));
  reservas.push(res('e', t[0].id, 'espera1', 'LISTA_ESPERA'), res('f', t[3].id, 'a5'));
  const i = calcular({
    tramo: t, edicion: { horaInicio: '13:00', horaFin: '14:00' }, reservas,
    plazasFijas: [plaza('a0'), plaza('a1')], recuperaciones: [{ estado: 'USADA', usadaEnReservaId: 'r0' }],
  });
  assert.equal(i.clases, 14);
  assert.equal(i.reservasAfectadas, 57);
  assert.equal(i.alumnasAvisadas, 5);
  assert.deepEqual(lineasDeImpacto(i).map(x => x.texto), [
    '57 reservas confirmadas cambian de hora.',
    'Se avisará a 5 alumnas, una sola vez a cada una aunque cambien varias de sus clases.',
    '2 alumnas tienen plaza fija en estas clases: su plaza se mueve con la serie.',
    '1 persona en lista de espera de estas clases (no reciben aviso).',
    '1 reserva se hizo gastando una recuperación.',
  ]);
});

test('el formato en que la BASE devuelve el inicio (+00:00) NO cuenta como cambio de hora', () => {
  // Regresión: `editarSerie` comparaba texto y `…+00:00` nunca es igual a `…000Z`, así que
  // TODAS las clases parecían cambiar de hora en cada edición y se avisaba a todas las alumnas.
  const t = [clase(0, { inicio: '2026-09-01T10:00:00+00:00' }), clase(1, { inicio: '2026-09-08T10:00:00.000Z' })];
  const soloAforo = cambiosPorClase(t, { ...igual, aforoMaximo: 12 });
  assert.deepEqual(soloAforo.map(c => [c.hora, c.sala, c.instructora, c.avisa]), [[false, false, false, false], [false, false, false, false]]);
  const i = calcular({ tramo: t, edicion: { aforoMaximo: 12 }, reservas: [res('a', 's0', 'ana'), res('b', 's1', 'bea')] });
  assert.equal(i.cambian.hora, 0);
  assert.equal(i.alumnasAvisadas, 0, 'un cambio de aforo no avisa a nadie');
});

test('cambiosPorClase da, por clase, el nuevo inicio y qué cambia', () => {
  const [a, b] = cambiosPorClase([clase(0), clase(1, { instructorId: 'ins-2' })], { ...igual, horaInicio: '13:00', horaFin: '14:00', instructorId: 'ins-2' });
  assert.deepEqual([a.hora, a.sala, a.instructora, a.avisa], [true, false, true, true]);
  assert.deepEqual([b.hora, b.sala, b.instructora, b.avisa], [true, false, false, true], 'la 2.ª ya tenía a la instructora nueva (una sustitución)');
  assert.equal(a.nuevoInicio, '2026-09-01T11:00:00.000Z', '13:00 Madrid en septiembre = 11:00 UTC');
});
