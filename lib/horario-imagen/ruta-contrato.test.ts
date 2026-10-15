import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guardián de `/api/horario/leer` (P2.1). Las reglas son pocas líneas que un
// refactor puede quitar sin que ningún e2e lo note (los e2e mockean la ruta).
// Si esto falla, no se relaja el test: se vuelve a poner la condición.

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ruta = sinComentarios(readFileSync(new URL('../../app/api/horario/leer/route.ts', import.meta.url), 'utf8'));
const leer = sinComentarios(readFileSync(new URL('./leer.ts', import.meta.url), 'utf8'));
const importar = sinComentarios(readFileSync(new URL('../../app/api/clases/import/route.ts', import.meta.url), 'utf8'));

test('las puertas, en orden: sesión → rol → interruptor → ráfaga → tope diario CERRADO → modelo', () => {
  const pos = (s: string) => { const i = ruta.indexOf(s); assert.ok(i > 0, `falta «${s}»`); return i; };
  const orden = [
    pos('verificarSesionStaff(req)'),
    pos('puedeGestionarSede(sesion.rol)'),
    pos('horarioDesdeImagenEncendido(studioId)'),
    pos("enforceRateLimit(req, 'horario-leer'"),
    pos("req.headers.get('content-length')"),
    pos('await req.formData()'),
    pos('topeEstricto(`horario-leer-cuenta:${sesion.userId}:${hoy}`'),
    pos('topeEstricto(`horario-leer-dia:${studioId}:${hoy}`'),
    pos('topeEstricto(`horario-leer-total:${hoy}`'),
    pos('await leerHorario(entrada)'),
  ];
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.match(ruta, /const studioId = sesion\.studioId/, 'el estudio sale de la sesión');
  assert.match(ruta, /const hoy = hoyEnEstudio\(\)/, 'el día del tope es el de Madrid');
});

test('el tope de gasto NO es el limitador que deja pasar si falla', () => {
  assert.doesNotMatch(ruta, /enforceRateLimit\([^)]*horario-leer-dia/);
  assert.doesNotMatch(ruta, /rateLimit\(`horario-leer-dia/);
});

test('ni la imagen ni el texto se guardan ni se registran; nunca fechas del modelo', () => {
  for (const [nombre, src] of [['ruta', ruta], ['leer', leer]] as const) {
    assert.doesNotMatch(src, /console\.(log|info|warn|error)/, `${nombre}: sin logs`);
    assert.doesNotMatch(src, /\.storage\b|\.from\(['"]/, `${nombre}: ni Storage ni tablas`);
    assert.doesNotMatch(src, /captureException\([^)]*(texto|imagen|base64|lectura)/, `${nombre}: a Sentry, solo cifras`);
  }
  assert.match(ruta, /desde: proximoLunes\(hoy\)/, 'la primera semana la pone el servidor');
});

test('el importador no crea en el pasado ni en un cierre lo que viene de una captura, y solo clases semanales', () => {
  assert.match(importar, /const desdeCaptura = body\?\.origen === 'imagen'/);
  assert.match(importar, /filas\.some\(\(f\) => f\?\.fecha \|\| f\?\.diaSemana == null\)/);
  assert.match(importar, /if \(desde < hoy\) desde = hoy/);
  assert.match(importar, /if \(inicio\.getTime\(\) <= ahoraMs\) continue;/);
  assert.match(importar, /cierresCaptura\.some\(\(c\) => c\.desde <= fecha && fecha <= c\.hasta\)/);
  assert.match(importar, /from\('cierres_estudio'\)[\s\S]{0,80}\.eq\('studio_id', sesion\.studioId\)/);
});
