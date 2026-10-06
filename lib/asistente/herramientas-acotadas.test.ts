// ─────────────────────────────────────────────────────────────────────────────
// Guardia estática del asistente (spec §4.2). Las herramientas, el servidor y
// las rutas leen con SERVICE-ROLE: la RLS no filtra nada, así que el único
// límite entre estudios es que CADA consulta lleve su `.eq('studio_id', …)`
// con el estudio de la SESIÓN. Y ninguna herramienta puede aceptar un estudio
// del modelo. Mismo modelo que lib/api-publica/rutas.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEFINICIONES, herramientasDelRol } from './herramientas/definiciones.ts';

const RAIZ = new URL('../../', import.meta.url).pathname;

function ficheros(dir: string): string[] {
  const abs = join(RAIZ, dir);
  if (statSync(abs).isFile()) return [dir];
  return readdirSync(abs).flatMap(n => {
    const p = join(abs, n);
    return statSync(p).isDirectory() ? ficheros(relative(RAIZ, p)) : [relative(RAIZ, p)];
  }).filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
}

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const leer = (f: string) => sinComentarios(readFileSync(join(RAIZ, f), 'utf8'));

const CON_SERVICE_ROLE = [...ficheros('lib/asistente/herramientas'), 'lib/asistente/servidor.ts', ...ficheros('app/api/asistente')];

test('toda consulta va acotada al estudio de la sesión (nº de .from ≤ nº de filtros por estudio)', () => {
  for (const f of CON_SERVICE_ROLE) {
    const src = leer(f);
    const froms = (src.match(/\.from\(/g) ?? []).length;
    const acotadas =
      (src.match(/\.eq\('studio_id', (ctx|sesion)\.studioId\)/g) ?? []).length +
      (src.match(/\.from\('studios'\)[^;]*?\.eq\('id', (ctx|sesion)\.studioId\)/g) ?? []).length +
      // Un insert acotado por construcción: la fila lleva el estudio de la sesión.
      (src.match(/\.insert\(\{ studio_id: sesion\.studioId/g) ?? []).length +
      (src.match(/\.insert\(filas\)/g) && /studio_id: sesion\.studioId/.test(src) ? 1 : 0);
    assert.ok(froms <= acotadas, `${f}: ${froms} consultas y solo ${acotadas} acotadas al estudio de la sesión`);
    assert.doesNotMatch(src, /select\(\s*['"`]\*['"`]/, `${f}: nada de select('*')`);
  }
});

test('las funciones reutilizadas que reciben el estudio se llaman con el de la sesión', () => {
  for (const f of ficheros('lib/asistente/herramientas')) {
    const src = leer(f);
    for (const fn of ['cargarClientasServidor', 'leerBonosPorCaducar', 'recibosCobradosEnTramo', 'recibosSinCobrar', 'sesionesYReservasDelRango']) {
      for (const m of src.matchAll(new RegExp(`${fn}\\(([^,)]*),\\s*([^,)]*)`, 'g'))) {
        assert.equal(m[2].trim(), 'ctx.studioId', `${f}: ${fn} con ${m[2]}`);
      }
    }
    for (const m of src.matchAll(/contarConteosEstudio\([^)]*?studioId: ([\w.]+)/g)) assert.equal(m[1], 'ctx.studioId', `${f}: contarConteosEstudio`);
    for (const m of src.matchAll(/dbGetMensajeDia\(([^,)]*)/g)) assert.equal(m[1].trim(), 'ctx.studioId', `${f}: dbGetMensajeDia`);
    for (const m of src.matchAll(/dbGetRecomendacion\(([^)]*)\)/g)) {
      assert.equal(m[1].split(',').length, 2, `${f}: dbGetRecomendacion siempre con el estudio`);
      assert.match(m[1], /ctx\.studioId/);
    }
  }
});

test('ninguna herramienta acepta un estudio ni una sede del modelo; todas strict y cerradas', () => {
  for (const d of DEFINICIONES) {
    const e = d.esquema as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
    const props = Object.keys(e.properties ?? {});
    for (const p of props) assert.doesNotMatch(p, /studio|estudio|sede/i, `${d.nombre}.${p}`);
    assert.equal(e.additionalProperties, false, d.nombre);
    assert.deepEqual([...(e.required ?? [])].sort(), [...props].sort(), `${d.nombre}: todas las propiedades en required`);
    // Y lo que no está en el esquema, zod lo rechaza.
    assert.equal(d.zod.safeParse({ studioId: 'otro' }).success, false, `${d.nombre}: zod deja pasar un estudio`);
  }
});

test('fase 1: todas de lectura y con permiso; las de dinero, solo con puedeVerFinanzas', () => {
  for (const d of DEFINICIONES) {
    assert.equal(d.clase, 'lectura', d.nombre);
    assert.equal(typeof d.permitida, 'function', d.nombre);
  }
  const src = leer('lib/asistente/herramientas/definiciones.ts');
  for (const n of ['facturacion_del_periodo', 'pagos_pendientes']) {
    const bloque = src.slice(src.indexOf(`nombre: '${n}'`), src.indexOf('etiqueta:', src.indexOf(`nombre: '${n}'`)));
    assert.match(bloque, /permitida: rol => delAsistente\(rol\) && puedeVerFinanzas\(rol\)/, n);
  }
  const gerente = herramientasDelRol('MANAGER').map(h => h.nombre);
  assert.ok(!gerente.includes('facturacion_del_periodo') && !gerente.includes('pagos_pendientes'));
  // Y la ejecución lo vuelve a comprobar.
  const dinero = leer('lib/asistente/herramientas/dinero.ts');
  assert.equal(dinero.match(/if \(!puedeVerFinanzas\(ctx\.rol\)\) return fallo/g)?.length, 2);
  const registro = leer('lib/asistente/herramientas/index.ts');
  assert.match(registro, /if \(!h\.permitida\(ctx\.rol\)\) return salidaDeError\('NO_PERMITIDA'/);
});

test('nada de salud: ni tablas clínicas, ni notas, ni el motivo de una baja o de una ausencia', () => {
  const prohibido = [/from\('salud/, /notas_progreso/, /ficha_clinica/, /motivo_baja/, /incidencia_texto/, /completarSesiones/, /textoAusencia/];
  for (const f of [...ficheros('lib/asistente'), ...ficheros('app/api/asistente')]) {
    if (f.endsWith('lib/asistente/prompt.ts')) continue; // nombra la salud para negarse
    const src = readFileSync(join(RAIZ, f), 'utf8');
    for (const p of prohibido) assert.doesNotMatch(src, p, `${f}: ${p}`);
  }
});

test('las conversaciones se leen siempre con el estudio Y el usuario de la sesión', () => {
  for (const f of ['lib/asistente/servidor.ts', ...ficheros('app/api/asistente')]) {
    const src = leer(f);
    for (const m of src.matchAll(/\.from\('asistente_conversaciones'\)[^;]*;/g)) {
      if (/\.insert\(/.test(m[0])) continue;
      if (/\.delete\(\)/.test(m[0])) { assert.match(m[0], /\.eq\('studio_id', sesion\.studioId\)/); continue; } // la purga de 90 días, por estudio
      assert.match(m[0], /\.eq\('auth_user_id', sesion\.userId\)/, `${f}: conversación sin acotar a su dueña`);
    }
  }
});

test('la ruta corta antes de abrir el stream: sesión, rol, interruptor, plan, ráfaga y libro', () => {
  const src = leer('app/api/asistente/route.ts');
  const orden = [
    'verificarSesionStaff(req)', 'puedeUsarAsistente(sesionStaff.rol)', 'asistenteEncendido(sesionStaff.studioId)',
    "bloqueoPorFeature(sesionStaff.studioId, 'asistente')", "enforceRateLimit(req, 'asistente'", 'validarCuerpo(',
    'reservarConsulta(', 'new ReadableStream',
  ].map(t => [t, src.indexOf(t)] as const);
  for (const [t, i] of orden) assert.ok(i > 0, `falta ${t}`);
  for (let k = 1; k < orden.length; k++) assert.ok(orden[k][1] > orden[k - 1][1], `${orden[k][0]} va antes que ${orden[k - 1][0]}`);
  assert.match(src, /export const runtime = 'nodejs'/);
  assert.match(src, /export const maxDuration = 60/);
  // El estudio sale de la sesión, nunca del cuerpo.
  assert.doesNotMatch(src, /cuerpo\.studio|body\.studio/);
});

test('ni a la Sentry ni al log va el texto de la pregunta o de la respuesta', () => {
  for (const f of ['app/api/asistente/route.ts', 'lib/asistente/servidor.ts', 'lib/asistente/bucle.ts']) {
    const src = leer(f);
    for (const m of src.matchAll(/(?:console\.\w+|Sentry\.\w+)\(([^;]*)\);/g)) {
      assert.doesNotMatch(m[1], /pregunta|marcada|texto|delta|contenido/, `${f}: ${m[0].slice(0, 120)}`);
    }
  }
});

test('el interruptor está APAGADO salvo ASISTENTE_IA=on o estudios:<ids> (lib/asistente/interruptor.test.ts), y con clave', () => {
  const src = leer('lib/asistente/servidor.ts');
  assert.match(src, /asistenteEncendidoPara\(process\.env\.ASISTENTE_IA, !!process\.env\.ANTHROPIC_API_KEY, studioId\)/);
  // Las tres rutas preguntan por el estudio de la SESIÓN, nunca por uno que venga de fuera.
  for (const ruta of ['app/api/asistente/route.ts', 'app/api/asistente/saldo/route.ts', 'app/api/asistente/conversaciones/[id]/route.ts']) {
    const r = leer(ruta);
    const llamadas = [...r.matchAll(/asistenteEncendido\(([^)]*)\)/g)].map(m => m[1]);
    assert.ok(llamadas.length > 0, ruta);
    for (const a of llamadas) assert.match(a, /^sesion(Staff)?\.studioId$/, `${ruta}: asistenteEncendido(${a})`);
  }
});
