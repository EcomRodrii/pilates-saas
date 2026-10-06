import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  enCursoDesde, motivoParaNoAnalizar, sesionDelEvento, sigueEnCurso,
  TEXTO_ACABO_DE_ANALIZAR, TEXTO_YA_EN_MARCHA, VENTANA_EN_CURSO_MS,
} from './analisis-en-curso.ts';

// «Analizar ahora» sabe cuándo termina: la sesión la crea POST /analizar antes
// de enviar el evento, el análisis la reutiliza y la cierra (también si falla),
// y la pantalla pregunta por ella en vez de recargar a ciegas a los 4 s.

const AHORA = new Date('2026-10-05T16:00:00.000Z');
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString();

test('enCursoDesde: 10 minutos antes', () => {
  assert.equal(enCursoDesde(AHORA), '2026-10-05T15:50:00.000Z');
  assert.equal(VENTANA_EN_CURSO_MS, 600_000);
});

test('sigueEnCurso: abierta y de hace menos de 10 min', () => {
  assert.equal(sigueEnCurso({ disparadoPor: 'MANUAL', iniciadoEn: hace(1), finalizadoEn: null }, AHORA), true);
  assert.equal(sigueEnCurso({ disparadoPor: 'MANUAL', iniciadoEn: hace(10), finalizadoEn: null }, AHORA), true);
});

test('sigueEnCurso: cerrada (COMPLETADA o FALLIDA), vieja o sin fecha, no', () => {
  assert.equal(sigueEnCurso({ disparadoPor: 'MANUAL', iniciadoEn: hace(1), finalizadoEn: hace(0) }, AHORA), false);
  assert.equal(sigueEnCurso({ disparadoPor: 'MANUAL', iniciadoEn: hace(11), finalizadoEn: null }, AHORA), false);
  assert.equal(sigueEnCurso({ disparadoPor: 'MANUAL', iniciadoEn: null, finalizadoEn: null }, AHORA), false);
});

test('motivoParaNoAnalizar: con uno en marcha, «ya hay uno», y la pantalla lo sigue', () => {
  assert.deepEqual(
    motivoParaNoAnalizar([{ disparadoPor: 'MANUAL', iniciadoEn: hace(2), finalizadoEn: null }], AHORA),
    { error: TEXTO_YA_EN_MARCHA, enCurso: true },
  );
  // Aunque sea el del cron: dos a la vez del mismo estudio, no.
  assert.equal(motivoParaNoAnalizar([{ disparadoPor: 'CRON', iniciadoEn: hace(7), finalizadoEn: null }], AHORA)?.enCurso, true);
});

test('motivoParaNoAnalizar: uno terminado hace menos de 5 min, «acabo de analizar»', () => {
  assert.deepEqual(
    motivoParaNoAnalizar([{ disparadoPor: 'MANUAL', iniciadoEn: hace(3), finalizadoEn: hace(2) }], AHORA),
    { error: TEXTO_ACABO_DE_ANALIZAR, enCurso: false },
  );
  // Uno que FALLÓ también cuenta para la espera, pero no como en marcha.
  assert.equal(motivoParaNoAnalizar([{ disparadoPor: 'MANUAL', iniciadoEn: hace(1), finalizadoEn: hace(0) }], AHORA)?.enCurso, false);
});

test('motivoParaNoAnalizar: nada reciente, o terminado hace más de 5 min, puede analizar', () => {
  assert.equal(motivoParaNoAnalizar([], AHORA), null);
  assert.equal(motivoParaNoAnalizar([{ disparadoPor: 'MANUAL', iniciadoEn: hace(6), finalizadoEn: hace(5) }], AHORA), null);
});

test('los dos textos del 429 no se parecen: la pantalla hace distinto con cada uno', () => {
  assert.match(TEXTO_YA_EN_MARCHA, /en marcha/);
  assert.match(TEXTO_ACABO_DE_ANALIZAR, /Acabo de analizar/);
});

test('sesionDelEvento: el id de la sesión si viene, y null en los eventos de antes', () => {
  assert.equal(sesionDelEvento({ studioId: 's', sessionId: 'ds-1' }), 'ds-1');
  assert.equal(sesionDelEvento({ studioId: 's' }), null);
  assert.equal(sesionDelEvento({ sessionId: '' }), null);
  assert.equal(sesionDelEvento({ sessionId: 7 }), null);
  assert.equal(sesionDelEvento(null), null);
});

// ── Estático: las rutas y la función de Inngest importan el servidor ──

const RAIZ = join(import.meta.dirname, '..', '..');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (r: string) => sinComentarios(readFileSync(join(RAIZ, r), 'utf8'));
function cuerpoDe(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `falta ${firma}`);
  return src.slice(i, src.indexOf('\n}\n', i));
}

test('POST /analizar crea la sesión MANUAL ANTES de enviar el evento, y pasa su id', () => {
  const src = leer('app/api/decisiones/analizar/route.ts');
  const crea = src.indexOf('dbInsertDecisionSession(');
  const envia = src.indexOf('inngest.send(');
  assert.ok(crea > 0 && envia > crea, 'la sesión va antes del evento');
  assert.match(src, /disparadoPor: 'MANUAL'/);
  assert.match(src, /data: \{ studioId: sesion\.studioId, disparadoPor: 'MANUAL', nowISO, sessionId \}/);
  // El rate-limit, con su motivo.
  assert.match(src, /const noAhora = motivoParaNoAnalizar\(recientes, ahora\);\s*if \(noAhora\) return NextResponse\.json\(noAhora, \{ status: 429 \}\);/);
});

test('POST /analizar: si el evento no sale, cierra la sesión FALLIDA y responde 502', () => {
  const src = leer('app/api/decisiones/analizar/route.ts');
  assert.match(src, /catch \{\s*await dbCerrarSesionInterrumpida\(sesion\.studioId, \{ id: sessionId \}, [^)]+\)\.catch\(\(\) => \{\}\);\s*return NextResponse\.json\(\{ error: TEXTO_NO_SE_PUDO_LANZAR \}, \{ status: 502 \}\);/);
});

test('el análisis reutiliza la sesión del evento en «crear-sesion», y los eventos sin ella siguen creándola', () => {
  const src = leer('lib/inngest/decision.ts');
  assert.match(src, /const sesionPedida = sesionDelEvento\(event\.data\);\s*const sessionId = await step\.run\('crear-sesion', async \(\) => \{\s*if \(sesionPedida && await dbExisteDecisionSession\(sesionPedida, studioId\)\) return sesionPedida;\s*return dbInsertDecisionSession\(/);
});

test('el análisis que agota sus reintentos cierra su sesión FALLIDA (onFailure)', () => {
  const src = leer('lib/inngest/decision.ts');
  assert.match(src, /id: 'decision-analizar-estudio'[^]*?onFailure: async \(\{ event \}\) => \{ await cerrarAnalisisInterrumpido\(event\); \}/);
  const f = cuerpoDe(src, 'async function cerrarAnalisisInterrumpido(');
  assert.match(f, /dbCerrarSesionInterrumpida\(studioId, \{ id: sesion \}/);
  assert.match(f, /dbCerrarSesionInterrumpida\(studioId, \{ iniciadoEn: nowISO \}/);
});

test('cerrar una sesión interrumpida: solo una ABIERTA de su estudio, como FALLIDA', () => {
  const f = cuerpoDe(leer('lib/decision/db.ts'), 'export async function dbCerrarSesionInterrumpida(');
  assert.match(f, /estado: 'FALLIDA'/);
  assert.match(f, /\.eq\('studio_id', studioId\)/);
  assert.match(f, /\.is\('finalizado_en', null\)/);
});

test('«en curso» = MANUAL, abierta y de hace < 10 min, acotada al estudio (GET /api/decisiones)', () => {
  const f = cuerpoDe(leer('lib/decision/db.ts'), 'export async function dbAnalisisManualEnCurso(');
  assert.match(f, /\.eq\('studio_id', studioId\)/);
  assert.match(f, /\.eq\('disparado_por', 'MANUAL'\)/);
  assert.match(f, /\.is\('finalizado_en', null\)/);
  assert.match(f, /\.gte\('iniciado_en', enCursoDesde\(ahora\)\)/);
  assert.match(leer('app/api/decisiones/route.ts'), /dbAnalisisManualEnCurso\(sesion\.studioId, now\)/);
  // El sondeo, con el mismo criterio.
  const sondeo = leer('app/api/decisiones/analisis-en-curso/route.ts');
  assert.match(sondeo, /\.eq\('decision_sessions\.disparado_por', 'MANUAL'\)\s*\.is\('decision_sessions\.finalizado_en', null\)\s*\.gte\('decision_sessions\.iniciado_en', enCursoDesde\(new Date\(\)\)\)/);
});

test('la pantalla ya no recarga a ciegas a los 4 s del 202', () => {
  const pagina = leer('app/(dashboard)/centro-de-control/page.tsx');
  assert.doesNotMatch(pagina, /setTimeout\(recargar/);
  assert.match(pagina, /useDecisiones\(\{ seguirCobros: true, seguirAnalisis: true \}\)/);
  assert.match(pagina, /analizando \? 'Analizando…' : 'Analizar ahora'/);
});
