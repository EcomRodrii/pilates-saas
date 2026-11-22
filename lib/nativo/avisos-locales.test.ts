import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisosLocales, huellaDeAvisosLocales, jsonParaAvisosLocales, MAX_AVISOS_LOCALES, MINUTOS_ANTES, PREFIJO_AVISO_LOCAL } from './avisos-locales.ts';
import { readFileSync } from 'node:fs';

const AHORA = Date.parse('2026-11-23T10:00:00Z');
const h = (horas: number) => new Date(AHORA + horas * 3_600_000).toISOString();
const clase = (id: string, desdeHoras: number, extra: Record<string, string> = {}) => ({
  id, nombre: `Clase ${id}`, inicio: h(desdeHoras), fin: h(desdeHoras + 1), sala: 'Sala 1', instructoraId: 'i1', ...extra,
});
const conf = (claseId: string) => ({ claseId, estado: 'confirmada' as const });
const base = { instructoras: [{ id: 'i1', nombre: 'Ana' }], estudio: 'Estudio Aurora', ahoraMs: AHORA };

test('avisa 15 minutos antes, con el prefijo y sin datos personales', () => {
  const [a] = avisosLocales({ ...base, reservas: [conf('c1')], clases: [clase('c1', 2)] });
  assert.equal(a.id, `${PREFIJO_AVISO_LOCAL}c1`);
  assert.equal(a.cuando, new Date(AHORA + 2 * 3_600_000 - MINUTOS_ANTES * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  assert.equal(a.titulo, 'Clase c1 empieza en 15 minutos');
  assert.equal(a.cuerpo, 'Estudio Aurora · Sala 1');
  assert.ok(!JSON.stringify(a).includes('Ana'));
});

test('no avisa de lo cancelado, la lista de espera, lo ya empezado ni lo que empieza en menos de 15 min', () => {
  const out = avisosLocales({
    ...base,
    reservas: [conf('ok'), { claseId: 'x', estado: 'cancelada' }, { claseId: 'e', estado: 'en-espera' }, conf('ya'), conf('casi')],
    clases: [clase('ok', 3), clase('x', 4), clase('e', 5), clase('ya', -0.5), clase('casi', 0.2)],
  });
  assert.deepEqual(out.map((a) => a.id), [`${PREFIJO_AVISO_LOCAL}ok`]);
});

test('tope de avisos y orden por hora', () => {
  const ids = Array.from({ length: 15 }, (_, n) => `c${n}`);
  const out = avisosLocales({ ...base, reservas: [...ids].reverse().map(conf), clases: ids.map((id, n) => clase(id, n + 1)) });
  assert.equal(out.length, MAX_AVISOS_LOCALES);
  assert.equal(out[0].id, `${PREFIJO_AVISO_LOCAL}c0`);
});

test('el json y la huella son estables', () => {
  const lista = avisosLocales({ ...base, reservas: [conf('c1')], clases: [clase('c1', 2)] });
  assert.equal(JSON.parse(jsonParaAvisosLocales(lista)).avisos.length, 1);
  assert.equal(huellaDeAvisosLocales(lista), huellaDeAvisosLocales([...lista]));
});

test('el prefijo coincide con el del plugin Swift', () => {
  const swift = readFileSync(new URL('../../ios/App/App/AvisosLocalesPlugin.swift', import.meta.url), 'utf8');
  assert.match(swift, new RegExp(`static let prefijo = "${PREFIJO_AVISO_LOCAL}"`));
});
