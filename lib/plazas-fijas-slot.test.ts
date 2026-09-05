import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sesionEncajaEnPlaza, plazasFijasSinSesion, horaInicioLocalDe, normalizarHoraInicio, nombreDiaSemana,
} from './plazas-fijas-slot.ts';
import { franjaLocalDe, hoyEnEstudio } from './utils.ts';
import type { PlazaFija, Sesion } from './types.ts';

// Martes 2026-09-01 07:00 UTC (09:00 en Madrid, horario de verano).
const AHORA = Date.parse('2026-09-01T07:00:00Z');
const DIA_MS = 86_400_000;

const ses = (o: Partial<Sesion> & { id: string; inicio: string }): Sesion => ({
  studioId: 's', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
  fin: o.inicio, aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null, ...o,
} as Sesion);

// La franja local (día/hora) de la sesión de referencia se DERIVA con la misma
// franjaLocalDe que usa el código bajo test — no se asume un offset a mano
// (frágil ante cambio de hora). Mismo patrón que plaza-fija-portal.test.ts.
const MARTES_10_UTC = '2026-09-01T10:00:00Z';
const FRANJA = franjaLocalDe(MARTES_10_UTC);
const HORA = horaInicioLocalDe(MARTES_10_UTC);

const pf = (o: Partial<PlazaFija> & { id: string }): PlazaFija => ({
  studioId: 's', socioId: 'soc-1', diaSemana: FRANJA.dow, horaInicio: HORA, salaId: 'sala-1',
  tipoClaseId: null, spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null,
  estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', ...o,
} as PlazaFija);

/** Sesiones semanales en el slot de referencia durante `semanas` semanas a partir de la referencia. */
function serieSemanal(semanas: number, over: Partial<Sesion> = {}): Sesion[] {
  return Array.from({ length: semanas }, (_, i) => ses({
    id: `ses-${i}`, inicio: new Date(Date.parse(MARTES_10_UTC) + i * 7 * DIA_MS).toISOString(), ...over,
  }));
}

// ── sesionEncajaEnPlaza ──────────────────────────────────────────────────────
test('encaja: misma sala, mismo día local, misma hora local, sin tipo acotado', () => {
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'p' }), ses({ id: 'a', inicio: MARTES_10_UTC })), true);
});

test('no encaja: otra sala', () => {
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'p' }), ses({ id: 'a', inicio: MARTES_10_UTC, salaId: 'sala-2' })), false);
});

test('no encaja: otra hora (30 minutos más tarde)', () => {
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'p' }), ses({ id: 'a', inicio: '2026-09-01T10:30:00Z' })), false);
});

test('no encaja: otro día de la semana', () => {
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'p' }), ses({ id: 'a', inicio: '2026-09-02T10:00:00Z' })), false);
});

test('tipo acotado: encaja solo con ese tipo; sin acotar encaja con cualquiera', () => {
  const acotada = pf({ id: 'p', tipoClaseId: 'tc-1' });
  assert.equal(sesionEncajaEnPlaza(acotada, ses({ id: 'a', inicio: MARTES_10_UTC, tipoClaseId: 'tc-1' })), true);
  assert.equal(sesionEncajaEnPlaza(acotada, ses({ id: 'b', inicio: MARTES_10_UTC, tipoClaseId: 'tc-2' })), false);
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'q' }), ses({ id: 'c', inicio: MARTES_10_UTC, tipoClaseId: 'tc-2' })), true);
});

test('vigencia: fuera del rango no encaja, en los bordes sí (ambos inclusivos)', () => {
  const fecha = hoyEnEstudio(new Date(MARTES_10_UTC));
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'p', vigenciaDesde: fecha, vigenciaHasta: fecha }), ses({ id: 'a', inicio: MARTES_10_UTC })), true);
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'p', vigenciaDesde: '2026-09-02' }), ses({ id: 'a', inicio: MARTES_10_UTC })), false);
  assert.equal(sesionEncajaEnPlaza(pf({ id: 'p', vigenciaHasta: '2026-08-31' }), ses({ id: 'a', inicio: MARTES_10_UTC })), false);
});

test('la hora de la plaza puede venir como HH:MM (formulario) o HH:MM:SS (columna)', () => {
  assert.equal(normalizarHoraInicio('10:00'), '10:00:00');
  assert.equal(normalizarHoraInicio('10:00:00'), '10:00:00');
  const corta = pf({ id: 'p', horaInicio: HORA.slice(0, 5) });
  assert.equal(sesionEncajaEnPlaza(corta, ses({ id: 'a', inicio: MARTES_10_UTC })), true);
});

// ── plazasFijasSinSesion ─────────────────────────────────────────────────────
test('plaza con clases semanales en su slot dentro del horizonte: no es huérfana', () => {
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p' })], serieSemanal(8), AHORA), []);
});

// El bug de origen: el estudio movió la clase (editar serie / arrastrar) y la
// plaza sigue anclada al slot viejo. Hay horario de sobra, pero ninguna sesión
// encaja → huérfana.
test('la clase se movió de hora: la plaza anclada a la hora vieja es huérfana', () => {
  const movidas = serieSemanal(8, { inicio: undefined }).map((s, i) => ({
    ...s, inicio: new Date(Date.parse('2026-09-01T11:00:00Z') + i * 7 * DIA_MS).toISOString(),
  }));
  const huerfanas = plazasFijasSinSesion([pf({ id: 'p' })], movidas, AHORA);
  assert.deepEqual(huerfanas.map(p => p.id), ['p']);
});

test('la clase se movió de sala: huérfana; una plaza en la sala nueva no lo es', () => {
  const enSala2 = serieSemanal(8, { salaId: 'sala-2' });
  const res = plazasFijasSinSesion([pf({ id: 'vieja' }), pf({ id: 'nueva', salaId: 'sala-2' })], enSala2, AHORA);
  assert.deepEqual(res.map(p => p.id), ['vieja']);
});

test('una sesión CANCELADA en el slot cuenta como "la clase existe" (ese caso ya lo avisa el cron a la socia)', () => {
  const canceladas = serieSemanal(8, { cancelada: true });
  // Hace falta alguna sesión no cancelada para que exista "horario programado".
  const otra = ses({ id: 'otra', inicio: '2026-10-10T10:00:00Z', salaId: 'sala-9' });
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p' })], [...canceladas, otra], AHORA), []);
});

test('PAUSADA y BAJA no se reportan', () => {
  const sinSlot = serieSemanal(8, { salaId: 'sala-2' });
  const res = plazasFijasSinSesion([pf({ id: 'a', estado: 'PAUSADA' }), pf({ id: 'b', estado: 'BAJA' })], sinSlot, AHORA);
  assert.deepEqual(res, []);
});

test('vigencia ya terminada: no se reporta', () => {
  const sinSlot = serieSemanal(8, { salaId: 'sala-2' });
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p', vigenciaHasta: '2026-08-31' })], sinSlot, AHORA), []);
});

test('vigencia que empieza más allá de la ventana: no se afirma nada', () => {
  const sinSlot = serieSemanal(8, { salaId: 'sala-2' });
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p', vigenciaDesde: '2026-12-01' })], sinSlot, AHORA), []);
});

// La guardia anti-falso-positivo: un estudio que crea el horario semana a
// semana no tiene sesiones a 6 semanas vista para NADIE, y eso no convierte a
// todas sus plazas en huérfanas.
test('horario programado que no llega a 7 días: no se puede saber, no se reporta', () => {
  const soloTresDias = [ses({ id: 'x', inicio: '2026-09-03T10:00:00Z', salaId: 'sala-2' })];
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p' })], soloTresDias, AHORA), []);
});

test('sin ninguna sesión programada: lista vacía, no todas huérfanas', () => {
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p' })], [], AHORA), []);
});

test('con horario de 2 semanas sin el slot ya se puede afirmar que es huérfana', () => {
  const dosSemanasOtraSala = serieSemanal(2, { salaId: 'sala-2' });
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p' })], dosSemanasOtraSala, AHORA).map(p => p.id), ['p']);
});

test('las sesiones pasadas no cuentan: solo mira hacia delante', () => {
  const pasadas = serieSemanal(8).map((s, i) => ({
    ...s, inicio: new Date(Date.parse(MARTES_10_UTC) - (i + 1) * 7 * DIA_MS).toISOString(),
  }));
  // Y horario futuro en otra sala para que la ventana sea válida.
  const futuro = serieSemanal(4, { salaId: 'sala-2' });
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p' })], [...pasadas, ...futuro], AHORA).map(p => p.id), ['p']);
});

test('el horizonte recorta la búsqueda: una clase que encaja a 10 semanas no salva a la plaza', () => {
  const lejana = ses({ id: 'lejos', inicio: new Date(Date.parse(MARTES_10_UTC) + 10 * 7 * DIA_MS).toISOString() });
  const cerca = serieSemanal(4, { salaId: 'sala-2' });
  assert.deepEqual(plazasFijasSinSesion([pf({ id: 'p' })], [...cerca, lejana], AHORA).map(p => p.id), ['p']);
});

test('nombreDiaSemana: valores de extract(dow) de Postgres', () => {
  assert.equal(nombreDiaSemana(0), 'domingo');
  assert.equal(nombreDiaSemana(1), 'lunes');
  assert.equal(nombreDiaSemana(6), 'sábado');
});
