import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// «Reservar cada semana» (autoreservable) en una clase suelta: la alumna elige cuánto tiempo la quiere y la plaza fija
// llega hasta esa fecha. Es una plaza fija con `vigencia_hasta` (el motor ya la respeta): NO hay concepto, tabla ni
// migración nuevos. Lo que fija este fichero es que el servidor lo hace bien en los cuatro sitios que lo tocan.
//
// El efecto contra una base de datos real no se puede probar desde aquí (estas funciones importan `@/`), así que se
// vigila el fuente, como hace el resto de guardias de este repo.

const raiz = join(import.meta.dirname, '..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');
const SERVIDOR = leer('lib/db/supabase-data-admin.ts');

/** El cuerpo de una función exportada, hasta la siguiente. */
function cuerpo(fuente: string, firma: string): string {
  const i = fuente.indexOf(firma);
  assert.ok(i >= 0, `no se encuentra ${firma}`);
  const j = fuente.indexOf('\nexport ', i + firma.length);
  return fuente.slice(i, j > 0 ? j : undefined);
}

test('⚠️ pedir: la duración se valida contra las cerradas y la FECHA la pone el servidor, nunca el body', () => {
  const pedir = cuerpo(SERVIDOR, 'export async function solicitarPlazaFijaAlumna');
  assert.match(pedir, /duracionPedida\(p\.duracionMeses, hoy\)/);
  assert.match(pedir, /if \(!duracion\.ok\) return \{ error: duracion\.error, status: 400 \}/);
  assert.match(pedir, /vigenciaHasta: duracion\.hasta/, 'se valida con la fecha de fin que luego se guarda');
  assert.match(pedir, /duracion_meses: duracion\.meses, vigencia_hasta_propuesta: duracion\.hasta/);
  // La petición sin duración no escribe esas columnas: como siempre.
  assert.match(pedir, /\.\.\.\(duracion\.hasta \? \{/);

  const ruta = leer('app/api/public/plaza-fija/route.ts');
  const llamada = ruta.slice(ruta.indexOf('solicitarPlazaFijaAlumna(admin'), ruta.indexOf('solicitarPlazaFijaAlumna(admin') + 200);
  assert.match(llamada, /duracionMeses: body\.duracionMeses/);
  assert.ok(!/hasta|vigencia/i.test(llamada.replace('duracionMeses', '')), 'la ruta no pasa ninguna fecha del cliente a la petición');
});

test('⚠️ pedir de nuevo una plaza que ya venció es posible: la vencida no cuenta como «ya tiene una en ese horario»', () => {
  const pedir = cuerpo(SERVIDOR, 'export async function solicitarPlazaFijaAlumna');
  assert.match(pedir, /TEXTOS_PLAZA_FIJA_ALUMNA, \{ ignorarVencidas: true \}/);
  // Y el panel no cambia al VALIDAR: sin la opción se cuentan todas, como siempre.
  assert.match(SERVIDOR, /opciones\.ignorarVencidas \? suyas\.filter\(p => !p\.vigenciaHasta \|\| p\.vigenciaHasta >= hoyPlaza\) : suyas/);
});

test('⚠️ aprobar: la plaza llega hasta la fecha fijada AL PEDIR, y si ya pasó no se da (antes de reclamar la petición)', () => {
  const aprobar = cuerpo(SERVIDOR, 'export async function resolverPeticionPlazaFija');
  const crear = aprobar.slice(aprobar.indexOf("if (sol.tipo === 'CREAR') {"), aprobar.indexOf("if (sol.tipo === 'PAUSAR')"));
  assert.ok(crear.length > 100, 'no se aisló la rama CREAR');
  assert.match(crear, /const hastaPedida = sol\.vigencia_hasta_propuesta \?\? null/);
  assert.match(crear, /vigenciaHasta: hastaPedida/);
  assert.ok(!/vigenciaHasta: null/.test(crear), 'la rama CREAR ya no fija la plaza sin fecha de fin');
  const rechazoPasada = crear.indexOf('hastaPedida < hoyEnEstudio()');
  assert.ok(rechazoPasada > 0, 'falta el rechazo de una duración ya pasada');
  assert.ok(rechazoPasada < crear.indexOf("cerrar('APROBADA')"), 'tiene que rechazarla ANTES de reclamar la petición, o quedaría aprobada sin plaza');
  assert.match(crear.slice(rechazoPasada, rechazoPasada + 300), /status: 409/);
});

test('⚠️ crear una plaza aparta antes las vencidas de la franja (el índice único las rechazaría) y solo al CREAR', () => {
  const guardar = SERVIDOR.slice(SERVIDOR.indexOf('async function guardarPlazaFijaDesdeSesion'), SERVIDOR.indexOf('export async function guardarPlazaFijaStaff'));
  assert.match(guardar, /\{ ignorarVencidas: !plazaId \}/, 'editar una plaza existente no cambia');
  const aparta = guardar.indexOf('plazasVencidasQueEstorban(');
  assert.ok(aparta > 0, 'falta apartar las vencidas');
  assert.match(guardar.slice(aparta, aparta + 800), /estado: 'BAJA'/);
  assert.ok(aparta < guardar.indexOf("from('plazas_fijas').insert("), 'hay que apartarlas ANTES de escribir la nueva');
  assert.ok(aparta < guardar.indexOf('const escritura = anterior'), 'y antes de decidir entre editar o crear');
  // Solo si hay vencidas y solo al crear (`if (!plazaId)`): el camino de editar no pasa por ahí.
  assert.match(guardar.slice(guardar.indexOf('if (!plazaId) {'), aparta), /if \(!plazaId\) \{/);
});

test('la bandeja del estudio dice cuánto durará una petición suelta', () => {
  assert.match(SERVIDOR, /f\.tipo === 'CREAR' && f\.duracion_meses \? ` · \$\{etiquetaDuracion\(f\.duracion_meses\)\}` : ''/);
});

test('⚠️ la app de la alumna pasa «hoy» a la ficha y al horario: una plaza vencida no la deja con «Ya es tu clase fija»', () => {
  assert.match(leer('lib/student/mapeo.ts'), /plazaFijaEnClaseDe\(clase, sesiones, [^)]*, tieneCuota, hoyEnEstudio\(\)\)/);
  const cf = leer('lib/student/clases-fijas.ts');
  assert.match(cf.slice(cf.indexOf('plazaFijaEnFranja(\n')), /^plazaFijaEnFranja\(\n\s+f, socia\?\.plazasFijas[\s\S]*?\n\s+hoy,\n\s+\),/);
});

test('sin migración: las columnas ya existían (migr 20260921230223) y ningún CHECK las liga a las clases fijas con nombre para CREAR', () => {
  const m = leer('supabase/migrations/20260921230223_clases_fijas_del_estudio.sql');
  assert.match(m, /add column if not exists duracion_meses smallint/);
  assert.match(m, /add column if not exists vigencia_hasta_propuesta date/);
});
