import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesParaElWidget, huellaDelWidget, jsonParaElWidget, MAX_CLASES_WIDGET, VERSION_WIDGET } from './widget-clases.ts';

const AHORA = Date.parse('2026-11-23T10:00:00Z');
const h = (horas: number) => new Date(AHORA + horas * 3_600_000).toISOString();

const clase = (id: string, desdeHoras: number, extra: Record<string, string> = {}) => ({
  id, nombre: `Clase ${id}`, inicio: h(desdeHoras), fin: h(desdeHoras + 1), sala: 'Sala 1', instructoraId: 'i1', ...extra,
});
const instructoras = [{ id: 'i1', nombre: 'Ana' }];
const conf = (claseId: string) => ({ claseId, estado: 'confirmada' as const });

test('solo reservas confirmadas que no han terminado, de la más próxima a la más lejana', () => {
  const out = clasesParaElWidget({
    reservas: [conf('c3'), conf('c1'), conf('c2'), { claseId: 'c4', estado: 'cancelada' }, { claseId: 'c5', estado: 'en-espera' }, { claseId: 'c6', estado: 'asistida' }],
    clases: [clase('c1', 2), clase('c2', 5), clase('c3', 30), clase('c4', 3), clase('c5', 4), clase('c6', 6)],
    instructoras, estudio: 'Estudio Aurora', ahoraMs: AHORA,
  });
  assert.deepEqual(out.map((c) => c.id), ['c1', 'c2', 'c3']);
});

test('la clase que se está dando se queda; la ya terminada, no', () => {
  const out = clasesParaElWidget({
    reservas: [conf('ahora'), conf('pasada')],
    clases: [clase('ahora', -0.5), clase('pasada', -3)],
    instructoras, estudio: 'E', ahoraMs: AHORA,
  });
  assert.deepEqual(out.map((c) => c.id), ['ahora']);
});

test('máximo 3 por defecto, y una clase repetida en dos reservas cuenta una vez', () => {
  const clases = [1, 2, 3, 4, 5].map((n) => clase(`c${n}`, n));
  const out = clasesParaElWidget({
    reservas: [conf('c1'), conf('c1'), conf('c2'), conf('c3'), conf('c4'), conf('c5')],
    clases, instructoras, estudio: 'E', ahoraMs: AHORA,
  });
  assert.equal(out.length, MAX_CLASES_WIDGET);
  assert.deepEqual(out.map((c) => c.id), ['c1', 'c2', 'c3']);
});

test('lleva solo lo mínimo: sin ids de alumna ni de instructora, y sin campos vacíos', () => {
  const [c] = clasesParaElWidget({
    reservas: [conf('c1')],
    clases: [{ ...clase('c1', 2), sala: '  ', instructoraId: 'nadie' }],
    instructoras, estudio: '  Estudio   Aurora ', ahoraMs: AHORA,
  });
  assert.deepEqual(Object.keys(c).sort(), ['estudio', 'fin', 'id', 'inicio', 'titulo']);
  assert.equal(c.estudio, 'Estudio Aurora');
  const [con] = clasesParaElWidget({ reservas: [conf('c1')], clases: [clase('c1', 2)], instructoras, estudio: 'E', ahoraMs: AHORA });
  assert.equal(con.instructora, 'Ana');
  assert.equal(con.sala, 'Sala 1');
  assert.doesNotMatch(JSON.stringify(con), /i1|alumna|@/);
});

test('fechas sin milisegundos, textos recortados y fechas rotas descartadas', () => {
  const larga = 'x'.repeat(200);
  const out = clasesParaElWidget({
    reservas: [conf('a'), conf('rota')],
    clases: [{ ...clase('a', 2), nombre: larga, inicio: '2026-11-23T12:00:00.000Z', fin: '2026-11-23T13:00:00.123Z' }, { ...clase('rota', 3), inicio: 'no-es-fecha' }],
    instructoras, estudio: 'E', ahoraMs: AHORA,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].inicio, '2026-11-23T12:00:00Z');
  assert.equal(out[0].fin, '2026-11-23T13:00:00Z');
  assert.equal(out[0].titulo.length, 80);
});

test('sin reservas confirmadas, lista vacía (el widget dice «Sin clases reservadas»)', () => {
  assert.deepEqual(clasesParaElWidget({ reservas: [], clases: [clase('c1', 2)], instructoras, estudio: 'E', ahoraMs: AHORA }), []);
});

test('el json lleva la versión del contrato y cuándo se guardó', () => {
  const j = JSON.parse(jsonParaElWidget([], AHORA));
  assert.equal(j.version, VERSION_WIDGET);
  assert.equal(j.actualizadoEn, '2026-11-23T10:00:00Z');
  assert.deepEqual(j.clases, []);
});

test('la huella no cambia con la hora de guardado (no se reescribe sin motivo)', () => {
  const a = clasesParaElWidget({ reservas: [conf('c1')], clases: [clase('c1', 2)], instructoras, estudio: 'E', ahoraMs: AHORA });
  assert.equal(huellaDelWidget(a), huellaDelWidget(a.map((c) => ({ ...c }))));
});

test('contrato con Swift: la versión coincide con la de ProximasClasesAlmacen', async () => {
  const { readFileSync } = await import('node:fs');
  const swift = readFileSync(new URL('../../ios/App/Compartido/ProximasClases.swift', import.meta.url), 'utf8');
  assert.match(swift, new RegExp(`static let version = ${VERSION_WIDGET}\\b`));
});
