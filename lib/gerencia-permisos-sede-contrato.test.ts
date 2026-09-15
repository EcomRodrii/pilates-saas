import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { puedeGestionarSede } from './permisos-reglas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Contrato: permisos de sede para la gerencia (migr *_permisos_de_sede_para_la_gerencia).
//
// La gerencia lleva la operación de su sede; el dinero, el contrato y la cuenta
// siguen siendo de la propietaria. Aquí se comprueba:
//  · el ESTADO VIGENTE de las políticas de cada tabla, recorriendo todas las
//    migraciones en orden (una posterior que vuelva a abrir una tabla con un
//    `for all` solo por estudio hace fallar esto),
//  · la función, el trigger de las reglas de dinero de `tipos_clase` y sus grants,
//  · que la UI dice lo mismo que la RLS, las rutas de servidor que cuelgan de
//    esto, y que las escrituras del navegador cuentan filas.
//
// Si falla, no se relaja el test: se arregla la migración o el código.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const DIR = join(RAIZ, 'supabase/migrations');
const sinComentariosSql = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const sinLineasComentadasTs = (ts: string) => ts.replace(/^\s*\/\/.*$/gm, '');

const FICHERO = readdirSync(DIR).find(n => n.endsWith('_permisos_de_sede_para_la_gerencia.sql'));
const SQL = FICHERO ? sinComentariosSql(readFileSync(join(DIR, FICHERO), 'utf8')) : '';

/** Políticas vivas de una tabla tras aplicar TODAS las migraciones en orden. */
function politicasVivas(tabla: string): Map<string, string> {
  const vivas = new Map<string, string>();
  for (const f of readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()) {
    const sql = sinComentariosSql(readFileSync(join(DIR, f), 'utf8'));
    const re = /\b(create|drop|alter)\s+policy\s+(?:if\s+exists\s+)?"?(\w+)"?\s+on\s+(?:public\.)?"?(\w+)"?[^;]*;/gi;
    for (const m of sql.matchAll(re)) {
      if (m[3].toLowerCase() !== tabla) continue;
      const nombre = m[2].toLowerCase();
      const accion = m[1].toLowerCase();
      if (accion === 'drop') {
        vivas.delete(nombre);
      } else if (accion === 'create') {
        vivas.set(nombre, m[0]);
      } else {
        const renombre = /rename\s+to\s+"?(\w+)"?/i.exec(m[0]);
        const previa = vivas.get(nombre) ?? '';
        vivas.delete(nombre);
        vivas.set(renombre ? renombre[1].toLowerCase() : nombre, `${previa}\n${m[0]}`);
      }
    }
  }
  return vivas;
}

type Esperada = { tabla: string; prefijo: string; escritura: string; borrado?: string };

const TABLAS: Esperada[] = [
  { tabla: 'studio_horario', prefijo: 'studio_horario', escritura: 'puede_gestionar_sede' },
  { tabla: 'cierres_estudio', prefijo: 'cierres', escritura: 'puede_gestionar_sede' },
  { tabla: 'salas', prefijo: 'salas', escritura: 'puede_gestionar_sede' },
  { tabla: 'spots', prefijo: 'spots', escritura: 'puede_gestionar_sede' },
  { tabla: 'bloqueos_maquina', prefijo: 'bloqueos_maquina', escritura: 'puede_gestionar_sede' },
  { tabla: 'citas_disponibilidad', prefijo: 'citas_disponibilidad', escritura: 'puede_gestionar_sede' },
  { tabla: 'tipos_clase', prefijo: 'tipos_clase', escritura: 'puede_gestionar_sede', borrado: 'puede_configurar_negocio' },
  { tabla: 'citas_servicios', prefijo: 'citas_servicios', escritura: 'puede_configurar_negocio' },
  { tabla: 'plan_tipos_clase', prefijo: 'plan_tipos_clase', escritura: 'puede_mover_dinero' },
];

test('existe la migración de permisos de sede', () => {
  assert.ok(FICHERO, 'falta *_permisos_de_sede_para_la_gerencia.sql');
});

test('cada tabla queda con lectura del estudio y escritura por rol, sin ningún «for all»', () => {
  for (const { tabla, prefijo, escritura, borrado } of TABLAS) {
    const vivas = politicasVivas(tabla);
    assert.deepEqual(
      [...vivas.keys()].sort(),
      [`${prefijo}_delete`, `${prefijo}_insert`, `${prefijo}_lectura`, `${prefijo}_update`].sort(),
      `${tabla}: políticas vigentes inesperadas`,
    );

    const lectura = vivas.get(`${prefijo}_lectura`)!;
    assert.match(lectura, /for\s+select\s+to\s+authenticated/i, `${tabla}: lectura`);
    assert.match(lectura, /studio_id\s*=\s*(public\.)?current_studio_id\(\)/i, `${tabla}: lectura por estudio`);
    assert.doesNotMatch(lectura, /puede_/i, `${tabla}: la lectura no cambia de roles`);

    const casos: Array<[string, RegExp, string]> = [
      ['insert', /for\s+insert\s+to\s+authenticated\s+with\s+check/i, escritura],
      ['update', /for\s+update\s+to\s+authenticated\s+using[\s\S]*with\s+check/i, escritura],
      ['delete', /for\s+delete\s+to\s+authenticated\s+using/i, borrado ?? escritura],
    ];
    for (const [cmd, forma, fn] of casos) {
      const def = vivas.get(`${prefijo}_${cmd}`)!;
      assert.match(def, forma, `${tabla}_${cmd}: forma`);
      assert.match(def, /studio_id\s*=\s*(public\.)?current_studio_id\(\)/i, `${tabla}_${cmd}: estudio`);
      assert.match(def, new RegExp(String.raw`\b${fn}\(\)`), `${tabla}_${cmd}: tiene que exigir ${fn}()`);
      const usos = def.match(/\bpuede_\w+\(\)/g) ?? [];
      assert.ok(usos.every(u => u === `${fn}()`), `${tabla}_${cmd}: solo ${fn}(), no ${usos.join(', ')}`);
    }
  }
});

test('tipos_clase: la migración no toca el borrado (sigue siendo de la propietaria)', () => {
  assert.doesNotMatch(SQL, /(create|drop|alter)\s+policy\s+(if\s+exists\s+)?tipos_clase_delete\b/i);
});

test('puede_gestionar_sede(): propietaria y gerencia, definer con search_path fijo', () => {
  assert.match(SQL,
    /create or replace function public\.puede_gestionar_sede\(\) returns boolean\s+language sql stable security definer\s+set search_path = public/i);
  assert.match(SQL, /select public\.current_rol\(\) in \('PROPIETARIO', 'MANAGER'\);/);
});

test('puede_gestionar_sede(): grants explícitos (el default ACL no basta)', () => {
  assert.match(SQL, /revoke all on function public\.puede_gestionar_sede\(\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function public\.puede_gestionar_sede\(\) to authenticated, service_role;/);
  assert.doesNotMatch(SQL, /grant[^;]*puede_gestionar_sede\(\)[^;]*\banon\b/i);
});

test('la UI reparte igual que la función SQL', () => {
  const roles = [...(/current_rol\(\) in \(([^)]*)\)/.exec(SQL)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(roles.sort(), ['MANAGER', 'PROPIETARIO']);
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'] as const) {
    assert.equal(puedeGestionarSede(rol), roles.includes(rol), rol);
  }
});

test('tipos_clase: las reglas de dinero solo las fija la propietaria (trigger, 42501)', () => {
  const m = /create or replace function public\.tipos_clase_dinero_solo_propietaria\(\)([\s\S]*?)\$\$([\s\S]*?)\$\$/i.exec(SQL);
  assert.ok(m, 'falta public.tipos_clase_dinero_solo_propietaria()');
  const [, cabecera, cuerpo] = m!;
  assert.match(cabecera, /returns trigger/i);
  assert.match(cabecera, /security invoker/i);
  assert.match(cabecera, /set search_path = ''/i);
  assert.match(cuerpo, /public\.es_llamada_servicio\(\) or public\.puede_configurar_negocio\(\)/);
  assert.doesNotMatch(cuerpo, /auth\.uid/, 'el servidor se reconoce con es_llamada_servicio()');
  for (const col of ['penalizacion_importe_eur', 'ventana_cancelacion_horas', 'reserva_exigir_plan']) {
    assert.match(cuerpo, new RegExp(String.raw`new\.${col}\s+is not null`), `${col}: alta`);
    assert.match(cuerpo, new RegExp(String.raw`new\.${col}\s+is distinct from old\.${col}`), `${col}: edición`);
  }
  assert.equal((cuerpo.match(/errcode = '42501'/g) ?? []).length, 2, 'error explícito, nunca NULL en silencio');
  assert.doesNotMatch(cuerpo, /:=\s*null/i, 'no se ignora el valor: se rechaza');

  assert.match(SQL, /revoke all on function public\.tipos_clase_dinero_solo_propietaria\(\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function public\.tipos_clase_dinero_solo_propietaria\(\) to service_role;/);
  assert.match(SQL,
    /create trigger trg_tipos_clase_dinero_solo_propietaria\s+before insert or update on public\.tipos_clase\s+for each row execute function public\.tipos_clase_dinero_solo_propietaria\(\);/i);
});

// ─── Rutas de servidor ───────────────────────────────────────────────────────

test('R1: registrar dominios de wallet en Stripe es solo de la propietaria', () => {
  const ruta = sinLineasComentadasTs(readFileSync(join(RAIZ, 'app/api/widget/dominios-wallet/route.ts'), 'utf8'));
  assert.match(ruta, /if \(sesion\.rol !== 'PROPIETARIO'\)/);
  assert.doesNotMatch(ruta, /puedeVer\(/, 'Configuración la ve también la gerencia: no vale como permiso de dinero');
});

test('cierres del centro: la ruta pide lo mismo que la RLS (recepción fuera)', () => {
  const ruta = sinLineasComentadasTs(readFileSync(join(RAIZ, 'app/api/cierres/route.ts'), 'utf8'));
  assert.equal((ruta.match(/if \(!puedeGestionarSede\(sesion\.rol\)\)/g) ?? []).length, 2, 'POST y DELETE');
  assert.doesNotMatch(ruta, /puedeGestionarCalendario/);
});

// ─── R2: las escrituras del navegador cuentan filas ──────────────────────────

const DATA = readFileSync(join(RAIZ, 'lib/supabase-data.ts'), 'utf8');

/** Cuerpo de una función de nivel superior de supabase-data.ts. */
function cuerpoDe(nombre: string): string {
  const inicio = DATA.search(new RegExp(String.raw`^(export )?async function ${nombre}\(`, 'm'));
  assert.ok(inicio !== -1, `falta ${nombre} en lib/supabase-data.ts`);
  const resto = DATA.slice(inicio + 1);
  const fin = resto.search(/^(export |async function |function |const |\/\/ ─)/m);
  return DATA.slice(inicio, fin === -1 ? undefined : inicio + 1 + fin);
}

test('R2: toda UPDATE/DELETE/UPSERT de estas tablas en el navegador pide filas de vuelta', () => {
  const tablas = ['salas', 'spots', 'bloqueos_maquina', 'citas_servicios', 'citas_disponibilidad',
    'plan_tipos_clase', 'tipos_clase', 'studio_horario'];
  const fallos: string[] = [];
  for (const t of tablas) {
    for (const m of DATA.matchAll(new RegExp(String.raw`\.from\('${t}'\)`, 'g'))) {
      const sentencia = DATA.slice(m.index, DATA.indexOf(';', m.index));
      if (/\.(update|delete|upsert)\(/.test(sentencia) && !/\.select\(/.test(sentencia)) {
        const linea = DATA.slice(0, m.index).split('\n').length;
        fallos.push(`lib/supabase-data.ts:${linea} (${t})`);
      }
    }
  }
  assert.deepEqual(fallos, [], 'sin .select() un cambio que la RLS deja en cero filas se lee como guardado');
});

test('R2: cero filas es un fallo con mensaje, no «Guardado»', () => {
  const porId = ['dbUpdateSala', 'dbDeleteSala', 'dbUpdateTipoClase', 'dbDeleteTipoClase',
    'dbUpdateServicioCita', 'dbDeleteServicioCita', 'dbCerrarBloqueoMaquina'];
  for (const fn of porId) {
    const cuerpo = cuerpoDe(fn);
    assert.match(cuerpo, /\.select\('id'\)/, `${fn}: .select('id')`);
    assert.match(cuerpo, /if \(!\w+\?\.length\)\s*\{?\s*return sinFilasTocadas\(/, `${fn}: trata cero filas`);
  }

  const disponibilidad = cuerpoDe('dbReplaceDisponibilidadCitas');
  assert.match(disponibilidad, /\.select\('id'\)/);
  assert.match(disponibilidad, /if \(!borradas\?\.length\)/);
  assert.match(disponibilidad, /No tienes permiso para cambiar el horario de citas/);

  const cobertura = cuerpoDe('sincronizarTiposDePlan');
  assert.equal((cobertura.match(/\.select\('plan_id'\)/g) ?? []).length, 2, 'UPDATE y DELETE');
  assert.match(cobertura, /if \(!tocadas\?\.length\) return \{ ok: false/);
  assert.match(cobertura, /if \(!borradas\?\.length\) return \{ ok: false/);

  const motivo = cuerpoDe('sinFilasTocadas');
  assert.match(motivo, /\.select\('id'\)\.eq\('id', id\)\.maybeSingle\(\)/, 'distingue permiso de fila que ya no está');
});

test('importar horario: crear tipos de clase nuevos exige lo mismo que la RLS (recepción solo usa los que existen)', () => {
  const ruta = sinLineasComentadasTs(readFileSync(join(RAIZ, 'app/api/clases/import/route.ts'), 'utf8'));
  const guardia = ruta.indexOf('nuevosTipos.length > 0 && !puedeGestionarSede(sesion.rol)');
  const insert = ruta.indexOf(".from('tipos_clase').insert(");
  assert.ok(guardia > 0, 'la ruta comprueba puedeGestionarSede antes de crear tipos');
  assert.ok(insert > guardia, 'la comprobación va antes del insert en tipos_clase');
  assert.match(ruta.slice(guardia, insert), /status: 403/);
});
