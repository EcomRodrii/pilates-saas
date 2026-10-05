import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aplazadaElDiaDelMensaje, elegirRecomendacionDelMensaje, fechaDelMensaje, inicioDeHoyEnEstudio,
  type FilaParaMensaje,
} from './mensaje-del-dia.ts';

// El mensaje del día apunta a SU recomendación, y en hora de Madrid.
//
// El análisis guardaba como `recomendacion_id` el id en memoria de la candidata
// (un `uid()` que nunca llegó a la base de datos cuando la fila ya existía), así
// que la pantalla no encontraba la recomendación de su propio mensaje. Los
// mensajes ya guardados se resuelven por su `dedupe_key`, con este orden.

const fila = (o: Partial<FilaParaMensaje> & { id: string }): FilaParaMensaje => ({
  estado: 'PENDIENTE', creadoEn: '2026-10-01T14:30:00.000Z', resueltoEn: null, ...o,
});

// ── fechaDelMensaje ──────────────────────────────────────────────────────────

test('a las 01:30 de Madrid ya es HOY, aunque en UTC sea todavía ayer (verano, +2)', () => {
  // 5-oct-2026 01:30 Madrid = 4-oct 23:30 UTC.
  assert.equal(fechaDelMensaje(new Date('2026-10-04T23:30:00.000Z')), '2026-10-05');
});

test('en invierno (+1) la medianoche de Madrid es las 23:00 UTC', () => {
  assert.equal(fechaDelMensaje(new Date('2026-01-14T22:59:00.000Z')), '2026-01-14');
  assert.equal(fechaDelMensaje(new Date('2026-01-14T23:00:00.000Z')), '2026-01-15');
});

test('el análisis de las 14:30 UTC cae en el mismo día en Madrid y en UTC', () => {
  assert.equal(fechaDelMensaje(new Date('2026-10-05T14:30:00.000Z')), '2026-10-05');
});

test('los días de cambio de hora', () => {
  // 29-mar-2026: a las 02:00 de Madrid pasa a ser las 03:00. 23:30 UTC del 28 = 00:30 del 29.
  assert.equal(fechaDelMensaje(new Date('2026-03-28T23:30:00.000Z')), '2026-03-29');
  // 25-oct-2026: a las 03:00 vuelve a ser las 02:00. 22:30 UTC del 24 = 00:30 del 25.
  assert.equal(fechaDelMensaje(new Date('2026-10-24T22:30:00.000Z')), '2026-10-25');
  assert.equal(fechaDelMensaje(new Date('2026-10-25T22:59:00.000Z')), '2026-10-25');
  assert.equal(fechaDelMensaje(new Date('2026-10-25T23:00:00.000Z')), '2026-10-26');
});

test('inicioDeHoyEnEstudio: el corte del «hoy» del piloto es la medianoche de Madrid', () => {
  assert.equal(inicioDeHoyEnEstudio(new Date('2026-10-04T23:30:00.000Z')), '2026-10-04T22:00:00.000Z');
  assert.equal(inicioDeHoyEnEstudio(new Date('2026-01-15T10:00:00.000Z')), '2026-01-14T23:00:00.000Z');
});

// ── elegirRecomendacionDelMensaje ────────────────────────────────────────────

test('dos filas con la misma clave: gana la que sigue viva (PENDIENTE)', () => {
  const vieja = fila({ id: 'r-vieja', estado: 'EJECUTADA', creadoEn: '2026-09-20T14:30:00.000Z', resueltoEn: '2026-10-05T09:00:00.000Z' });
  const viva = fila({ id: 'r-viva', estado: 'PENDIENTE', creadoEn: '2026-10-05T14:30:00.000Z' });
  assert.equal(elegirRecomendacionDelMensaje([vieja, viva], '2026-10-05')?.id, 'r-viva');
  assert.equal(elegirRecomendacionDelMensaje([viva, vieja], '2026-10-05')?.id, 'r-viva');
});

test('una APROBADA también está viva (en vuelo hacia su ejecución)', () => {
  const aprobada = fila({ id: 'r-ap', estado: 'APROBADA' });
  const rechazada = fila({ id: 'r-re', estado: 'RECHAZADA', resueltoEn: '2026-10-05T10:00:00.000Z' });
  assert.equal(elegirRecomendacionDelMensaje([rechazada, aprobada], '2026-10-05')?.id, 'r-ap');
});

test('sin viva: la resuelta el MISMO día del mensaje en Madrid', () => {
  const deAyer = fila({ id: 'r-ayer', estado: 'EJECUTADA', resueltoEn: '2026-10-04T12:00:00.000Z' });
  // 00:30 de Madrid del día 5 = 22:30 UTC del 4: es de HOY.
  const deHoy = fila({ id: 'r-hoy', estado: 'FALLIDA', resueltoEn: '2026-10-04T22:30:00.000Z' });
  assert.equal(elegirRecomendacionDelMensaje([deAyer, deHoy], '2026-10-05')?.id, 'r-hoy');
});

test('dos resueltas el mismo día: la última en resolverse, y sin depender del orden de llegada', () => {
  const a = fila({ id: 'r-a', estado: 'RECHAZADA', resueltoEn: '2026-10-05T09:00:00.000Z' });
  const b = fila({ id: 'r-b', estado: 'EJECUTADA', resueltoEn: '2026-10-05T18:00:00.000Z' });
  assert.equal(elegirRecomendacionDelMensaje([a, b], '2026-10-05')?.id, 'r-b');
  assert.equal(elegirRecomendacionDelMensaje([b, a], '2026-10-05')?.id, 'r-b');
  // Empate exacto: decide el id, siempre igual.
  const c = fila({ id: 'r-c', estado: 'EJECUTADA', resueltoEn: '2026-10-05T18:00:00.000Z' });
  assert.equal(elegirRecomendacionDelMensaje([b, c], '2026-10-05')?.id, elegirRecomendacionDelMensaje([c, b], '2026-10-05')?.id);
});

test('la resuelta a las 23:30 de Madrid del día anterior (21:30 UTC) NO es de hoy', () => {
  const tarde = fila({ id: 'r-tarde', estado: 'EJECUTADA', resueltoEn: '2026-10-04T21:30:00.000Z' });
  assert.equal(elegirRecomendacionDelMensaje([tarde], '2026-10-05'), null);
});

test('ni viva ni resuelta ese día: ninguna (una de otro día es otro asunto)', () => {
  const expirada = fila({ id: 'r-exp', estado: 'EXPIRADA', resueltoEn: null });
  const semanaPasada = fila({ id: 'r-sem', estado: 'EJECUTADA', resueltoEn: '2026-09-28T10:00:00.000Z' });
  assert.equal(elegirRecomendacionDelMensaje([expirada, semanaPasada], '2026-10-05'), null);
  assert.equal(elegirRecomendacionDelMensaje([], '2026-10-05'), null);
});

// ── aplazadaElDiaDelMensaje ──────────────────────────────────────────────────

test('aplazada hoy y PENDIENTE: el veredicto dice que la ha dejado para más adelante', () => {
  assert.equal(aplazadaElDiaDelMensaje({ estado: 'PENDIENTE', pospuestaEn: '2026-10-05T16:00:00.000Z' }, '2026-10-05'), true);
  // 00:15 de Madrid del día 5.
  assert.equal(aplazadaElDiaDelMensaje({ estado: 'PENDIENTE', pospuestaEn: '2026-10-04T22:15:00.000Z' }, '2026-10-05'), true);
});

test('aplazada otro día, nunca aplazada, o ya resuelta: no', () => {
  assert.equal(aplazadaElDiaDelMensaje({ estado: 'PENDIENTE', pospuestaEn: '2026-10-02T16:00:00.000Z' }, '2026-10-05'), false);
  assert.equal(aplazadaElDiaDelMensaje({ estado: 'PENDIENTE', pospuestaEn: null }, '2026-10-05'), false);
  assert.equal(aplazadaElDiaDelMensaje({ estado: 'PENDIENTE' }, '2026-10-05'), false);
  assert.equal(aplazadaElDiaDelMensaje({ estado: 'EJECUTADA', pospuestaEn: '2026-10-05T16:00:00.000Z' }, '2026-10-05'), false);
});

// ── Quién escribe el id y quién lo lee (estático: db.ts e Inngest importan el servidor) ──

const RAIZ = join(import.meta.dirname, '..', '..');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (r: string) => sinComentarios(readFileSync(join(RAIZ, r), 'utf8'));
function cuerpoDe(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `falta ${firma}`);
  return src.slice(i, src.indexOf('\n}\n', i));
}

test('dbUpsertRecomendacion devuelve el id que queda en la base de datos', () => {
  const f = cuerpoDe(leer('lib/decision/db.ts'), 'export async function dbUpsertRecomendacion(');
  assert.match(f, /Promise<string \| null>/);
  // La existente conserva SU id (APROBADA intacta, o PENDIENTE refrescada).
  assert.match(f, /if \(existente\?\.estado === 'APROBADA'\) return existente\.id as string;/);
  assert.match(f, /return existente\.id as string;\n/);
  // La nueva, el suyo; si no se pudo escribir, null.
  assert.match(f, /if \(error\) \{ reportError\('\[dbUpsertRecomendacion:insert\]', error\); return null; \}\s*return row\.id;/);
  // El refresco no acorta un vencimiento que «Recuérdamelo» alargó.
  assert.match(f, /delete actualizable\.expira_en;/);
});

test('el refresco no pisa `pospuesta_en` ni `resultado`', () => {
  const f = cuerpoDe(leer('lib/decision/db.ts'), 'function recomendacionToDb(');
  assert.doesNotMatch(f, /pospuesta_en/);
  assert.doesNotMatch(f, /resultado/);
});

test('«Recuérdamelo» escribe `pospuesta_en`, acotado al estudio y solo si sigue PENDIENTE', () => {
  const f = cuerpoDe(leer('lib/decision/db.ts'), 'export async function dbPosponerRecomendacion(');
  assert.match(f, /pospuesta_en: pospuestaEn/);
  assert.match(f, /\.eq\('id', id\)\.eq\('studio_id', studioId\)\.eq\('estado', 'PENDIENTE'\)/);
});

test('el análisis guarda en el mensaje del día el id PERSISTIDO, y la puerta 2 cruza por él', () => {
  const src = leer('lib/inngest/decision.ts');
  assert.match(src, /const idsPersistidos: \(string \| null\)\[\] = recomendacionesRedactadas\.length > 0\s*\? await step\.run\('persistir-recomendaciones-lote'/);
  assert.match(src, /recomendacionId: idPersistidoPorDedupe\.get\(veredicto\.candidata\.dedupeKey\) \?\? null/);
  assert.doesNotMatch(src, /recomendacionId: ganadora\?\.id/);
  assert.match(src, /idsAutonomas\.has\(idPersistidoPorDedupe\.get\(r\.dedupeKey\) \?\? r\.id\)/);
  // El día del mensaje, en Madrid: el mismo con el que lo busca la pantalla.
  assert.match(src, /const fecha = fechaDelMensaje\(now\);/);
  assert.match(leer('app/api/decisiones/route.ts'), /const fechaHoy = fechaDelMensaje\(now\);/);
});

test('lo que el piloto hizo «hoy»: solo EJECUTADA, y desde la medianoche de Madrid', () => {
  const db = leer('lib/decision/db.ts');
  const contar = cuerpoDe(db, 'async function contarAutonomasHoyEn(');
  assert.match(contar, /\.eq\('studio_id', studioId\)/);
  assert.match(contar, /\.eq\('estado', estado\)/);
  assert.match(contar, /\.gte\('resuelto_en', inicioDeHoyEnEstudio\(now\)\)/);
  assert.match(cuerpoDe(db, 'export function dbCountAutonomasHoy('), /contarAutonomasHoyEn\(studioId, now, 'EJECUTADA'\)/);
  // Y la bandeja del Resumen cuenta igual.
  const estado = leer('lib/estado-estudio-servidor.ts');
  assert.match(estado, /const inicioDiaISO = inicioDeHoyEnEstudio\(ahora\);/);
  assert.match(estado, /\.eq\('resuelto_por', 'AUTONOMIA'\)\.eq\('estado', 'EJECUTADA'\)\.gte\('resuelto_en', inicioDiaISO\)/);
});
