import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITES_PREMIO, PREFIJO_CODIGO_PREMIO_RESENA } from './premio.ts';
import { CLASES_ANTES_DE_PEDIR_RESENA, DIAS_ENTRE_PETICIONES_RESENA, ESPERA_TRAS_CLASE_MS, VENTANA_VALORACION_MS } from './momento.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato de «Reseñas con premio» (21-nov-2026). Lo que NO puede
// cambiar sin que lo decida el fundador, porque es lo que hace legal el flujo:
//
//   1. El premio es por valorar EN TENTARE, y NO depende de la nota.
//   2. El enlace de reseñas se ofrece a TODAS y NO menciona el premio.
//   3. La función que da el premio es solo del servidor y usa el «hoy» de Madrid.
//
// Premiar la reseña externa no se puede comprobar, Google lo prohíbe (también
// filtrar a quién se le pide) y la normativa de consumo exige declararlo.
// Si falla, se arregla el código, no el test.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

const DIR = join(RAIZ, 'supabase/migrations');
const NOMBRE = readdirSync(DIR).find((n) => n.endsWith('_resenas_con_premio.sql'));
const SQL = NOMBRE ? sinComentarios(readFileSync(join(DIR, NOMBRE), 'utf8')) : '';
const FUNCION = SQL.slice(SQL.indexOf('create or replace function public.otorgar_premio_resena'), SQL.indexOf('revoke all on function public.otorgar_premio_resena'));

test('existe la migración y la función es de solo el servidor', () => {
  assert.ok(NOMBRE, 'falta la migración *_resenas_con_premio.sql');
  assert.ok(FUNCION.length > 200, 'no se encuentra el cuerpo de otorgar_premio_resena');
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.otorgar_premio_resena\\(text, text, boolean\\) from ${rol};`), `falta revoke from ${rol}`);
  }
  assert.match(SQL, /grant execute on function public\.otorgar_premio_resena\(text, text, boolean\) to service_role;/);
  assert.match(SQL, /has_function_privilege\('anon'/, 'la migración debe comprobar los privilegios al acabar');
});

test('el premio NO depende de la nota: la función no lee la puntuación ni el comentario', () => {
  assert.doesNotMatch(FUNCION, /puntuacion|comentario/i);
});

test('el premio exige haber valorado y ser alumna del estudio (no basta con llamar a la función)', () => {
  assert.match(FUNCION, /from public\.valoraciones/);
  assert.match(FUNCION, /from public\.socios/);
  assert.match(FUNCION, /borrado_en is null/);
});

test('una sola vez por alumna y estudio: id determinista, candado y uso único', () => {
  assert.match(FUNCION, /md5\(p_studio_id \|\| ':' \|\| p_socio_id\)/);
  assert.match(FUNCION, /pg_advisory_xact_lock/);
  assert.match(FUNCION, /usos_max[\s\S]*?\b0, 1,/, 'el código es de un solo uso');
});

test('el «hoy» es el de Madrid, nunca current_date', () => {
  assert.match(FUNCION, /hoy_estudio\(\)/);
  assert.doesNotMatch(FUNCION, /current_date/i);
});

test('los topes y el prefijo de la base de datos y de TypeScript coinciden', () => {
  assert.ok(FUNCION.includes(`'${PREFIJO_CODIGO_PREMIO_RESENA}'`), 'el prefijo de la función no es el de premio.ts');
  assert.match(SQL, new RegExp(`'PORCENTAJE' and resena_premio_valor between ${LIMITES_PREMIO.PORCENTAJE.min} and ${LIMITES_PREMIO.PORCENTAJE.max}`));
  assert.match(SQL, new RegExp(`'IMPORTE_FIJO' and resena_premio_valor between ${LIMITES_PREMIO.IMPORTE_FIJO.min} and ${LIMITES_PREMIO.IMPORTE_FIJO.max}`));
  assert.match(SQL, new RegExp(`resena_premio_dias between ${LIMITES_PREMIO.dias.min} and ${LIMITES_PREMIO.dias.max}`));
  assert.match(SQL, /coalesce\(/, 'un CHECK que da NULL se da por válido: el del premio lleva coalesce(…, false)');
  assert.match(SQL, /resena_enlace ~ '\^https:\/\/\[\^\[:space:\]\]\+\$'/, 'el enlace se pinta como href: solo https, en la base de datos');
});

test('las tres puertas de valoración dan el premio; la página del enlace solo lo lee', () => {
  assert.match(leer('app/api/public/valorar/route.ts'), /extrasDeValoracion\([^)]*\{ crear: true \}\)/);
  assert.match(leer('app/api/public/valorar-clase/route.ts'), /extrasDeValoracion\([^)]*\{ crear: true \}\)/);
  assert.match(leer('app/valorar/[token]/page.tsx'), /extrasDeValoracion\([^)]*\{ crear: false \}\)/, 'pintar la página no debe crear premios');
});

test('el enlace de reseñas NO menciona el premio (en la app ni en la página del correo)', () => {
  const app = leer('components/student/domain/PremioValoracion.tsx');
  const bloqueApp = app.slice(app.indexOf('function BloqueEnlace'));
  assert.ok(app.indexOf('function BloqueEnlace') > app.indexOf('function BloquePremio'), 'BloqueEnlace debe ser la última función del fichero (el recorte de este test)');
  const pagina = leer('app/valorar/[token]/premio-resena.tsx');
  const iniPagina = pagina.indexOf('{enlace && (');
  const bloquePagina = pagina.slice(iniPagina, pagina.indexOf('\n      )}', iniPagina));
  for (const [donde, bloque] of [['app', bloqueApp], ['página', bloquePagina]] as const) {
    assert.ok(bloque.length > 100, `no se encuentra el bloque del enlace en ${donde}`);
    // Se mira solo el TEXTO que ve la alumna, sin los comentarios del código.
    const visible = bloque.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(visible, /premio|regal|descuento|gratis|c[oó]digo/i, `el enlace de reseñas de ${donde} no puede hablar del premio`);
  }
});

test('el premio se da igual con cualquier nota: ninguna pantalla lo esconde según la puntuación', () => {
  for (const ruta of ['components/student/domain/PremioValoracion.tsx', 'app/valorar/[token]/premio-resena.tsx', 'lib/valoraciones/premio-servidor.ts']) {
    assert.doesNotMatch(leer(ruta).replace(/\/\/.*$/gm, ''), /puntuacion\s*(>=|<=|>|<|===)/, `${ruta} decide algo por la nota`);
  }
});

test('el estudio solo cambia estas cuatro columnas, y por el servidor', () => {
  const ruta = leer('app/api/estudio/resenas/route.ts');
  const update = ruta.slice(ruta.indexOf('.update({'), ruta.indexOf('}).eq(', ruta.indexOf('.update({')));
  const columnas = [...update.matchAll(/(\w+):/g)].map((m) => m[1]).sort();
  assert.deepEqual(columnas, ['resena_enlace', 'resena_premio_dias', 'resena_premio_tipo', 'resena_premio_valor']);
  assert.match(ruta, /sesion\.rol !== 'PROPIETARIO'/, 'solo la propietaria cambia esto (como el resto de «Cómo me comunico»)');
  assert.match(ruta, /\.eq\('id', g\.sesion\.studioId\)/, 'el estudio sale de la sesión, nunca del body');
});

// ── Pedir la reseña pública: cuándo y a quién ───────────────────────────────

const FUNCION_RECLAMAR = SQL.slice(SQL.indexOf('create or replace function public.reclamar_pedido_resena'), SQL.indexOf('create or replace function public.registrar_clic_resena'));
const CRON = SQL.slice(SQL.indexOf("cron.schedule(\n  'valoraciones-pedir'"));

test('a quién se le enseña el enlace lo decide la ASISTENCIA, nunca la nota (Google prohíbe pedir solo a las contentas)', () => {
  assert.ok(FUNCION_RECLAMAR.length > 200, 'no se encuentra reclamar_pedido_resena');
  assert.match(FUNCION_RECLAMAR, /create or replace function public\.reclamar_pedido_resena\(p_studio_id text, p_socio_id text\)/, 'la función no recibe ninguna nota');
  assert.doesNotMatch(FUNCION_RECLAMAR, /puntuacion|comentario|valoraciones/i);
  assert.match(FUNCION_RECLAMAR, /r\.estado = 'ASISTIDA'/);
  const servidor = readFileSync(join(RAIZ, 'lib/valoraciones/premio-servidor.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(servidor, /puntuacion/i, 'premio-servidor.ts no puede decidir nada por la nota');
});

test('los números de SQL y de TypeScript coinciden: 3 clases, 180 días, 20 min y 48 h', () => {
  assert.match(FUNCION_RECLAMAR, new RegExp(`\\) >= ${CLASES_ANTES_DE_PEDIR_RESENA};`), 'las clases asistidas antes de pedir');
  assert.match(FUNCION_RECLAMAR, new RegExp(`interval '${DIAS_ENTRE_PETICIONES_RESENA} days'`), 'los días entre peticiones');
  assert.ok(CRON.length > 100, 'no se encuentra el cron valoraciones-pedir');
  assert.match(CRON, new RegExp(`s\\.fin < now\\(\\) - interval '${ESPERA_TRAS_CLASE_MS / 60000} minutes'`), 'la espera tras la clase');
  assert.match(CRON, new RegExp(`s\\.fin > now\\(\\) - interval '${VENTANA_VALORACION_MS / 3_600_000} hours'`), 'la ventana de petición');
  assert.match(CRON, /\*\/10 \* \* \* \*/);
});

test('el cron solo llama a Vercel si hay trabajo, y la ruta usa la misma consulta que el barrido de seguridad', () => {
  assert.match(CRON, /where exists \(\s*select 1 from public\.sesiones s/);
  assert.match(CRON, /r\.estado = 'ASISTIDA' and r\.socio_id is not null/);
  const ruta = leer('app/api/cron/valoraciones/route.ts');
  assert.match(ruta, /estudiosConValoracionesPendientes\(/);
  assert.match(ruta, /secretoValido\(/, 'la ruta del cron exige el secreto');
  const worker = leer('lib/inngest/valoraciones.ts');
  assert.match(worker, /estudiosConValoracionesPendientes\(/, 'el barrido de seguridad usa la misma consulta');
  assert.match(worker, /limitesDeBarrido\(Date\.parse\(nowISO\)\)/);
  assert.match(worker, /\.lt\('fin', hastaISO\)/, 'el worker no pide la clase hasta pasados los 20 min');
});

test('el enlace con seguimiento nunca recibe el destino por parámetro (sería una redirección abierta)', () => {
  const ruta = leer('app/resena/[slug]/route.ts');
  const parametros = [...ruta.replace(/\/\/.*$/gm, '').matchAll(/searchParams\.get\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(parametros, ['o'], 'solo el origen (app o qr) viaja en la URL');
  assert.match(ruta, /startsWith\('https:\/\/'\)/, 'solo se redirige a https');
  assert.match(ruta, /registrar_clic_resena/);
  assert.match(SQL, /grant execute on function public\.registrar_clic_resena\(text, text\) to service_role;/);
});

test('la tabla de clics no guarda a nadie y solo la toca el servidor', () => {
  const tabla = SQL.slice(SQL.indexOf('create table if not exists public.resenas_clics'), SQL.indexOf(');', SQL.indexOf('create table if not exists public.resenas_clics')));
  assert.doesNotMatch(tabla, /socio|email|nombre|ip\b/i, 'resenas_clics solo cuenta: por día y origen');
  assert.match(SQL, /alter table public\.resenas_clics enable row level security;/);
  assert.match(SQL, /revoke all on public\.resenas_clics from anon, authenticated;/);
  assert.match(SQL, /create policy exige_doble_factor on public\.resenas_clics as restrictive/);
});
