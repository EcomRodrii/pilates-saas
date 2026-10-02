import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOTIVOS_LIBERACION, esMotivoLiberacion, interpretarLiberacion, llamarLiberarDerecho,
  type ClienteLiberacion,
} from './liberacion.ts';

// Motor de derechos, FASE 2: una sola salida de devolución para la cancelación de una clase
// (`liberar_derecho`, migración 20261002140000) y un único pagador por reserva.
//
// Aquí: la traducción de lo que contesta la RPC, y guardianes sobre el fuente de lo que no se
// puede invocar desde node:test (la migración SQL y los llamadores, que arrastran Supabase).
// El comportamiento contra una base de datos real vive en `supabase/tests/rls-liberar-derecho.test.ts`.

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const MIGRACION = leer('supabase/migrations/20261002140000_liberar_derecho.sql');
const ADMIN = leer('lib/db/supabase-data-admin.ts');

// ── Traducción de la respuesta ────────────────────────────────────────────────

test('interpretarLiberacion: lee lo que contesta liberar_derecho', () => {
  const l = interpretarLiberacion({
    resultado: 'OK', reserva_id: 'res-1', socio_id: 'soc-1', motivo: 'minimo_asistentes',
    bono: 'DEVUELTO', saldo: 4, recuperacion_restituida: false,
  });
  assert.deepEqual(l, { resultado: 'OK', bono: 'DEVUELTO', saldo: 4, recuperacionRestituida: false, socioId: 'soc-1' });

  const sinBono = interpretarLiberacion({ resultado: 'OK', socio_id: 'soc-1', bono: 'SIN_CONSUMO', saldo: null, recuperacion_restituida: true });
  assert.deepEqual(sinBono, { resultado: 'OK', bono: 'SIN_CONSUMO', saldo: null, recuperacionRestituida: true, socioId: 'soc-1' });
});

test('interpretarLiberacion: los resultados que no liberan nada llegan sin bono', () => {
  for (const resultado of ['RESERVA_NO_ENCONTRADA', 'RESERVA_ACTIVA', 'SESION_NO_CANCELADA'] as const) {
    const l = interpretarLiberacion({ resultado });
    assert.equal(l?.resultado, resultado);
    assert.equal(l?.bono, null);
    assert.equal(l?.recuperacionRestituida, false);
  }
});

test('interpretarLiberacion: lo que no es lo esperado es null (un fallo), nunca «nada que devolver»', () => {
  for (const raro of [null, undefined, 'OK', 5, [], {}, { resultado: 'OTRA' }, { resultado: 'OK', bono: 'INVENTADO' }, { resultado: 'OK', bono: 7 }]) {
    assert.equal(interpretarLiberacion(raro), null, JSON.stringify(raro));
  }
});

test('esMotivoLiberacion: solo los motivos que la RPC conoce', () => {
  for (const m of MOTIVOS_LIBERACION) assert.equal(esMotivoLiberacion(m), true, m);
  for (const m of ['alumna_en_plazo', '', null, undefined, 3, 'ESTUDIO_CANCELA_CLASE']) assert.equal(esMotivoLiberacion(m), false, String(m));
});

// ── La llamada ────────────────────────────────────────────────────────────────

function clienteFalso(respuesta: { data: unknown; error: { message: string } | null }) {
  const llamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const cliente: ClienteLiberacion = {
    rpc: (fn, args) => { llamadas.push({ fn, args }); return Promise.resolve(respuesta); },
  };
  return { cliente, llamadas };
}

test('llamarLiberarDerecho: pasa estudio, reserva y motivo a la RPC y devuelve la liberación', async () => {
  const { cliente, llamadas } = clienteFalso({ data: { resultado: 'OK', bono: 'DEVUELTO', saldo: 3, recuperacion_restituida: false }, error: null });
  const r = await llamarLiberarDerecho(cliente, { studioId: 'est-1', reservaId: 'res-9', motivo: 'eliminar_clase' });
  assert.deepEqual(llamadas, [{ fn: 'liberar_derecho', args: { p_studio_id: 'est-1', p_reserva_id: 'res-9', p_motivo: 'eliminar_clase' } }]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.liberacion.bono, 'DEVUELTO');
});

test('llamarLiberarDerecho: un error de la RPC o una respuesta rara es un FALLO, no «nada que hacer»', async () => {
  const conError = await llamarLiberarDerecho(
    clienteFalso({ data: null, error: { message: 'boom' } }).cliente,
    { studioId: 'e', reservaId: 'r', motivo: 'estudio_cancela_clase' });
  assert.equal(conError.ok, false);
  const rara = await llamarLiberarDerecho(
    clienteFalso({ data: { resultado: 'LO_QUE_SEA' }, error: null }).cliente,
    { studioId: 'e', reservaId: 'r', motivo: 'estudio_cancela_clase' });
  assert.equal(rara.ok, false);
});

// ── La migración ──────────────────────────────────────────────────────────────

test('⚠️ los motivos de la RPC y los del módulo son los mismos', () => {
  const lista = MIGRACION.match(/p_motivo not in \(([^)]*)\)/);
  assert.ok(lista, 'liberar_derecho ya no valida sus motivos: un motivo desconocido no puede liberar nada');
  const enSql = [...lista[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(enSql, [...MOTIVOS_LIBERACION].sort(),
    'añadir un motivo exige darlo de alta en SQL y en lib/reservas/liberacion.ts a la vez');
});

test('⚠️ liberar_derecho solo la llama el servidor, y se comprueba al aplicarse', () => {
  assert.match(MIGRACION, /revoke all on function public\.liberar_derecho\(text, text, text\) from public, anon, authenticated;/);
  assert.match(MIGRACION, /grant execute on function public\.liberar_derecho\(text, text, text\) to service_role;/);
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.liberar_derecho\(text,text,text\)'::regprocedure, 'EXECUTE'\)/);
  assert.match(MIGRACION, /has_function_privilege\('authenticated', 'public\.liberar_derecho\(text,text,text\)'::regprocedure, 'EXECUTE'\)/);
  // Defensa en profundidad: aunque se abriera el permiso, la propia función comprueba estudio y rol.
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.liberar_derecho'));
  assert.match(cuerpo, /not public\.es_llamada_servicio\(\) and p_studio_id is distinct from public\.current_studio_id\(\)/);
  assert.match(cuerpo, /not public\.es_llamada_servicio\(\) and not public\.puede_gestionar_calendario\(\)/);
  assert.ok(!/auth\.uid\(\) is (not )?null/.test(MIGRACION), 'un uid nulo no significa «servidor»: se usa es_llamada_servicio()');
});

test('⚠️ liberar_derecho solo libera una reserva CANCELADA de una clase cancelada, y no cambia estados', () => {
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.liberar_derecho'));
  assert.match(cuerpo, /v_estado is distinct from 'CANCELADA'/);
  assert.match(cuerpo, /v_cancelada is distinct from true/);
  assert.ok(!/update public\.reservas\b/.test(cuerpo.replace(/--.*$/gm, '')),
    'liberar_derecho no debe tocar el estado de la reserva: lo hace quien cancela');
  // La política del estudio vive aquí, y es la misma que ya usaban todos los caminos.
  assert.match(cuerpo, /cancelacion_clase_devuelve_bono/);
});

test('⚠️ solo se devuelve lo que ESA reserva consumió: la plaza fija y la cuota no recuperan nada', () => {
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.liberar_derecho'));
  // El bono se devuelve por la RPC que sella la devolución POR RESERVA, no con un +1 suelto.
  assert.match(cuerpo, /public\.devolver_sesion_bono_por_reserva\(p_studio_id, p_reserva_id\)/);
  assert.ok(!/devolver_sesion_bono\(/.test(cuerpo.replace(/devolver_sesion_bono_por_reserva\(/g, '')),
    'liberar_derecho no debe usar la devolución ciega');
  assert.match(cuerpo, /p_reserva_id like 'res-pf-%'/);
  assert.match(cuerpo, /'LEGADO_SIN_RASTRO'/);
  // Cuando no hay hueco, o ya se devolvió, no se confunde con haber devuelto.
  assert.match(cuerpo, /'YA_DEVUELTO'/);
  assert.match(cuerpo, /'SIN_HUECO'/);
  // La recuperación usada por la reserva se restituye aunque la política no devuelva el bono.
  const recuperacion = cuerpo.indexOf("update public.recuperaciones");
  assert.ok(recuperacion > cuerpo.indexOf("'POLITICA_NO_DEVUELVE'"), 'la restitución de la recuperación va fuera de la política del bono');
  assert.match(cuerpo, /rc\.usada_en_reserva_id = p_reserva_id[\s\S]*rc\.estado = 'USADA'/);
});

test('⚠️ pagador único: una reserva pagada con recuperación no consume bono, antes de decidir ninguno', () => {
  const consumir = MIGRACION.slice(
    MIGRACION.indexOf('create or replace function public.consumir_bono_interno'),
    MIGRACION.indexOf('create or replace function public.liberar_derecho'));
  const pagadaConRecuperacion = consumir.indexOf("rc.usada_en_reserva_id = p_reserva_id");
  assert.ok(pagadaConRecuperacion > 0, 'consumir_bono_interno ya no mira si la paga una recuperación');
  assert.ok(pagadaConRecuperacion < consumir.indexOf('if p_suscripcion_id is null then'), 'la comprobación va ANTES de elegir bono');
  assert.ok(pagadaConRecuperacion < consumir.indexOf("update public.suscripciones as s"), 'la comprobación va ANTES de descontar nada');
  // Sigue marcando la decisión: sin marca, el reparador de bonos sin decidir lo decidiría después.
  const bloque = consumir.slice(pagadaConRecuperacion, consumir.indexOf("return;", pagadaConRecuperacion));
  assert.match(bloque, /bono_decidido_en = now\(\)/);
  assert.match(bloque, /'SIN_BONO'/);
  // Y conserva todo lo de la fase 1: ledger, `returning` en vez de `found`, guardias.
  assert.match(consumir, /tentare\.ledger/);
  assert.match(consumir, /if v_saldo is null then/);
  assert.match(consumir, /BONO_NO_CUBRE_CLASE/);
  assert.match(consumir, /SUSCRIPCION_NO_ES_DE_LA_SOCIA/);
});

test('la migración no cambia los permisos de lo que ya existía', () => {
  assert.match(MIGRACION, /has_function_privilege\('anon', 'public\.consumir_bono_interno\(text,text,text\)'::regprocedure, 'EXECUTE'\)/);
  assert.ok(!/grant execute on function public\.consumir_bono_interno/.test(MIGRACION), 'consumir_bono_interno es solo del servidor: no se le concede nada a nadie más');
});

// ── Los llamadores ────────────────────────────────────────────────────────────

function cuerpoDe(fuente: string, nombre: string): string {
  const ini = fuente.search(new RegExp(`\\n(?:export\\s+)?async function ${nombre}\\(`));
  assert.ok(ini > 0, `no encuentro ${nombre}`);
  const sig = fuente.slice(ini + 1).search(/\n(?:export\s+)?(?:async\s+)?function \w+\(/);
  return sig === -1 ? fuente.slice(ini) : fuente.slice(ini, ini + 1 + sig);
}

test('⚠️ todo el que cancela una clase entera libera por la salida única, y con un motivo que existe', () => {
  const sustituciones = leer('app/api/sustituciones/route.ts');
  assert.match(sustituciones, /devolverBonosPorCancelacionClase\([\s\S]*?'instructora_baja_sin_sustituta'\)/);
  const minimo = cuerpoDe(ADMIN, 'cancelarSesionPorMinimoNoAlcanzado');
  assert.match(minimo, /motivo === 'minimo_no_alcanzado' \? 'minimo_asistentes' : 'estudio_cancela_clase'/);
  for (const m of ['instructora_baja_sin_sustituta', 'minimo_asistentes', 'estudio_cancela_clase']) {
    assert.ok(esMotivoLiberacion(m), m);
  }
  // La ruta del panel acepta el motivo del cuerpo solo si es uno conocido.
  const ruta = leer('app/api/reservas/devolver-bonos/route.ts');
  assert.match(ruta, /esMotivoLiberacion\(body\?\.motivo\)/);
});

test('⚠️ liberarReservaCancelada: lo raro es un fallo, y la heurística de siempre queda solo para lo importado', () => {
  const f = cuerpoDe(ADMIN, 'liberarReservaCancelada');
  assert.match(f, /llamarLiberarDerecho\(/);
  assert.match(f, /if \(!llamada\.ok\)[\s\S]*fallo: true/);
  assert.match(f, /liberacion\.resultado !== 'OK'[\s\S]*fallo: true/);
  // La heurística solo se alcanza con el veredicto explícito de la RPC, nunca por defecto.
  assert.match(f, /if \(liberacion\.bono === 'LEGADO_SIN_RASTRO'\) \{[\s\S]*devolverBonoServidor\(/);
  assert.equal(f.split('devolverBonoServidor(').length - 1, 1, 'la heurística solo se llama desde la rama LEGADO_SIN_RASTRO');
});

test('⚠️ devolverBonosPorCancelacionClase ya no adivina: sin reserva no hay nada que liberar', () => {
  const f = cuerpoDe(ADMIN, 'devolverBonosPorCancelacionClase');
  assert.match(f, /reservaId: string \}\[\]/, 'la reserva es obligatoria: sin ella no se sabe qué consumió');
  assert.ok(!/devolverBonoServidor\(/.test(f), 'devolverBonosPorCancelacionClase no debe devolver por su cuenta');
  assert.match(f, /liberarReservaCancelada\(admin, studioId, c, motivo\)/);
});
