import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guardián de `/api/estudio/niveles` (P3.8). Pocas líneas que un refactor puede
// quitar sin que ningún e2e lo note (los e2e mockean la ruta). Si falla, no se
// relaja el test: se vuelve a poner la condición.

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ruta = sinComentarios(readFileSync(new URL('../../app/api/estudio/niveles/route.ts', import.meta.url), 'utf8'));

test('la puerta: sesión → solo propietaria → interruptor → plan, antes de leer o escribir nada', () => {
  const pos = (s: string) => { const i = ruta.indexOf(s); assert.ok(i > 0, `falta «${s}»`); return i; };
  const orden = [pos('verificarSesionStaff(req)'), pos("sesion.rol !== 'PROPIETARIO'"), pos('nivelesConRitmoEncendido(sesion.studioId)'), pos("bloqueoPorFeature(sesion.studioId, 'gamificacion')")];
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.match(ruta, /const studioId = sesion\.studioId/, 'el estudio sale de la sesión');
});

test('nadie baja: se comprueba con los totales de verdad antes de escribir, y sin totales no se guarda', () => {
  const totales = ruta.indexOf('const totales = await totalesDe(admin, studioId)');
  const bajan = ruta.indexOf('quienBajaria(totales, antes, niveles)');
  const borrar = ruta.indexOf(".from('level_definitions').delete()");
  const guardar = ruta.indexOf(".from('level_definitions').upsert(");
  assert.ok(totales > 0 && bajan > totales && borrar > bajan && guardar > bajan);
  // La del PUT (la del GET dice otra cosa): sin totales, no se guarda nada.
  assert.match(ruta, /if \(!totales\) return NextResponse\.json\(\{ error: '[^']*No se ha guardado nada\.' \}, \{ status: 503 \}\)/);
  assert.match(ruta, /status: 409/);
});

test('solo toca los niveles: ni créditos, ni reglas, ni canjes', () => {
  assert.doesNotMatch(ruta, /\.from\('(member_credits|reward_rules|reward_catalog|reward_redemptions)'\)\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(ruta, /\.rpc\(/);
  for (const m of ruta.matchAll(/\.from\('level_definitions'\)[^;]*/g)) {
    assert.match(m[0], /\.eq\('studio_id', studioId\)|\.upsert\(filas/, 'cada lectura o borrado, filtrado por el estudio');
  }
});

test('un id de nivel de OTRO estudio no pasa: se comprueba contra los de este estudio antes de guardar', () => {
  const leer = ruta.indexOf(".from('level_definitions').select('id, umbral_creditos, activo, orden').eq('studio_id', studioId)");
  const check = ruta.indexOf('v.niveles.some((n) => n.id && !deEsteEstudio.has(n.id))');
  const guardar = ruta.indexOf(".from('level_definitions').upsert(");
  assert.ok(leer > 0 && check > leer && guardar > check, 'leer los de este estudio → rechazar los ajenos → guardar');
  assert.match(ruta, /id: n\.id \?\? `lvl-\$\{uid\(\)\}`/, 'los ids nuevos los pone el servidor');
});

