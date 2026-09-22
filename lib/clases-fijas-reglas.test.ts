import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cupoDeFranja, estadoAlumnaOferta, estadoOferta, etiquetaDuracion, franjaHorariaDe, franjasQueYaTiene, normalizarDuraciones, nuevaVigenciaAmpliar, plazasVencidasQueEstorban, textoFranja,
  plazasLibresDeClaseFija, programadaHasta, resolverFranjas, vigenciaHastaDeDuracion, vigenciaMinDeOferta, type FranjaResuelta, type TarjetaMin,
} from './clases-fijas-reglas.ts';

const franja = (cambios: Partial<FranjaResuelta> = {}): FranjaResuelta => ({
  serieId: 'ser-1', diaSemana: 2, hora: '10:00', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
  proximaSesionId: 'ses-1', ultimaFecha: '2026-12-15', aforo: 8, ocupadas: 0, ...cambios,
});

test('duraciones: se aceptan las cerradas, sin repetidas y de menor a mayor', () => {
  assert.deepEqual(normalizarDuraciones([6, 1, 3, 3]), [1, 3, 6]);
  assert.deepEqual(normalizarDuraciones([12]), [12]);
});

test('duraciones: lo que no es una duración cerrada se rechaza entero, no se «arregla»', () => {
  assert.equal(normalizarDuraciones([]), null);
  assert.equal(normalizarDuraciones('3'), null);
  assert.equal(normalizarDuraciones([3, 13]), null, '13 meses no es una opción');
  assert.equal(normalizarDuraciones([3, 1.5]), null);
  assert.equal(normalizarDuraciones([3, '6']), null);
  assert.equal(normalizarDuraciones([1, 2, 3, 4, 5, 6, 7]), null, 'más de seis opciones');
});

test('hasta cuándo: el mismo día, tantos meses después', () => {
  assert.equal(vigenciaHastaDeDuracion('2026-09-21', 1), '2026-10-21');
  assert.equal(vigenciaHastaDeDuracion('2026-09-21', 3), '2026-12-21');
  assert.equal(vigenciaHastaDeDuracion('2026-09-21', 6), '2027-03-21');
});

test('hasta cuándo: cruza el año', () => {
  assert.equal(vigenciaHastaDeDuracion('2026-11-15', 3), '2027-02-15');
  assert.equal(vigenciaHastaDeDuracion('2026-12-31', 1), '2027-01-31');
  assert.equal(vigenciaHastaDeDuracion('2026-09-21', 12), '2027-09-21');
  assert.equal(vigenciaHastaDeDuracion('2026-09-21', 24), '2028-09-21');
});

test('hasta cuándo: si ese día no existe se queda en el último del mes, no salta al siguiente', () => {
  assert.equal(vigenciaHastaDeDuracion('2026-01-31', 1), '2026-02-28');
  assert.equal(vigenciaHastaDeDuracion('2027-12-31', 2), '2028-02-29', '2028 es bisiesto');
  assert.equal(vigenciaHastaDeDuracion('2026-08-31', 1), '2026-09-30');
  assert.equal(vigenciaHastaDeDuracion('2026-03-31', 6), '2026-09-30');
});

test('hasta cuándo: una fecha o una duración mal formadas no producen una fecha inventada', () => {
  assert.throws(() => vigenciaHastaDeDuracion('21/09/2026', 3));
  assert.throws(() => vigenciaHastaDeDuracion('2026-09-21', 0));
  assert.throws(() => vigenciaHastaDeDuracion('2026-09-21', 1.5));
});

test('etiquetas de duración', () => {
  assert.deepEqual([1, 3, 6, 12, 18, 24].map(etiquetaDuracion), ['1 mes', '3 meses', '6 meses', '1 año', '18 meses', '2 años']);
});

test('cupo: el tope del estudio, y nunca más que el aforo de la clase', () => {
  assert.equal(cupoDeFranja(franja({ aforo: 8 }), null), 8);
  assert.equal(cupoDeFranja(franja({ aforo: 8 }), 5), 5);
  assert.equal(cupoDeFranja(franja({ aforo: 4 }), 10), 4);
});

test('plazas libres: la franja más llena manda', () => {
  const franjas = [franja({ aforo: 8, ocupadas: 2 }), franja({ aforo: 8, ocupadas: 7, diaSemana: 4 })];
  assert.equal(plazasLibresDeClaseFija(franjas, null), 1);
  assert.equal(plazasLibresDeClaseFija(franjas, 6), -1, 'sobre-suscrita: negativo, la oferta está llena');
  assert.equal(plazasLibresDeClaseFija([], null), null);
});

test('estado de la oferta', () => {
  const base = { activa: true, franjasDefinidas: 2, franjas: [franja(), franja({ diaSemana: 4 })], tope: null };
  assert.equal(estadoOferta(base), 'DISPONIBLE');
  assert.equal(estadoOferta({ ...base, activa: false }), 'CERRADA');
  assert.equal(estadoOferta({ ...base, franjas: [franja()] }), 'SIN_CLASES', 'una de sus dos franjas ya no tiene clases');
  assert.equal(estadoOferta({ ...base, franjasDefinidas: 0, franjas: [] }), 'SIN_CLASES');
  assert.equal(estadoOferta({ ...base, franjas: [franja({ ocupadas: 8 }), franja({ diaSemana: 4 })] }), 'COMPLETA');
  assert.equal(estadoOferta({ ...base, tope: 3, franjas: [franja({ ocupadas: 3 }), franja({ diaSemana: 4 })] }), 'COMPLETA');
});

test('una oferta cerrada lo es aunque esté llena o sin clases: manda lo que decidió el estudio', () => {
  assert.equal(estadoOferta({ activa: false, franjasDefinidas: 2, franjas: [], tope: null }), 'CERRADA');
});

test('programada hasta: la fecha más temprana de las últimas clases', () => {
  assert.equal(programadaHasta([franja({ ultimaFecha: '2026-12-15' }), franja({ ultimaFecha: '2026-11-03' })]), '2026-11-03');
  assert.equal(programadaHasta([]), null);
});

const plaza = (cambios: Partial<{ diaSemana: number; horaInicio: string; salaId: string; tipoClaseId: string | null; estado: string; vigenciaHasta: string | null }> = {}) => ({
  diaSemana: 2, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: null, estado: 'ACTIVA', vigenciaHasta: null, ...cambios,
});

test('franjas que ya tiene: casa por hueco, con la hora en HH:MM:SS o HH:MM', () => {
  const franjas = [franja(), franja({ diaSemana: 4, hora: '18:30' })];
  assert.equal(franjasQueYaTiene(franjas, [plaza()], '2026-09-21'), 1);
  assert.equal(franjasQueYaTiene(franjas, [plaza(), plaza({ diaSemana: 4, horaInicio: '18:30' })], '2026-09-21'), 2);
});

test('franjas que ya tiene: una plaza de baja, vencida o de otra sala no cuenta; una en pausa sí', () => {
  const franjas = [franja()];
  assert.equal(franjasQueYaTiene(franjas, [plaza({ estado: 'BAJA' })], '2026-09-21'), 0);
  assert.equal(franjasQueYaTiene(franjas, [plaza({ vigenciaHasta: '2026-09-20' })], '2026-09-21'), 0);
  assert.equal(franjasQueYaTiene(franjas, [plaza({ vigenciaHasta: '2026-09-21' })], '2026-09-21'), 1, 'vale hasta el final de ese día');
  assert.equal(franjasQueYaTiene(franjas, [plaza({ salaId: 'sala-2' })], '2026-09-21'), 0);
  assert.equal(franjasQueYaTiene(franjas, [plaza({ estado: 'PAUSADA' })], '2026-09-21'), 1);
});

test('franjas que ya tiene: una plaza de un tipo concreto solo cubre la franja de ese tipo', () => {
  assert.equal(franjasQueYaTiene([franja({ tipoClaseId: 'tc-1' })], [plaza({ tipoClaseId: 'tc-2' })], '2026-09-21'), 0);
  assert.equal(franjasQueYaTiene([franja({ tipoClaseId: 'tc-1' })], [plaza({ tipoClaseId: 'tc-1' })], '2026-09-21'), 1);
});

test('estado de la alumna respecto a la oferta', () => {
  assert.equal(estadoAlumnaOferta({ franjas: 2, yaTiene: 0, pedida: false }), 'LIBRE');
  assert.equal(estadoAlumnaOferta({ franjas: 2, yaTiene: 0, pedida: true }), 'PEDIDA');
  assert.equal(estadoAlumnaOferta({ franjas: 2, yaTiene: 1, pedida: false }), 'PARCIAL');
  assert.equal(estadoAlumnaOferta({ franjas: 2, yaTiene: 2, pedida: false }), 'LA_TIENE');
  assert.equal(estadoAlumnaOferta({ franjas: 2, yaTiene: 2, pedida: true }), 'LA_TIENE', 'si ya la tiene entera, una petición vieja no manda');
  assert.equal(estadoAlumnaOferta({ franjas: 0, yaTiene: 0, pedida: false }), 'LIBRE');
});

const tarjeta = (cambios: Partial<TarjetaMin> = {}): TarjetaMin => ({
  serieId: 'ser-1', diaSemana: 2, hora: '10:00', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
  proximaSesionId: 'ses-9', ultimaFecha: '2026-12-15', aforo: 8, plazasFijas: [{}, {}], ...cambios,
});

test('resolver franjas: se casa por serie y día, y las plazas que ya tiene la franja son sus ocupadas', () => {
  const r = resolverFranjas([{ serieId: 'ser-1', diaSemana: 2 }], [tarjeta(), tarjeta({ diaSemana: 4 })]);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].hora, r[0].salaId, r[0].proximaSesionId, r[0].ocupadas], ['10:00', 'sala-1', 'ses-9', 2]);
});

test('resolver franjas: una franja sin clases futuras no aparece, y no se inventa', () => {
  const r = resolverFranjas([{ serieId: 'ser-1', diaSemana: 2 }, { serieId: 'ser-borrada', diaSemana: 4 }], [tarjeta()]);
  assert.deepEqual(r.map(f => f.serieId), ['ser-1']);
  assert.equal(estadoOferta({ activa: true, franjasDefinidas: 2, franjas: r, tope: null }), 'SIN_CLASES');
});

test('texto de una franja: día con mayúscula y hora sin segundos', () => {
  assert.equal(textoFranja(2, '10:00'), 'Martes 10:00');
  assert.equal(textoFranja(3, '18:30:00'), 'Miércoles 18:30');
  assert.equal(textoFranja(0, '09:00'), 'Domingo 09:00');
});

test('plazas vencidas que estorban: solo las de la franja que se va a dar, activas o en pausa, con la fecha ya pasada', () => {
  const p = (id: string, cambios: Record<string, unknown> = {}) => ({ id, diaSemana: 2, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: null, estado: 'ACTIVA', vigenciaHasta: '2026-09-01', ...cambios });
  const franjas = [{ diaSemana: 2, horaInicio: '10:00:00', salaId: 'sala-1' }];
  const HOY = '2026-09-21';
  assert.deepEqual(plazasVencidasQueEstorban([p('a'), p('b', { estado: 'PAUSADA' })], franjas, HOY), ['a', 'b']);
  assert.deepEqual(plazasVencidasQueEstorban([p('c', { vigenciaHasta: '2026-09-21' })], franjas, HOY), [], 'vale hasta el final de ese día: no estorba nada que aún vale');
  assert.deepEqual(plazasVencidasQueEstorban([p('d', { vigenciaHasta: null })], franjas, HOY), [], 'sin fecha no vence');
  assert.deepEqual(plazasVencidasQueEstorban([p('e', { estado: 'BAJA' })], franjas, HOY), [], 'una de baja ya no ocupa el hueco');
  assert.deepEqual(plazasVencidasQueEstorban([p('f', { diaSemana: 4 }), p('g', { salaId: 'sala-2' }), p('h', { horaInicio: '18:30:00' })], franjas, HOY), [], 'otra franja: no se toca');
});

test('vigencia mínima de una oferta: la más próxima entre las plazas que cubren TODAS sus franjas', () => {
  const franjas = [{ diaSemana: 2, hora: '10:00', salaId: 'sala-1', tipoClaseId: null }, { diaSemana: 4, hora: '18:30', salaId: 'sala-1', tipoClaseId: null }];
  const p = (dia: number, hora: string, hasta: string | null, cambios: Record<string, unknown> = {}) =>
    ({ diaSemana: dia, horaInicio: hora, salaId: 'sala-1', tipoClaseId: null, estado: 'ACTIVA', vigenciaHasta: hasta, ...cambios });
  assert.equal(vigenciaMinDeOferta(franjas, [p(2, '10:00:00', '2026-12-21'), p(4, '18:30:00', '2026-11-12')], '2026-09-21'), '2026-11-12');
});

test('vigencia mínima: si no la tiene entera, o una de las que la cubren no tiene fecha, no hay nada que avisar', () => {
  const franjas = [{ diaSemana: 2, hora: '10:00', salaId: 'sala-1', tipoClaseId: null }, { diaSemana: 4, hora: '18:30', salaId: 'sala-1', tipoClaseId: null }];
  const p = (dia: number, hora: string, hasta: string | null) => ({ diaSemana: dia, horaInicio: hora, salaId: 'sala-1', tipoClaseId: null, estado: 'ACTIVA', vigenciaHasta: hasta });
  assert.equal(vigenciaMinDeOferta(franjas, [p(2, '10:00:00', '2026-12-21')], '2026-09-21'), null, 'le falta una franja');
  assert.equal(vigenciaMinDeOferta(franjas, [p(2, '10:00:00', '2026-12-21'), p(4, '18:30:00', null)], '2026-09-21'), null, 'una sin fecha, dada a mano');
});

test('ampliar: nunca acorta lo que ya tenía, y mide desde hoy igual que al pedirla por primera vez', () => {
  assert.equal(nuevaVigenciaAmpliar('2026-10-05', '2026-09-21', 3), '2026-12-21', 'la nueva duración manda: llega más lejos');
  assert.equal(nuevaVigenciaAmpliar('2027-06-01', '2026-09-21', 1), '2027-06-01', 'lo que ya tenía llegaba más lejos: no se acorta');
  assert.equal(nuevaVigenciaAmpliar(null, '2026-09-21', 6), '2027-03-21');
});

test('franja horaria: los cuatro cortes, iguales para cualquier estudio', () => {
  assert.equal(franjaHorariaDe('06:00'), 'Mañana');
  assert.equal(franjaHorariaDe('11:59'), 'Mañana');
  assert.equal(franjaHorariaDe('12:00'), 'Mediodía');
  assert.equal(franjaHorariaDe('14:59'), 'Mediodía');
  assert.equal(franjaHorariaDe('15:00'), 'Tarde');
  assert.equal(franjaHorariaDe('17:59'), 'Tarde');
  assert.equal(franjaHorariaDe('18:00'), 'Noche');
  assert.equal(franjaHorariaDe('21:30'), 'Noche');
});
