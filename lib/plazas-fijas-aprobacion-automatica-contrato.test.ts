import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Aprobación automática de plazas fijas sueltas (migr 20261002230422). Estas funciones importan `@/`, así que se vigila el fuente: que lo
// automático sea una puerta ESTRECHA y la MISMA que usa el estudio al aprobar a mano (no una copia), que lo que no pasa las reglas
// se quede para el estudio sin perderse, y que el cupo se cuente dentro del candado de la base.

const raiz = join(import.meta.dirname, '..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');
const SERVIDOR = leer('lib/db/supabase-data-admin.ts');
const entre = (desde: string, hasta: string) => {
  const i = SERVIDOR.indexOf(desde);
  const f = SERVIDOR.indexOf(hasta, i + desde.length);
  assert.ok(i >= 0 && f > i, `no se aisló ${desde}`);
  return SERVIDOR.slice(i, f);
};

const RESOLVER = entre('export async function resolverPeticionPlazaFija', '// ─── Citas 1:1 auto-reservables');
const AUTO = entre('async function aprobarPeticionAutomaticamente', 'export async function solicitarPlazaFijaAlumna');
const SOLICITAR = entre('export async function solicitarPlazaFijaAlumna', 'export async function solicitarPausaPlazaFijaAlumna');
const LEER_AJUSTE = entre('async function aprobacionPlazaFija', 'async function aprobarPeticionAutomaticamente');

test('⚠️ lo automático aprueba POR LA MISMA PUERTA que el estudio: llama a `resolverPeticionPlazaFija`, no la copia', () => {
  assert.match(AUTO, /await resolverPeticionPlazaFija\(admin, \{/);
  // Sin persona detrás, sin confirmar el límite y aprobando: los tres a la vez, o no es automática.
  assert.match(AUTO, /userId: null, solicitudId: p\.solicitudId, aprobar: true, motivo: null, confirmarLimite: false/);
  assert.match(AUTO, /automatica: \{ cupo: cupoAutomatico\(/);
  // No escribe plazas ni cierra peticiones por su cuenta.
  assert.ok(!/from\('plazas_fijas'\)|from\('solicitudes_plaza_fija'\)\s*\.insert/.test(AUTO.replace(/\.update\(\{ estado: 'PENDIENTE'[^)]*\)/, '')), 'solo reabre la petición si se cae');
});

test('⚠️ la puerta de lo automático es estrecha: solo CREAR, sin pasar del límite, aprobando y sin persona', () => {
  assert.match(RESOLVER, /if \(p\.automatica && \(!p\.aprobar \|\| sol\.tipo !== 'CREAR' \|\| sol\.supera_limite \|\| p\.userId !== null\)\) \{\s+return \{ error: [^}]*status: 409/);
  // La del límite se comprueba además al escribir: `confirmarLimite` va falso y `guardarPlazaFijaStaff` vuelve a mirarlo.
  assert.match(AUTO, /confirmarLimite: false/);
});

test('el que decide queda vacío cuando se aprueba sola (`resuelta_por` null) y con persona sigue siendo quien aprueba', () => {
  assert.match(RESOLVER, /resuelta_por: p\.userId/);
  assert.match(RESOLVER, /userId: string \| null;/);
});

test('el cupo se cuenta dentro del candado de la base y solo en la creación automática', () => {
  assert.match(RESOLVER, /\.\.\.\(p\.automatica \? \{ cupo: p\.automatica\.cupo \} : \{\}\),/);
  const guardar = entre('async function guardarPlazaFijaDesdeSesion', 'export async function guardarPlazaFijaStaff');
  assert.match(guardar, /if \(!anterior && cupo !== undefined\) \{\s+[^]*?admin\.rpc\('dar_plaza_fija_con_cupo'/);
  // Sin cupo (mostrador, aprobación manual): el INSERT de siempre, sin tope.
  assert.match(guardar, /: await admin\.from\('plazas_fijas'\)\.insert\(\{ id: idNueva, studio_id: studioId, socio_id: socioId, \.\.\.fila, estado: 'ACTIVA' \}\)/);
  assert.match(guardar, /codigo: 'SIN_CUPO'/);
});

test('⚠️ la aprobación manual del estudio NO lleva `automatica` ni cupo: nada cambia para quien la apruebe a mano', () => {
  const ruta = leer('app/api/plazas-fijas/solicitudes/route.ts');
  const llamada = ruta.slice(ruta.indexOf('resolverPeticionPlazaFija(admin, {'), ruta.indexOf('resolverPeticionPlazaFija(admin, {') + 400);
  assert.ok(!/automatica|cupo/.test(llamada), 'el panel no pasa de forma automática');
  assert.match(llamada, /userId: /);
});

test('lo automático se queda sin aprobar (pendiente para el estudio) si una regla falla o algo se cae, y la petición no se pierde', () => {
  // Pasa a la bandeja de siempre: la notificación al estudio sale después del intento, solo si no se dio.
  const i = SOLICITAR.indexOf('const aprobacion = await aprobacionPlazaFija');
  const j = SOLICITAR.indexOf('emitirPeticionPlazaFija(admin, {');
  assert.ok(i > 0 && j > i, 'primero se intenta, luego se avisa al estudio');
  assert.match(SOLICITAR, /if \(auto\) return \{ ok: true, solicitudId: data\.id, resuelta: true, mensaje: auto\.mensaje \};/);
  // Si se cae tras reclamarla y sin haber dado plaza, vuelve a la bandeja.
  assert.match(AUTO, /\.eq\('estado', 'APROBADA'\)\.is\('resultado_plaza_id', null\)/);
  assert.match(AUTO, /return 'ok' in r \? \{ mensaje:/);
});

test('las reglas que se miran antes de escribir son las del estudio: reservas con aprobación, impago y límite semanal', () => {
  assert.match(AUTO, /heredaOverride\(reglasTipo\.requiereAprobacion, pol\.requiereAprobacion\)/);
  assert.match(AUTO, /'socio_tiene_impago'/);
  // Sin poder comprobar el impago, no se aprueba solo.
  assert.match(AUTO, /impagoBloqueante = errImpago \? true : impago === true/);
  assert.match(AUTO, /superaLimite: p\.superaLimite/);
  assert.match(SOLICITAR, /superaLimite: !!v\.exceso/);
});

test('⚠️ el ajuste se lee con tolerancia: sin la columna (código antes que migración) vuelve a MANUAL, que es lo de siempre', () => {
  assert.match(LEER_AJUSTE, /if \(error\) \{\s+capturarExcepcion\(/);
  assert.match(LEER_AJUSTE, /return \{ modo: 'MANUAL', topePct: TOPE_AUTOMATICO_POR_DEFECTO_PCT \};/);
  assert.match(LEER_AJUSTE, /data\?\.plaza_fija_aprobacion === 'AUTOMATICA' \? 'AUTOMATICA' : 'MANUAL'/);
  // Y la lectura de las demás reglas del estudio (la de pedir plaza) NO se toca: sigue sin las columnas nuevas.
  assert.ok(!/plaza_fija_aprobacion/.test(SOLICITAR.slice(0, SOLICITAR.indexOf('const aprobacion = await'))), 'la lectura de siempre no depende de la migración');
});

test('a la alumna se le dice lo que pasó: un mensaje propio, no un correo de lo que acaba de hacer ella', () => {
  assert.match(RESOLVER, /if \(p\.automatica\) \{ paraAlumna = respuesta; return; \}/);
  assert.match(RESOLVER, /Tu clase fija de \$\{franja\} está confirmada\./);
  const ruta = leer('app/api/public/plaza-fija/route.ts');
  assert.match(ruta, /NextResponse\.json\(r\)/, 'la respuesta lleva `resuelta` y `mensaje` tal cual');
});

test('la migración deja la función cerrada a anon y authenticated, con candado por franja y sin tocar lo de antes', () => {
  const nombre = readdirSync(join(raiz, 'supabase/migrations')).find(f => f.includes('plaza_fija_aprobacion_automatica'));
  assert.ok(nombre, 'falta la migración');
  const sql = leer(`supabase/migrations/${nombre}`);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\(p_studio_id \|\| ':franja:'/);
  assert.match(sql, /revoke all on function public\.dar_plaza_fija_con_cupo\(text, jsonb, integer\) from anon;/);
  assert.match(sql, /revoke all on function public\.dar_plaza_fija_con_cupo\(text, jsonb, integer\) from authenticated;/);
  assert.match(sql, /grant execute on function public\.dar_plaza_fija_con_cupo\(text, jsonb, integer\) to service_role;/);
  // Aditiva: el valor por defecto es el comportamiento de hoy.
  assert.match(sql, /plaza_fija_aprobacion text not null default 'MANUAL'/);
  assert.match(sql, /grant update \(plaza_fija_aprobacion, plaza_fija_auto_tope_pct\) on public\.studios to authenticated;/);
});
