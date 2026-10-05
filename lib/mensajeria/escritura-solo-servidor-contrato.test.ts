import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: la mensajería y el tablón de la app solo pasan por el
// servidor (migr 20261005150000 y 20261005150100). El efecto en la base de datos
// lo prueba `supabase/tests/rls-moderacion.test.ts`; aquí, que el cierre no se
// deshaga sin querer y que ninguna pantalla vuelva a escribir por PostgREST lo
// que ya no puede (fallaría en producción con 42501).
//
// Si falla: se arregla el código (una ruta de servidor), no la guardia.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const DIR = join(RAIZ, 'supabase', 'migrations');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const migraciones = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const leer = (f: string) => sinComentarios(readFileSync(join(DIR, f), 'utf8'));

// Se buscan por lo que hacen, no por el nombre: al aplicarlas pueden renombrarse a su versión.
const cierre = migraciones.find((f) => /revoke update, delete on table public\.mensajes from authenticated/.test(leer(f)));
const esquema = migraciones.find((f) => /create or replace function public\.mensajes_conversacion_abierta\(\)/.test(leer(f)));

test('la migración de cierre quita lo que el navegador no usa y lo comprueba al aplicarse', () => {
  assert.ok(cierre, 'no se encuentra la migración que cierra la mensajería al navegador');
  const sql = leer(cierre!);
  assert.match(sql, /revoke insert, delete on table public\.conversaciones from authenticated/);
  assert.match(sql, /revoke insert, delete on table public\.conversacion_participantes from authenticated/);
  assert.match(sql, /revoke update on table public\.comentarios_comunidad from authenticated/);
  assert.match(sql, /drop policy if exists comentarios_comunidad_editar on public\.comentarios_comunidad/);
  // NO un REVOKE UPDATE de tabla en conversaciones: se llevaría el GRANT de columna que usa el panel.
  assert.doesNotMatch(sql, /revoke[^;]*update[^;]*on table public\.conversaciones from authenticated/);
  for (const comprobacion of [
    /has_table_privilege\('authenticated', 'public\.mensajes', 'UPDATE'\)/,
    /has_table_privilege\('authenticated', 'public\.mensajes', 'DELETE'\)/,
    /has_column_privilege\('authenticated', 'public\.conversaciones', 'mostrador_leido_hasta', 'UPDATE'\)/,
    /has_column_privilege\('authenticated', 'public\.conversacion_participantes', 'leido_hasta', 'UPDATE'\)/,
    /has_column_privilege\('authenticated', 'public\.mensajes', 'cuerpo', 'INSERT'\)/,
  ]) assert.match(sql, comprobacion);
});

test('ninguna migración posterior devuelve al navegador lo que se cerró', () => {
  assert.ok(cierre);
  const posteriores = migraciones.filter((f) => f > cierre!);
  const aCliente = String.raw`to\s+[^;]*\b(authenticated|anon|public)\b`;
  for (const f of posteriores) {
    const sql = leer(f);
    for (const [tabla, privilegios] of [
      ['mensajes', 'update|delete|all'],
      ['conversaciones', 'insert|delete|all'],
      ['conversacion_participantes', 'insert|delete|all'],
      ['comentarios_comunidad', 'update|all'],
    ] as const) {
      assert.doesNotMatch(sql,
        new RegExp(String.raw`grant\s+[^;]*\b(${privilegios})\b[^;]*on\s+(table\s+)?(public\.)?${tabla}\b[^;]*${aCliente}`, 'i'),
        `${f} devuelve al navegador la escritura de ${tabla}`);
    }
    assert.doesNotMatch(sql, /create\s+policy\s+\S+\s+on\s+(public\.)?mensajes\s+[^;]*for\s+(update|delete|all)\b/i,
      `${f} crea una política de escritura sobre mensajes`);
    assert.doesNotMatch(sql, /create\s+policy\s+\S+\s+on\s+(public\.)?comentarios_comunidad\s+[^;]*for\s+(update|all)\b/i,
      `${f} vuelve a dejar editar comentarios desde el navegador`);
  }
});

// ── El navegador ─────────────────────────────────────────────────────────────

function ficheros(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      // Las rutas de servidor son justo donde SÍ se escribe (con service-role o con la sesión del panel).
      if (relative(RAIZ, ruta) === join('app', 'api')) continue;
      out.push(...ficheros(ruta));
    } else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) {
      out.push(ruta);
    }
  }
  return out;
}

/** Lo que corre en el navegador: componentes, páginas, stores, el cliente de datos y todo lo que diga 'use client'. */
const CLIENTE = [
  ...ficheros(join(RAIZ, 'components')),
  ...ficheros(join(RAIZ, 'app')),
  ...ficheros(join(RAIZ, 'lib')).filter((f) => {
    const fuente = readFileSync(f, 'utf8');
    return /^\s*['"]use client['"]/m.test(fuente) || f.endsWith(join('lib', 'supabase-data.ts')) || f.includes(join('lib', 'stores'));
  }),
];

test('el barrido ve el código del navegador (no verde por vacío)', () => {
  assert.ok(CLIENTE.length > 200, `solo ${CLIENTE.length} ficheros de cliente`);
  assert.ok(CLIENTE.some((f) => f.endsWith(join('lib', 'supabase-data.ts'))));
  assert.ok(CLIENTE.some((f) => f.endsWith(join('components', 'mensajeria', 'conversaciones-tab.tsx'))));
  assert.ok(!CLIENTE.some((f) => f.includes(join('app', 'api'))), 'las rutas de servidor no cuentan como navegador');
});

test('ninguna pantalla escribe por PostgREST en la mensajería ni edita comentarios del tablón', () => {
  const prohibidas: [RegExp, string][] = [
    [/from\(\s*['"]mensajes['"]\s*\)[\s\S]{0,200}?\.\s*(insert|update|upsert|delete)\s*\(/, 'mensajes'],
    [/from\(\s*['"]conversaciones['"]\s*\)[\s\S]{0,200}?\.\s*(insert|upsert|delete)\s*\(/, 'conversaciones'],
    [/from\(\s*['"]conversacion_participantes['"]\s*\)[\s\S]{0,200}?\.\s*(insert|upsert|delete)\s*\(/, 'conversacion_participantes'],
    [/from\(\s*['"]comentarios_comunidad['"]\s*\)[\s\S]{0,200}?\.\s*(update|upsert)\s*\(/, 'comentarios_comunidad'],
    [/from\(\s*['"](denuncias|normas_comunidad_aceptaciones)['"]\s*\)/, 'las tablas de moderación'],
  ];
  const hallazgos: string[] = [];
  for (const f of CLIENTE) {
    const fuente = readFileSync(f, 'utf8');
    for (const [re, tabla] of prohibidas) if (re.test(fuente)) hallazgos.push(`${relative(RAIZ, f)} → ${tabla}`);
  }
  assert.deepEqual(hallazgos, [], 'escritura desde el navegador que la base de datos ya rechaza: llévala a una ruta de servidor');
});

// ── El servidor traduce lo que decide la base de datos ───────────────────────

test('los códigos del trigger son los que traduce errorDeModeracion', async () => {
  assert.ok(esquema, 'no se encuentra el trigger de hilo cerrado o bloqueado');
  const sql = leer(esquema!);
  const ini = sql.indexOf('create or replace function public.mensajes_conversacion_abierta()');
  const cuerpo = sql.slice(ini, sql.indexOf('$function$;', ini));
  const codigos = new Set([...cuerpo.matchAll(/raise exception '([A-Z_]+)' using errcode = 'P0001'/g)].map((m) => m[1]));
  assert.deepEqual([...codigos].sort(), ['CONVERSACION_BLOQUEADA', 'CONVERSACION_CERRADA']);
  const { errorDeModeracion } = await import('../moderacion/reglas.ts');
  for (const c of codigos) assert.ok(errorDeModeracion({ code: 'P0001', message: c }), `${c} sin traducir`);
  assert.match(sql, /create trigger trg_mensajes_conversacion_abierta\s+before insert on public\.mensajes/);
});

const fuente = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

test('las tres vías que escriben mensajes responden 409 cuando el hilo ya no los admite', () => {
  for (const r of [
    'app/api/public/mensajeria/conversaciones/[id]/mensajes/route.ts',
    'lib/portal-instructora/mensajes-servidor.ts',
    'app/api/mensajeria/conversaciones/[id]/mensajes/route.ts',
  ]) assert.match(fuente(r), /errorDeModeracion\(error/, `${r}: no traduce el error del trigger`);
  assert.match(fuente('app/api/mensajeria/conversaciones/[id]/mensajes/route.ts'), /errorDeModeracion\(error, \{ panel: true \}\)/);
  assert.match(fuente('app/api/portal/instructora/mensajes/route.ts'), /status: 409/);
});

test('las apps no leen lo que el estudio retiró; el panel sí', () => {
  // Hilo: el GET de la alumna y el de la instructora pasan cada mensaje por mensajeParaApp.
  assert.match(fuente('app/api/public/mensajeria/conversaciones/[id]/mensajes/route.ts'), /\.map\(mensajeParaApp\)/);
  assert.match(fuente('lib/portal-instructora/mensajes-servidor.ts'), /\.map\(mensajeParaApp\)/);
  // Bandeja: las tres piden `oculto_en`; las apps ocultan y el panel no.
  for (const [r, ocultar] of [
    ['app/api/public/mensajeria/conversaciones/route.ts', true],
    ['lib/portal-instructora/mensajes-servidor.ts', true],
    ['app/api/mensajeria/conversaciones/route.ts', false],
  ] as const) {
    const f = fuente(r);
    assert.match(f, /'conversacion_id, cuerpo, remitente_auth_user_id, creado_en, oculto_en'/, `${r}: la bandeja no pide oculto_en`);
    assert.match(f, new RegExp(`ocultarRetirados: ${ocultar}`), `${r}: ocultarRetirados debería ser ${ocultar}`);
  }
  // Tablón: lo retirado solo le llega a quien lo escribió.
  assert.match(fuente('app/api/public/comunidad/comentarios/route.ts'), /\.filter\(c => !c\.oculto \|\| c\.esMio\)/);
});
