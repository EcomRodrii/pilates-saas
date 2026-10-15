import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesMarcadas } from '../calendario/confirmar-fechas.ts';
import {
  porQueNoSigue, seriesQueSeEnsenan, creables, diasDeLaPropuesta, diasMarcadosDeSerie, esMes, mesSiguiente, motivoDesmarcada, nombreSerieRepetir,
  planDeCreacion, recuento, seriesMarcadasDeSerie, textoTrasRepetir, tituloRepetir, ultimoDia,
  type PropuestaRepetir, type SerieParaRepetir,
} from './repetir-mes.ts';

test('el mes siguiente y su último día: diciembre pasa de año, febrero tiene 28 o 29', () => {
  assert.equal(mesSiguiente('2026-10'), '2026-11');
  assert.equal(mesSiguiente('2026-12'), '2027-01');
  assert.equal(ultimoDia('2026-11'), '2026-11-30');
  assert.equal(ultimoDia('2027-02'), '2027-02-28');
  assert.equal(ultimoDia('2028-02'), '2028-02-29');
  assert.equal(ultimoDia('2026-12'), '2026-12-31');
  assert.equal(tituloRepetir('2026-12'), 'Repetir diciembre en enero');
  assert.ok(esMes('2026-10') && !esMes('2026-13') && !esMes('2026-1') && !esMes(null));
});

const serie = (over: Partial<SerieParaRepetir>): SerieParaRepetir => ({
  serieId: 's', periodoVisto: 1, tipoClaseId: 't', salaId: 'sala', dias: [2], hora: '18:30',
  fechas: [], bloqueadas: [], desmarcadaPor: null, error: null, sinInstructora: 0, instructoraInactiva: false, ...over,
});

const propuesta: PropuestaRepetir = {
  mes: '2026-11', destino: '2026-12', hoy: '2026-11-20', zona: 'la Comunidad de Madrid',
  festivos: [{ fecha: '2026-12-08', nombre: 'Inmaculada' }, { fecha: '2026-12-07', nombre: 'Lunes siguiente al Día de la Constitución' }],
  abiertos: ['2026-12-07'],
  sueltas: 3, seriesFuera: 0, aniosSinFestivos: [],
  series: [
    // Lunes y martes, con un cierre el 15.
    serie({ serieId: 'a', dias: [1, 2], fechas: ['2026-12-07', '2026-12-08', '2026-12-14', '2026-12-15'],
      bloqueadas: [{ fecha: '2026-12-15', motivo: 'cierre' }] }),
    // Martes.
    serie({ serieId: 'b', fechas: ['2026-12-08', '2026-12-15', '2026-12-22'] }),
    serie({ serieId: 'c', fechas: ['2026-12-09'], desmarcadaPor: 'no_renovar' }),
    serie({ serieId: 'd', fechas: ['2026-12-10'], desmarcadaPor: 'terminada' }),
    serie({ serieId: 'e', fechas: ['2026-12-11'], error: 'El tipo de esta clase está archivado' }),
    serie({ serieId: 'f', fechas: ['2026-12-12'], bloqueadas: [{ fecha: '2026-12-12', motivo: 'ya_existe' }] }),
  ],
};

test('de serie: marcadas las que siguen; fuera «no renovar», terminadas, con error o ya creadas', () => {
  assert.deepEqual([...seriesMarcadasDeSerie(propuesta)].sort(), ['a', 'b']);
  assert.equal(motivoDesmarcada(propuesta.series[2]), 'Marcada «no renovar»');
  assert.equal(motivoDesmarcada(propuesta.series[3]), 'Su última clase del mes fue antes del final: márcala si sigue');
  assert.match(motivoDesmarcada(propuesta.series[4]) ?? '', /archivado/);
  assert.equal(motivoDesmarcada(propuesta.series[5]), 'Ya está creada o no se puede crear');
  assert.equal(motivoDesmarcada(propuesta.series[0]), null);
  assert.deepEqual(creables(propuesta.series[0]), ['2026-12-07', '2026-12-08', '2026-12-14']);
});

test('días: el festivo viene desmarcado; el «abrimos igualmente», marcado', () => {
  const marcados = diasMarcadosDeSerie(propuesta);
  assert.ok(!marcados.has('2026-12-08'), 'Inmaculada, desmarcado');
  assert.ok(marcados.has('2026-12-07'), 'abierto, marcado');
  assert.ok(marcados.has('2026-12-14'));
  const dias = diasDeLaPropuesta(propuesta, seriesMarcadasDeSerie(propuesta));
  assert.deepEqual(dias.find((d) => d.fecha === '2026-12-08'), { fecha: '2026-12-08', clases: 2, festivo: 'Inmaculada', abierto: false });
  assert.ok(!dias.some((d) => d.fecha === '2026-12-15' && d.clases === 2), 'el día cerrado no cuenta la clase bloqueada');
});

test('el recuento del botón es la suma exacta de lo que se pide', () => {
  const plan = planDeCreacion(propuesta, seriesMarcadasDeSerie(propuesta), diasMarcadosDeSerie(propuesta));
  assert.deepEqual(plan, [
    { serieId: 'a', periodoVisto: 1, fechas: ['2026-12-07', '2026-12-14'] },
    { serieId: 'b', periodoVisto: 1, fechas: ['2026-12-15', '2026-12-22'] },
  ]);
  assert.equal(recuento(plan), 4);
  // Desmarcar dos días quita esas dos clases, ni una más.
  const menos = new Set([...diasMarcadosDeSerie(propuesta)].filter((d) => d !== '2026-12-14' && d !== '2026-12-22'));
  assert.equal(recuento(planDeCreacion(propuesta, seriesMarcadasDeSerie(propuesta), menos)), 2);
  // Desmarcar una serie entera la saca del plan.
  assert.deepEqual(planDeCreacion(propuesta, new Set(['b']), diasMarcadosDeSerie(propuesta)).map((s) => s.serieId), ['b']);
});

test('una serie que ya llega más allá del mes no se enseña: solo se cuenta', () => {
  const p = { ...propuesta, series: [...propuesta.series, serie({ serieId: 'g', fechas: [] })] };
  const { visibles, yaCubiertas } = seriesQueSeEnsenan(p);
  assert.equal(yaCubiertas, 1);
  assert.ok(!visibles.some((s) => s.serieId === 'g'));
  assert.ok(visibles.some((s) => s.serieId === 'e'), 'la de error sí, para decir por qué');
});

test('el nombre de la serie, con sus días de lunes a domingo', () => {
  const nombre = nombreSerieRepetir({ dias: [4, 2], hora: '18:30:00', tipoClaseId: 't', salaId: 'x' }, () => 'Reformer', () => 'Sala 1');
  assert.equal(nombre, 'Reformer · martes y jueves 18:30 · Sala 1');
  assert.equal(nombreSerieRepetir({ dias: [0, 1, 3], hora: '09:00', tipoClaseId: null, salaId: null }, () => undefined, () => undefined),
    'Clase · lunes, miércoles y domingo 09:00 · Sala');
});

const res = (o: Partial<Parameters<typeof textoTrasRepetir>[0]>) =>
  ({ creadas: 0, pedidas: 0, fallidas: 0, pedidasFallidas: 0, sinInstructora: 0, ids: [], primeraFecha: null, ...o });

test('el texto final dice lo que pasó, también a medias', () => {
  assert.equal(textoTrasRepetir(res({ creadas: 16, pedidas: 16, primeraFecha: '2026-12-01' }), '2026-12'), '16 clases creadas en diciembre');
  // Con una serie marcada a mano que paró antes: también los días que le quedaban.
  assert.equal(textoTrasRepetir(res({ creadas: 5, pedidas: 5, primeraFecha: '2026-10-30' }), '2026-11'), '5 clases creadas en octubre y noviembre');
  assert.equal(textoTrasRepetir(res({ creadas: 5, pedidas: 5, primeraFecha: '2026-12-30' }), '2027-01'), '5 clases creadas en diciembre y enero');
  assert.equal(textoTrasRepetir(res({ creadas: 1, pedidas: 1 }), '2026-12'), '1 clase creada en diciembre');
  // Falla una serie de 3 fechas y las 9 creadas son todas las demás: no se inventa un «otras ya estaban».
  assert.equal(textoTrasRepetir(res({ creadas: 9, pedidas: 12, fallidas: 1, pedidasFallidas: 3 }), '2026-12'),
    '9 de 12 clases creadas en diciembre · una clase semanal no se ha podido repetir');
  assert.equal(textoTrasRepetir(res({ creadas: 8, pedidas: 12, fallidas: 1, pedidasFallidas: 3 }), '2026-12'),
    '8 de 12 clases creadas en diciembre · una clase semanal no se ha podido repetir · otras ya estaban, la sala estaba ocupada o ese día está cerrado');
  assert.match(textoTrasRepetir(res({ creadas: 0, pedidas: 4 }), '2026-12'), /^No se ha creado ninguna clase en diciembre/);
});

test('el texto final avisa de las clases que quedan sin instructora', () => {
  assert.equal(textoTrasRepetir(res({ creadas: 4, pedidas: 4, sinInstructora: 2 }), '2026-12'),
    '4 clases creadas en diciembre · 2 quedan sin instructora: asígnalas en el calendario');
  assert.match(textoTrasRepetir(res({ creadas: 4, pedidas: 4, sinInstructora: 1 }), '2026-12'), /1 queda sin instructora: asígnala/);
});

test('«terminó antes de acabar el mes» no confunde un festivo o un día cerrado con un final', () => {
  const festivos = new Set(['2026-12-25']);
  // Solo viernes; la última clase el 18 y el 25 es Navidad: no terminó.
  assert.equal(porQueNoSigue({ fechas: ['2026-12-25', '2027-01-01'], bloqueadas: [] }, '2026-12-31', festivos), null);
  // El 25 cerrado (cierre) también cuenta como «ese día no hubo clase».
  assert.equal(porQueNoSigue({ fechas: ['2026-12-25'], bloqueadas: [{ fecha: '2026-12-25', motivo: 'cierre' }] }, '2026-12-31', new Set()), null);
  // La última clase el 11: falta el 18, que no es festivo. Terminó.
  assert.equal(porQueNoSigue({ fechas: ['2026-12-18', '2026-12-25'], bloqueadas: [] }, '2026-12-31', festivos), 'terminada');
  // Sigue hasta fin de mes: sus fechas empiezan en el mes siguiente.
  assert.equal(porQueNoSigue({ fechas: ['2027-01-08'], bloqueadas: [] }, '2026-12-31', festivos), null);
  // Un día que ya pasó cuenta como libre: ahí pudo haber clase y no la hubo.
  assert.equal(porQueNoSigue({ fechas: ['2026-12-18'], bloqueadas: [{ fecha: '2026-12-18', motivo: 'pasada' }] }, '2026-12-31', festivos), 'terminada');
});

test('si otra clase ocupa su hueco a final de mes no dice «terminó»: lo dice como es, y sigue desmarcada', () => {
  // Viernes 18:30 en la Sala 1; el 30-oct se borró y hay un taller a esa hora.
  const ocupada = { fechas: ['2026-10-30', '2026-11-06'], bloqueadas: [{ fecha: '2026-10-30', motivo: 'ya_existe' as const }] };
  assert.equal(porQueNoSigue(ocupada, '2026-10-31', new Set()), 'hueco_ocupado');
  assert.equal(porQueNoSigue({ ...ocupada, bloqueadas: [{ fecha: '2026-10-30', motivo: 'sala_ocupada' as const }] }, '2026-10-31', new Set()), 'hueco_ocupado');
  // Ocupada una semana y libre la otra: ahí sí pudo haber clase. Terminó.
  assert.equal(porQueNoSigue({ fechas: ['2026-10-23', '2026-10-30'], bloqueadas: [{ fecha: '2026-10-23', motivo: 'ya_existe' }] }, '2026-10-31', new Set()), 'terminada');
  // Ocupada + cierre: lo que falta es otra clase y un día cerrado.
  assert.equal(porQueNoSigue({ fechas: ['2026-10-23', '2026-10-30'], bloqueadas: [{ fecha: '2026-10-23', motivo: 'cierre' }, { fecha: '2026-10-30', motivo: 'ya_existe' }] }, '2026-10-31', new Set()), 'hueco_ocupado');
  // El motivo se ve, y no es el de «terminó».
  const s = serie({ serieId: 'x', fechas: ocupada.fechas, desmarcadaPor: 'hueco_ocupado' });
  assert.match(motivoDesmarcada(s) ?? '', /otra clase ocupa su hora y su sala/);
  assert.doesNotMatch(motivoDesmarcada(s) ?? '', /[Tt]ermin/);
});

test('el botón cuenta exactamente lo que se manda', () => {
  const series = seriesMarcadasDeSerie(propuesta);
  for (const dias of [diasMarcadosDeSerie(propuesta), new Set<string>(), new Set(['2026-12-14', '2026-12-08'])]) {
    const fechas = diasDeLaPropuesta(propuesta, series).map((d) => ({ fecha: d.fecha, clases: d.clases, festivo: d.festivo }));
    assert.equal(clasesMarcadas(fechas, dias), recuento(planDeCreacion(propuesta, series, dias)));
  }
});
