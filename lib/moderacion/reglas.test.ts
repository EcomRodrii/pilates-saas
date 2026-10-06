import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  HORAS_REVISION_ESTUDIO, TEXTO_BLOQUEO_PANEL, TEXTO_CERRADA_PANEL, TEXTO_NO_ADMITE, TEXTO_RETIRADO,
  errorDeModeracion, estadoDelHilo, mensajeParaApp, type ParticipanteHilo,
} from './reglas.ts';

// ── mensajeParaApp ───────────────────────────────────────────────────────────

const base = {
  id: 'm1', conversacion_id: 'c1', studio_id: 's1', remitente_auth_user_id: 'u1', creado_en: '2026-10-05T10:00:00Z',
};

test('un mensaje retirado sale a la app sin su texto ni quién lo retiró', () => {
  const m = mensajeParaApp({ ...base, cuerpo: 'algo feo', oculto_en: '2026-10-05T11:00:00Z', oculto_por: 'duena' });
  assert.equal(m.cuerpo, TEXTO_RETIRADO);
  assert.equal(m.oculto, true);
  assert.ok(!('oculto_en' in m) && !('oculto_por' in m), 'ni la fecha ni la cuenta de quien lo retiró viajan');
  assert.ok(!JSON.stringify(m).includes('algo feo'));
  assert.ok(!JSON.stringify(m).includes('duena'));
});

test('un mensaje normal sale igual, con oculto: false', () => {
  const m = mensajeParaApp({ ...base, cuerpo: 'Hola', oculto_en: null, oculto_por: null });
  assert.deepEqual(m, { ...base, cuerpo: 'Hola', oculto: false });
  // Y si la columna no venía (fila de antes de la migración), también.
  assert.deepEqual(mensajeParaApp({ ...base, cuerpo: 'Hola' }), { ...base, cuerpo: 'Hola', oculto: false });
});

// ── estadoDelHilo ────────────────────────────────────────────────────────────

const alumna = (bloqueo: string | null = null): ParticipanteHilo =>
  ({ rol_en_conversacion: 'SOCIO', auth_user_id: 'cuenta-alumna', socio_id: 'so1', bloqueo_en: bloqueo });
const profe = (bloqueo: string | null = null): ParticipanteHilo =>
  ({ rol_en_conversacion: 'STAFF', auth_user_id: 'cuenta-profe', socio_id: null, bloqueo_en: bloqueo });
const AHORA = '2026-10-05T10:00:00Z';

test('sin cierre ni bloqueos, el hilo está abierto', () => {
  assert.equal(estadoDelHilo({ tipo: 'ALUMNA_INSTRUCTORA', cerradaEn: null, participantes: [alumna(), profe()], yo: { socioId: 'so1' } }), 'ABIERTA');
});

test('cerrado por el estudio: no admite mensajes para nadie', () => {
  for (const yo of [{ socioId: 'so1' }, { authUserId: 'cuenta-profe' }]) {
    assert.equal(estadoDelHilo({ tipo: 'ALUMNA_INSTRUCTORA', cerradaEn: AHORA, participantes: [alumna(), profe()], yo }), 'NO_ADMITE');
  }
});

test('quien bloqueó lo ve como suyo; a quien bloquearon no se le dice quién fue', () => {
  const participantes = [alumna(AHORA), profe()];
  assert.equal(estadoDelHilo({ tipo: 'ALUMNA_INSTRUCTORA', cerradaEn: null, participantes, yo: { socioId: 'so1' } }), 'BLOQUEADA_POR_MI');
  assert.equal(estadoDelHilo({ tipo: 'ALUMNA_INSTRUCTORA', cerradaEn: null, participantes, yo: { authUserId: 'cuenta-profe' } }), 'NO_ADMITE');
});

test('la alumna se reconoce por su ficha aunque su fila ya no tenga cuenta; si las dos bloquearon, no admite', () => {
  const sinCuenta = { ...alumna(AHORA), auth_user_id: null };
  assert.equal(estadoDelHilo({ tipo: 'ALUMNA_INSTRUCTORA', cerradaEn: null, participantes: [sinCuenta, profe()], yo: { socioId: 'so1', authUserId: 'cuenta-nueva' } }), 'BLOQUEADA_POR_MI');
  assert.equal(estadoDelHilo({ tipo: 'ALUMNA_INSTRUCTORA', cerradaEn: null, participantes: [alumna(AHORA), profe(AHORA)], yo: { socioId: 'so1' } }), 'NO_ADMITE');
});

// ── errorDeModeracion ────────────────────────────────────────────────────────

test('el error del trigger se traduce a un 409 con la frase de la app', () => {
  for (const codigo of ['CONVERSACION_CERRADA', 'CONVERSACION_BLOQUEADA'] as const) {
    const r = errorDeModeracion({ code: 'P0001', message: codigo });
    assert.deepEqual(r, { status: 409, error: TEXTO_NO_ADMITE, estado: 'NO_ADMITE', codigo });
  }
});

test('en el panel, una frase para cada caso', () => {
  assert.equal(errorDeModeracion({ code: 'P0001', message: 'CONVERSACION_CERRADA' }, { panel: true })?.error, TEXTO_CERRADA_PANEL);
  assert.equal(errorDeModeracion({ code: 'P0001', message: 'CONVERSACION_BLOQUEADA' }, { panel: true })?.error, TEXTO_BLOQUEO_PANEL);
});

test('cualquier otro error no es de moderación', () => {
  assert.equal(errorDeModeracion({ code: '42501', message: 'new row violates row-level security policy' }), null);
  assert.equal(errorDeModeracion({ code: 'P0001', message: 'OTRA_COSA' }), null);
  assert.equal(errorDeModeracion(new Error('CONVERSACION_CERRADA')), null, 'sin el código del trigger no se adivina');
  assert.equal(errorDeModeracion(null), null);
});

// ── La cifra de las 24 h es la misma en TS y en SQL ─────────────────────────

test('HORAS_REVISION_ESTUDIO es la misma cifra que usa resolver_denuncia', () => {
  const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  const ultima = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => /function public\.resolver_denuncia\s*\(/.test(readFileSync(join(dir, f), 'utf8')))
    .at(-1);
  assert.ok(ultima, 'ninguna migración define resolver_denuncia');
  const sql = readFileSync(join(dir, ultima!), 'utf8');
  const cuerpo = sql.slice(sql.indexOf('function public.resolver_denuncia'));
  const intervalos = [...cuerpo.slice(0, cuerpo.indexOf('$function$;')).matchAll(/interval '(\d+) hours'/g)].map((m) => Number(m[1]));
  assert.ok(intervalos.length >= 2, 'resolver_denuncia ya no usa el plazo de revisión');
  assert.ok(intervalos.every((h) => h === HORAS_REVISION_ESTUDIO), `SQL ${intervalos.join(', ')} h y TS ${HORAS_REVISION_ESTUDIO} h`);
});
