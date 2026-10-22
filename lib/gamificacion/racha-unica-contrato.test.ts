import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTERRUPTORES, interruptoresDe } from '../estudio/interruptores.ts';
import { encendidaPara } from '../interruptor-por-estudio.ts';

// Contrato de la RACHA ÚNICA (PR 3.3): una sola función de racha para el motor, la app de la alumna y el
// panel, y TODO detrás de `RACHA_UNICA` (apagado de serie). Si alguien reintroduce un segundo cálculo de
// la racha, o abre una puerta sin el interruptor, estos tests fallan.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pos = (s: string, t: string) => { const i = s.indexOf(t); assert.notEqual(i, -1, `falta «${t}»`); return i; };

test('el interruptor existe, se llama RACHA_UNICA y está apagado de serie', () => {
  assert.equal(INTERRUPTORES.rachaUnica, 'RACHA_UNICA');
  assert.equal(interruptoresDe('s1', {}).rachaUnica, false);
  assert.equal(interruptoresDe('s1', { RACHA_UNICA: 'estudios:s1' }).rachaUnica, true);
  assert.equal(interruptoresDe('s2', { RACHA_UNICA: 'estudios:s1' }).rachaUnica, false);
  assert.equal(encendidaPara(undefined, 's1'), false);
  assert.match(leer('lib/interruptor-por-estudio.ts'), /rachaUnicaEncendida = \(studioId: string\) => encendidaPara\(process\.env\.RACHA_UNICA, studioId\)/);
});

test('la ruta de la app: sesión de socia y estudio verificados ANTES del interruptor y de leer nada', () => {
  const ruta = sinComentarios(leer('app/api/public/racha/route.ts'));
  const orden = [
    pos(ruta, 'enforceRateLimit(req'),
    pos(ruta, 'verificarUsuarioSupabase(req)'),
    pos(ruta, 'socioAutenticado(user.userId, body.studioId)'),
    pos(ruta, 'rachaUnicaEncendida(body.studioId)'),
    pos(ruta, 'cargarRachaUnica(admin, body.studioId, socioId)'),
  ];
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  // La identidad sale del token: el cuerpo solo trae el estudio.
  assert.doesNotMatch(ruta, /body\??\.socioId|body\??\.socio_id/);
  assert.match(ruta, /unica: false/);
});

test('el cargador filtra TODA consulta por estudio (corre con service-role) y las de la alumna por socia', () => {
  const fuente = sinComentarios(leer('lib/gamificacion/racha-unica-servidor.ts'));
  const tablas = [...fuente.matchAll(/\.from\('([a-z_]+)'\)([\s\S]*?)(?=\.from\(|$)/g)];
  assert.ok(tablas.length >= 6, 'las seis tablas que lee');
  for (const [, tabla, resto] of tablas) {
    const consulta = resto.slice(0, 260);
    assert.match(consulta, /\.eq\('studio_id', studioId\)/, `${tabla} sin filtro por estudio`);
  }
  for (const tabla of ['suscripciones', 'plazas_fijas']) {
    const [, , resto] = tablas.find(([, t]) => t === tabla)!;
    assert.match(resto.slice(0, 260), /\.eq\('socio_id', socioId\)/, `${tabla} sin filtro por socia`);
  }
  // Sin select('*'): lista de columnas.
  assert.doesNotMatch(fuente, /select\('\*'\)/);
});

test('UNA función para tres salidas: ruta de la app, logro «Semanas consecutivas» y el catálogo apuntan al mismo cargador', () => {
  const admin = sinComentarios(leer('lib/db/supabase-data-admin.ts'));
  // El logro, con el interruptor, usa la función única (no `calcularMetrica`).
  assert.match(admin, /def\.metric === 'SEMANAS_CONSECUTIVAS' && rachaUnicaEncendida\(studioId\)/);
  assert.match(admin, /cargarRachaUnica\(admin, studioId, socioId, now\)/);
  // El catálogo de la app le dice si está encendida.
  assert.match(admin, /rachaUnica: rachaUnicaEncendida\(r\.id\)/);
  // El panel no evalúa ese logro por su cuenta cuando está encendida.
  const panel = sinComentarios(leer('lib/studio-context.tsx'));
  assert.match(panel, /def\.metric === 'SEMANAS_CONSECUTIVAS' && rachaUnicaEnPanel\) return/);
  assert.match(panel, /useInterruptor\('rachaUnica'/);
});

test('la app de la alumna: con el interruptor pide la racha al servidor; sin él, nada nuevo y Inicio sigue sin racha', () => {
  const datos = sinComentarios(leer('lib/student/gamificacion-datos.ts'));
  assert.match(datos, /if \(await getRachaUnicaActiva\(slug\)\) return await getRachaUnica\(studioId\)/);
  assert.match(datos, /fetch\('\/api\/public\/racha'/);
  // Sin interruptor, `getRachaSiUnica` no pide nada.
  assert.match(datos, /if \(!\(await getRachaUnicaActiva\(slug\)\)\) return null/);
  const inicio = sinComentarios(leer('app/portal/[slug]/page.tsx'));
  assert.match(inicio, /racha=\{data\.racha\?\.semanas \?\? 0\}/);
});

test('no hay un segundo cálculo de la semana: el motor y la app solo usan claveSemanaEstudio / masDias', () => {
  const motor = sinComentarios(leer('lib/engines/streak-engine.ts'));
  assert.doesNotMatch(motor, /getDay\(\)|getUTCDay\(\)|\* 7 \* 24|604800000|7 \* 86400000/);
  assert.match(motor, /claveSemanaEstudio\(new Date\(c\.inicio\)\)/);
  // La función nueva de la app no vuelve a calcular lunes por su cuenta.
  const servidor = sinComentarios(leer('lib/gamificacion/racha-unica-servidor.ts'));
  assert.doesNotMatch(servidor, /getDay\(\)|lunesDe\(/);
});

test('la meta de «semana completa» es fija en 1 y la racha en riesgo NO se construye (D3, D6)', () => {
  const motor = leer('lib/engines/streak-engine.ts');
  assert.match(motor, /export const META_SEMANA_COMPLETA = 1/);
  assert.match(motor, /enRiesgo: false,\n\s+diasParaPerder: null,/);
});

test('la columna racha_clases_semana no se borra ni se migra (los datos quedan por si se revierte)', () => {
  const tipos = leer('lib/db-types.ts');
  assert.match(tipos, /racha_clases_semana: number \| null/);
});
