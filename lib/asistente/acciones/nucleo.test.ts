import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararCita, prepararClase, prepararEvento, prepararSala, resolverPorNombre, zCita, zClase, zEvento, zSala,
  type CatalogoClase, type CatalogoCita,
} from './nucleo.ts';

// 2026-10-06 12:00 en Madrid (UTC+2): martes.
const AHORA = Date.parse('2026-10-06T10:00:00Z');
const HOY = '2026-10-06';

const cat = (o: Partial<CatalogoClase> = {}): CatalogoClase => ({
  tipos: [{ id: 't1', nombre: 'Reformer', duracionMin: 55, aforo: 8, archivado: false }, { id: 't2', nombre: 'Mat', duracionMin: 60, aforo: null, archivado: false }, { id: 't3', nombre: 'Viejo', duracionMin: 60, aforo: null, archivado: true }],
  salas: [{ id: 's1', nombre: 'Sala Grande', capacidad: 10 }, { id: 's2', nombre: 'Sala Pequeña', capacidad: 6 }],
  instructora: { id: 'i1', activa: true }, existentes: [], bloqueosInstructora: [], cierres: [], horario: {},
  marcaInstructora: id => `[EQUIPO_${id.slice(1)}]`, ...o,
});
const clase = { tipo_clase: 'Reformer', fecha: '2026-10-07', hora: '18:00', sala: 'sala grande', instructora: '[EQUIPO_1]', aforo: 0 };

test('clase: caso feliz, hora de Madrid, aforo del tipo y marcas en vez de nombres', () => {
  const r = prepararClase(clase, cat(), AHORA, HOY);
  assert.ok(r.ok);
  assert.equal(r.payload.inicio, '2026-10-07T16:00:00.000Z');
  assert.equal(r.payload.fin, '2026-10-07T16:55:00.000Z');
  assert.equal(r.payload.aforo, 8);
  assert.match(r.resumen, /miércoles 7 de octubre/);
  assert.match(r.resumen, /18:00–18:55/);
  assert.ok(r.lineas.some(l => l.valor === '[EQUIPO_1]'));
});

test('clase: fecha pasada, medianoche y demasiado lejos', () => {
  assert.match((prepararClase({ ...clase, fecha: '2026-10-05' }, cat(), AHORA, HOY) as { error: string }).error, /ya ha pasado/);
  assert.match((prepararClase({ ...clase, fecha: '2026-10-06', hora: '11:00' }, cat(), AHORA, HOY) as { error: string }).error, /ya ha pasado/);
  assert.match((prepararClase({ ...clase, hora: '23:30' }, cat(), AHORA, HOY) as { error: string }).error, /medianoche/);
  assert.match((prepararClase({ ...clase, fecha: '2027-12-01' }, cat(), AHORA, HOY) as { error: string }).error, /antelación/);
  assert.match((prepararClase({ ...clase, fecha: '2026-02-30' }, cat(), AHORA, HOY) as { error: string }).error, /no existen/);
});

test('clase: no inventa tipos ni salas: dice cuáles hay, y un tipo archivado no vale', () => {
  const t = prepararClase({ ...clase, tipo_clase: 'Pilates acuático' }, cat(), AHORA, HOY) as { ok: false; error: string };
  assert.match(t.error, /Reformer, Mat/);
  assert.doesNotMatch(t.error, /Viejo/);
  assert.match((prepararClase({ ...clase, tipo_clase: 'Viejo' }, cat(), AHORA, HOY) as { error: string }).error, /No hay/);
  assert.match((prepararClase({ ...clase, sala: 'Azotea' }, cat(), AHORA, HOY) as { error: string }).error, /Sala Grande, Sala Pequeña/);
  assert.match((prepararClase({ ...clase, sala: 'sala' }, cat(), AHORA, HOY) as { error: string }).error, /varias salas/);
});

test('clase: aforo mayor que la sala, sala ocupada, instructora ocupada, ausente y cierre del centro', () => {
  assert.match((prepararClase({ ...clase, sala: 'Sala Pequeña', aforo: 9 }, cat(), AHORA, HOY) as { error: string }).error, /6 plazas/);
  const ocupa = { id: 'x', salaId: 's1', instructorId: 'i9', inicio: '2026-10-07T15:30:00.000Z', fin: '2026-10-07T16:30:00.000Z' };
  assert.match((prepararClase(clase, cat({ existentes: [ocupa] }), AHORA, HOY) as { error: string }).error, /Sala Grande ya está ocupada de 17:30–18:30/);
  const suya = { ...ocupa, salaId: 's2', instructorId: 'i1' };
  assert.match((prepararClase(clase, cat({ existentes: [suya] }), AHORA, HOY) as { error: string }).error, /instructora ya da clase/);
  assert.match((prepararClase(clase, cat({ bloqueosInstructora: [{ horaInicio: null, horaFin: null }] }), AHORA, HOY) as { error: string }).error, /no está disponible/);
  assert.ok(prepararClase(clase, cat({ bloqueosInstructora: [{ horaInicio: '09:00:00', horaFin: '12:00:00' }] }), AHORA, HOY).ok);
  assert.match((prepararClase(clase, cat({ cierres: [{ id: 'c', desde: '2026-10-07', hasta: '2026-10-09', motivo: 'Vacaciones' }] }), AHORA, HOY) as { error: string }).error, /cerrado ese día \(Vacaciones\)/);
});

test('clase: una clase cancelada no choca; sin instructora se avisa; fuera de horario avisa sin impedir', () => {
  const cancelada = { id: 'x', salaId: 's1', instructorId: 'i1', inicio: '2026-10-07T16:00:00.000Z', fin: '2026-10-07T17:00:00.000Z', cancelada: true };
  assert.ok(prepararClase(clase, cat({ existentes: [cancelada] }), AHORA, HOY).ok);
  const sin = prepararClase({ ...clase, instructora: '' }, cat({ instructora: null }), AHORA, HOY);
  assert.ok(sin.ok && sin.payload.instructorId === null && sin.avisos.some(a => /sin instructora/i.test(a)));
  const fuera = prepararClase(clase, cat({ horario: { apertura: '09:00', cierre: '14:00' } }), AHORA, HOY);
  assert.ok(fuera.ok && fuera.avisos.some(a => /cierra a las 14:00/.test(a)));
});

test('clase: una marca que no es una persona concreta se pregunta', () => {
  assert.match((prepararClase({ ...clase, instructora: '[PERSONA_1]' }, cat({ instructora: 'ambigua' }), AHORA, HOY) as { error: string }).error, /No sé a qué instructora/);
  assert.match((prepararClase(clase, cat({ instructora: { id: 'i1', activa: false } }), AHORA, HOY) as { error: string }).error, /no está activa/);
});

test('sala: valida y no repite nombre; el color sale de la paleta', () => {
  const r = prepararSala({ nombre: ' Sala  Nueva ', capacidad: 8 }, [{ nombre: 'A' }, { nombre: 'B' }]);
  assert.ok(r.ok && r.payload.nombre === 'Sala Nueva' && r.payload.color === '#8FC98A');
  assert.match((prepararSala({ nombre: 'sala nueva', capacidad: 8 }, [{ nombre: 'Sala Nueva' }]) as { error: string }).error, /Ya existe/);
  assert.match((prepararSala({ nombre: '  ', capacidad: 8 }, []) as { error: string }).error, /Falta el nombre/);
  assert.equal(zSala.safeParse({ nombre: 'x', capacidad: 0 }).success, false);
  assert.equal(zSala.safeParse({ nombre: 'x', capacidad: 8, extra: 1 }).success, false);
});

test('evento: avisa a las alumnas, no publica nombres de alumnas y sí el del equipo', () => {
  const nombres = (m: string) => (m === 'EQUIPO_1' ? 'Marta' : null);
  const r = prepararEvento({ texto: 'Taller con [EQUIPO_1] de respiración', fecha: '2026-10-10', hora: '11:00', aforo: 12, lugar: '' }, AHORA, HOY, nombres);
  assert.ok(r.ok);
  assert.equal(r.payload.texto, 'Taller con Marta de respiración');
  assert.equal(r.payload.aforo, 12);
  assert.match(r.efecto ?? '', /avisa a todas las alumnas/);
  const mal = prepararEvento({ texto: 'Taller para [ALUMNA_1]', fecha: '2026-10-10', hora: '11:00', aforo: 0, lugar: '' }, AHORA, HOY, nombres);
  assert.ok(!mal.ok);
  assert.match((prepararEvento({ texto: 'Hola', fecha: '2026-10-10', hora: '11:00', aforo: 0, lugar: '' }, AHORA, HOY, nombres) as { error: string }).error, /Falta el texto/);
  const sinLimite = prepararEvento({ texto: 'Masterclass de verano', fecha: '2026-10-10', hora: '11:00', aforo: 0, lugar: 'Terraza' }, AHORA, HOY, nombres);
  assert.ok(sinLimite.ok && sinLimite.payload.aforo === null && sinLimite.payload.lugar === 'Terraza');
  assert.equal(zEvento.safeParse({ texto: 'x'.repeat(281), fecha: '2026-10-10', hora: '11:00', aforo: 0, lugar: '' }).success, false);
});

const citaCat = (o: Partial<CatalogoCita> = {}): CatalogoCita => ({
  socia: { id: 'soc-1' }, instructora: { id: 'i1', activa: true }, ocupada: [], bloqueosInstructora: [], cierres: [],
  marcaSocia: () => '[ALUMNA_3]', marcaInstructora: () => '[EQUIPO_1]', ...o,
});
const cita = { alumna: '[ALUMNA_3]', instructora: '[EQUIPO_1]', fecha: '2026-10-08', hora: '10:00', duracion_min: 0, tipo: 'valoracion' as const };

test('cita: caso feliz sin precio; el modelo solo ve marcas; la persona es un id', () => {
  const r = prepararCita(cita, citaCat(), AHORA, HOY);
  assert.ok(r.ok);
  assert.equal(r.payload.socioId, 'soc-1');
  assert.equal(r.payload.tipo, 'EVALUACION');
  assert.equal(r.payload.fin, '2026-10-08T09:00:00.000Z');
  assert.match(r.resumen, /\[ALUMNA_3\].*\[EQUIPO_1\]/);
  assert.ok(!('precio' in r.payload));
  assert.match(r.avisos.join(' '), /sin precio ni cobro/);
});

test('cita: alumna ambigua o desconocida, instructora ocupada o ausente', () => {
  assert.match((prepararCita(cita, citaCat({ socia: 'ambigua' }), AHORA, HOY) as { error: string }).error, /varias/);
  assert.match((prepararCita(cita, citaCat({ socia: null }), AHORA, HOY) as { error: string }).error, /No encuentro/);
  assert.match((prepararCita(cita, citaCat({ instructora: null }), AHORA, HOY) as { error: string }).error, /Falta la instructora/);
  assert.match((prepararCita(cita, citaCat({ ocupada: [{ inicio: '2026-10-08T08:30:00.000Z', fin: '2026-10-08T09:30:00.000Z' }] }), AHORA, HOY) as { error: string }).error, /ya tiene algo de 10:30–11:30/);
  assert.match((prepararCita(cita, citaCat({ bloqueosInstructora: [{ horaInicio: null, horaFin: null }] }), AHORA, HOY) as { error: string }).error, /no está disponible/);
  assert.equal(zCita.safeParse({ ...cita, tipo: 'gratis' }).success, false);
});

test('resolverPorNombre ignora tildes y mayúsculas, y distingue ambiguo de ninguno', () => {
  const l = [{ nombre: 'Sala Pequeña' }, { nombre: 'Sala Grande' }];
  assert.equal(resolverPorNombre(l, 'sala pequena'), l[0]);
  assert.equal(resolverPorNombre(l, 'sala'), 'ambiguo');
  assert.equal(resolverPorNombre(l, 'azotea'), null);
  assert.equal(zClase.safeParse({ ...clase, aforo: -1 }).success, false);
});
