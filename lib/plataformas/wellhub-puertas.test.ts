import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Dónde se cumple cada regla de la integración con Wellhub en los ficheros que
// `node --test` no puede cargar (rutas, servidor). La lógica pura vive en
// wellhub-firma.ts, wellhub-eventos.ts y wellhub/horario.ts, con sus tests;
// aquí se fija que cada puerta la use, y en el orden que importa.

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (p: string) => sinComentarios(readFileSync(join(raiz, p), 'utf8'));

test('webhook: la firma se comprueba ANTES de leer nada, con las credenciales de Tentare (sin ellas, 401)', () => {
  const s = leer('app/api/plataformas/wellhub/webhook/route.ts');
  const firma = s.indexOf('verificarFirmaWellhub(cred.secretosWebhook');
  const noAutorizado = s.indexOf("if (!cred || !variante) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });");
  const parse = s.indexOf('JSON.parse(cuerpoCrudo)');
  const admin = s.indexOf('getSupabaseAdmin()');
  assert.ok(firma > 0 && noAutorizado > firma && parse > noAutorizado && admin > parse);
  // La firma va sobre el cuerpo CRUDO (req.text), no sobre un objeto ya parseado.
  assert.match(s, /const cuerpoCrudo = await req\.text\(\);/);
});

test('webhook: ⚠️ nunca el cuerpo en un log (lleva datos personales de la socia)', () => {
  const s = leer('app/api/plataformas/wellhub/webhook/route.ts');
  // Ni el cuerpo (crudo o parseado) ni el evento entero, como argumento o en `extra`.
  const prohibido = /cuerpoCrudo|\bcuerpo\s*[,)}]|\bevento:\s*e\b|\.\.\.e\b|lectura\.evento/;
  const llamadas = s.split('\n').filter(l => /console\.|Sentry\.|extra:/.test(l));
  assert.ok(llamadas.length > 0);
  for (const linea of llamadas) assert.doesNotMatch(linea, prohibido, linea.trim());
});

test('webhook: ⚠️ la escritura durable va ANTES de contestar; lo que habla con Wellhub, después (after)', () => {
  const s = leer('app/api/plataformas/wellhub/webhook/route.ts');
  for (const [registrar, despues] of [
    ['await registrarReservaPedidaWellhub(admin, e, Date.now())', 'sincronizarReservaWellhub(admin, cred, r.reservaId)'],
    ['await registrarCancelacionWellhub(admin, e)', 'aplicarCancelacionWellhub(admin, r.studioId, r.reservaId)'],
    ['await registrarCheckinWellhub(admin, e)', 'resolverCheckinWellhub(admin, cred, r.id)'],
  ] as const) {
    const a = s.indexOf(registrar);
    const b = s.indexOf(despues, a);
    assert.ok(a > 0 && b > a, registrar);
    // Lo de después va dentro de `enSegundoPlano` (after), nunca esperado antes del 200.
    const tramo = s.slice(a, b);
    assert.match(tramo, /enSegundoPlano\(/, despues);
  }
  assert.match(s, /function enSegundoPlano[\s\S]*?after\(async \(\) => \{/);
  // Si la base de datos no contesta: 500, para que Wellhub reintente.
  assert.equal((s.match(/if \(r\.tipo === 'error'\) return reintentar\(/g) ?? []).length, 3);
});

test('reserva pedida: la plaza la decide la RPC de siempre con el cupo como límite, y queda «Requested» hasta que Wellhub diga que sí', () => {
  const s = leer('lib/plataformas/wellhub/servidor.ts');
  const fn = s.slice(s.indexOf('export async function registrarReservaPedidaWellhub'), s.indexOf('export async function rechazarReservaWellhub'));
  assert.ok(fn.indexOf('reservaPedidaCaducada(e.momento, ahora)') > 0, 'más de 15 min: ni se intenta');
  assert.match(fn, /admin\.rpc\('reservar_plaza_externa'/);
  assert.match(fn, /p_exigir_cupo: true/);
  assert.match(fn, /conexion\.gymId !== e\.gymId/, 'el gym del evento tiene que ser el del estudio');
  assert.match(fn, /\.update\(\{ estado_externo: 'Requested'[\s\S]*?\.is\('estado_externo', null\)/);
  // Id determinista: un reintento del mismo booking_number no crea otra reserva.
  assert.match(fn, /const reservaId = `res-wh-\$\{e\.bookingNumber\}`;/);
});

test('⚠️ confirmar: se coge la reserva ANTES del RESERVED y se decide con lo que contesta Wellhub, nunca con el reloj', () => {
  const s = leer('lib/plataformas/wellhub/servidor.ts');
  const fn = s.slice(s.indexOf('export async function sincronizarReservaWellhub'), s.indexOf('function sinRespuesta'));
  assert.match(fn, /accionReservaWellhub\(/);
  // Cogerla (CAS a 'Confirming') va antes de mandar el RESERVED: dos a la vez podían dar un 204 y un 4xx.
  const coger = fn.indexOf("marcarExterno(admin, r.id, 'Confirming', r,");
  const reserved = fn.indexOf("{ status: 'RESERVED' }");
  assert.ok(coger > 0 && reserved > coger);
  assert.match(fn, /if \(!\(await marcarExterno\(admin, r\.id, 'Confirming'[^;]*\)\)\) return 'nada';/);
  assert.match(fn, /trasConfirmarWellhub\(res\.status, primera\)/);
  // Lo que se escribe después, solo si sigue cogida por este proceso.
  assert.match(fn, /case 'reservada':\s*await marcarExterno\(admin, r\.id, 'Booked', mia\)/);
  assert.match(fn, /case 'dudosa':[\s\S]*?marcarExterno\(admin, r\.id, 'Booked', mia\)/);
  assert.match(fn, /case 'rechazada':[\s\S]*?cancelarAquiWellhub\(admin, r\.studio_id, r\.id, 'Cancelled', mia\)/);
  // Ningún plazo decide: ni minutos ni el reloj (el `ahora` solo sella la cesión).
  assert.doesNotMatch(fn.slice(fn.indexOf('{')), /Date\.now\(\)|MINUTOS|60_000/);
  // Toda escritura del estado externo es condicional a lo leído.
  const marcar = s.slice(s.indexOf('async function marcarExterno'), s.indexOf('export async function cancelarAquiWellhub'));
  assert.match(marcar, /q\.eq\('estado_externo', leido\.estado_externo\)/);
  assert.match(marcar, /q\.eq\('estado_externo_en', leido\.estado_externo_en\)/);
});

test('el estudio cancela aquí una reserva confirmada allí: se anula en Wellhub (si no, la socia la sigue viendo)', () => {
  const s = leer('lib/plataformas/wellhub/servidor.ts');
  assert.match(s, /\{ status: 'CANCELLED_BY_GYM', reason: /);
  const conciliar = s.slice(s.indexOf('export async function conciliarWellhub'));
  assert.match(conciliar, /\.eq\('estado_externo', 'Booked'\)\.eq\('estado', 'CANCELADA'\)/);
  assert.match(conciliar, /\.eq\('estado_externo', 'Confirming'\)\.lt\('estado_externo_en', iso\(ahora - CESION_CONFIRMACION_MS\)\)/);
});

test('cancelar aquí: una sola puerta (marca y después cancela), por el dueño único y sin penalización del estudio', () => {
  const s = leer('lib/plataformas/wellhub/servidor.ts');
  assert.equal((s.match(/ejecutarCancelacionReserva\(/g) ?? []).length, 1);
  assert.match(s, /ejecutarCancelacionReserva\(admin, \{ studioId, reservaId, socioId: null, omitirPenalizacion: true \}\)/);
  const cancelar = s.slice(s.indexOf('export async function cancelarAquiWellhub'), s.indexOf('// ── Cancelaciones'));
  assert.ok(cancelar.indexOf('marcarExterno(') > 0 && cancelar.indexOf('marcarExterno(') < cancelar.indexOf('aplicarCancelacionWellhub('), 'primero la marca');
  const horario = leer('lib/plataformas/wellhub/horario-servidor.ts');
  assert.doesNotMatch(horario, /ejecutarCancelacionReserva/);
  assert.match(horario, /cancelarAquiWellhub\(admin, studioId, r\.id as string, 'Cancelled'\)/);
});

test('cambio de gym: la clase se guarda por tipo Y gym (la vieja no se pisa) y las reservas se contestan con el gym de su clase', () => {
  const horario = leer('lib/plataformas/wellhub/horario-servidor.ts');
  assert.match(horario, /onConflict: 'plataforma,studio_id,tipo_clase_id,contenedor_externo_id'/);
  const migracion = readFileSync(join(raiz, 'supabase/migrations/20261007170000_wellhub_por_api.sql'), 'utf8');
  assert.match(migracion, /plataforma_clases_tipo\s+on public\.plataforma_clases \(plataforma, studio_id, tipo_clase_id, contenedor_externo_id\)/);
  const s = leer('lib/plataformas/wellhub/servidor.ts');
  assert.match(s, /const gym = await gymDeLaReserva\(admin, r\);/);
});

test('check-ins: el Wellhub ID se borra de la fila al resolverse (datos mínimos)', () => {
  const s = leer('lib/plataformas/wellhub/servidor.ts');
  const fn = s.slice(s.indexOf('export async function resolverCheckinWellhub'), s.indexOf('async function reservaDeCheckin'));
  assert.match(fn, /\.update\(\{ estado, id_cliente_externo: null, resuelto_en:/);
  // «Ya validado» sin booking_number no da por venida a nadie (puede ser el check-in del día gastado en otra cosa).
  assert.match(fn, /r === 'validado' \|\| \(r === 'ya-validado' && ck\.id_reserva_externa\)/);
});

test('cron: lo primero de cada pasada es conciliar (el tope de llamadas no puede dejarlo para luego)', () => {
  const s = leer('lib/plataformas/wellhub/horario-servidor.ts');
  const fn = s.slice(s.indexOf('export async function sincronizarWellhub'));
  const conciliar = fn.indexOf('await conciliarWellhub(admin, cred, presupuesto, ahora)');
  const cargar = fn.indexOf('await cargarEstudio(');
  assert.ok(conciliar > 0 && cargar > conciliar);
  // Retira también lo de estudios sin conexión o apagados (sigue vivo en la app de Wellhub).
  assert.match(fn, /from\('plataforma_clases'\)\.select\('studio_id'\)/);
  assert.match(fn, /from\('plataforma_eventos'\)\.select\('studio_id'\)/);
});

test('cron: un slot creado que no se puede apuntar se borra allí (si no, sus reservas darían «clase no encontrada»)', () => {
  const s = leer('lib/plataformas/wellhub/horario-servidor.ts');
  const tramo = s.slice(s.indexOf("case 'crear-slot':"));
  assert.match(tramo, /if \(error\) \{[\s\S]*?borrarSlotWellhub\(cred, cfg\.gymId, claseId, creado\.valor\)/);
});

test('pasar lista valida en Wellhub desde el panel y desde la app de la instructora, con el mismo dueño', () => {
  const ruta = leer('app/api/plataformas/wellhub/validar/route.ts');
  assert.match(ruta, /verificarSesionStaff\(req\)/);
  assert.match(ruta, /puedeApuntarEnClase\(sesion\.rol\)/);
  assert.match(ruta, /studioId: sesion\.studioId/, 'el estudio sale de la sesión, nunca del body');
  const app = leer('lib/portal-instructora/lista-servidor.ts');
  assert.match(app, /reserva\.origen === 'WELLHUB'[\s\S]*?validarAsistenciaWellhub\(admin, credencialesWellhub\(\)/);
  const panel = leer('lib/studio-context.tsx');
  assert.match(panel, /if \(reserva\.origen === 'WELLHUB'\) return \{ ok: true, aviso: await validarEnWellhub\(reservaId\) \};/);
  const calendario = leer('app/(dashboard)/calendario/page.tsx');
  assert.match(calendario, /else if \(res\.aviso\) showToast\(res\.aviso\);/);
});

test('/interno: el gym se vincula desde el servidor, nunca desde la config genérica que escribe el navegador', () => {
  const s = leer('app/api/interno/estudios/[id]/acciones/route.ts');
  assert.match(s, /from\('plataforma_conexiones'\)\.upsert\(/);
  assert.match(s, /error\.code === '23505'[\s\S]*?ya está vinculado a otro estudio/);
  const config = leer('app/api/integrations/config/route.ts');
  assert.doesNotMatch(config, /plataforma_conexiones/);
});
