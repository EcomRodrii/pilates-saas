import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Ledger de derechos (migración `…_ledger_derechos.sql`), FASE 1, EN SOMBRA.
//
// Esto lee el TEXTO de la migración: fija la forma (que es lo que un cambio descuidado rompe sin
// hacer ruido). Lo que la base de datos HACE con ella está en
// `supabase/tests/rls-ledger-derechos.test.ts`, que corre contra Postgres en CI.
//
// Lo que más importa de lo que se fija aquí:
//  · EN SOMBRA: nada del ledger puede tumbar una reserva ni una devolución, así que los
//    triggers capturan sus errores y no hay ningún índice único todavía;
//  · las cinco funciones del motor siguen siendo las que eran (mismas guardas) y solo ganan el
//    contexto del ledger alrededor de su UPDATE de saldo;
//  · en `consumir_bono_interno`, «no se actualizó ninguna fila» se mira con `v_saldo is null` y no
//    con `not found`: un PERFORM (el del contexto) también fija FOUND y esa comprobación dejaría
//    de ver nunca el caso «sin saldo».

const raiz = join(import.meta.dirname, '..', '..');

function migracion(): string {
  const dir = join(raiz, 'supabase', 'migrations');
  const nombre = readdirSync(dir).find(n => n.endsWith('_ledger_derechos.sql'));
  assert.ok(nombre, 'no existe la migración del ledger de derechos');
  return readFileSync(join(dir, nombre), 'utf8').replace(/^\s*--.*$/gm, '');
}

/** El cuerpo de una función `create or replace function public.<nombre>(`, hasta su cierre. */
function cuerpoDe(sql: string, nombre: string): string {
  const i = sql.indexOf(`create or replace function public.${nombre}(`);
  assert.ok(i >= 0, `la migración no define ${nombre}`);
  const resto = sql.slice(i + 10);
  const sig = resto.search(/\ncreate (or replace )?(function|trigger|view)|\nalter table|\ndo \$\$/);
  return sql.slice(i, sig >= 0 ? i + 10 + sig : undefined);
}

test('la tabla es solo de inserción y la lee únicamente el personal que ve las finanzas de su estudio', () => {
  const sql = migracion();
  assert.match(sql, /create table public\.movimientos_derecho/);
  assert.match(sql, /studio_id\s+text not null references public\.studios\(id\) on delete cascade/, 'sin cascada, purgar un estudio dejaría movimientos huérfanos');
  assert.match(sql, /alter table public\.movimientos_derecho enable row level security/);
  assert.match(sql, /using \(studio_id = public\.current_studio_id\(\) and public\.puede_ver_finanzas\(\)\)/);
  assert.match(sql, /revoke all on public\.movimientos_derecho from anon, authenticated;\s+grant select on public\.movimientos_derecho to authenticated;/);
  // Un movimiento no se corrige: se compensa con otro.
  assert.match(sql, /before update on public\.movimientos_derecho/);
  assert.match(cuerpoDe(sql, 'movimientos_derecho_inmutable'), /raise exception 'movimientos_derecho: el ledger es solo de inserción/);
  // La conciliación es solo del servidor.
  assert.match(sql, /revoke all on public\.ledger_conciliacion from anon, authenticated;\s+grant select on public\.ledger_conciliacion to service_role;/);
});

test('EN SOMBRA: los triggers nunca tumban el cambio de saldo y no hay índices únicos todavía', () => {
  const sql = migracion();
  for (const f of ['ledger_suscripcion_saldo', 'ledger_recuperacion']) {
    const c = cuerpoDe(sql, f);
    assert.match(c, /exception when others then\s+raise warning '/, `${f} tiene que capturar sus errores y avisar, no tumbar la escritura`);
    assert.doesNotMatch(c, /raise exception/, `${f}: un raise exception tumbaría la reserva`);
    assert.match(c, /security definer/);
  }
  // Los índices únicos (un consumo por reserva, una liberación por reserva) llegan con el motor único de
  // devoluciones, no antes: una colisión en sombra rompería un flujo que hoy funciona.
  assert.doesNotMatch(sql, /create unique index[^;]*movimientos_derecho/);
  // Sin permisos de EXECUTE para nadie del cliente.
  assert.match(sql, /revoke all on function public\.ledger_suscripcion_saldo\(\) from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.ledger_recuperacion\(\) from public, anon, authenticated;/);
});

test('el ledger suma el saldo por construcción: los triggers cuelgan de TODO cambio de saldo y la apertura se reparte por diferencia', () => {
  const sql = migracion();
  assert.match(sql, /after insert or update of sesiones_restantes on public\.suscripciones/);
  assert.match(sql, /after insert or update of estado on public\.recuperaciones/);
  // Sin contexto no se pierde el movimiento: queda marcado para poder descubrir qué caminos tocan el saldo.
  assert.match(cuerpoDe(sql, 'ledger_suscripcion_saldo'), /'AJUSTE_SIN_CONTEXTO'/);
  // Apertura = saldo menos lo ya anotado (idempotente y exacta aunque algo se moviera entre medias).
  assert.match(sql, /s\.sesiones_restantes - coalesce\(m\.suma, 0\)/);
  // Y sin escrituras concurrentes mientras se engancha todo.
  assert.match(sql, /lock table public\.suscripciones in share row exclusive mode;/);
  assert.match(sql, /lock table public\.recuperaciones in share row exclusive mode;/);
});

test('las cinco funciones del motor ponen y limpian el contexto del ledger alrededor de su UPDATE', () => {
  const sql = migracion();
  const esperado: Array<[string, string]> = [
    ['consumir_bono_interno', 'CONSUMO_BONO'],
    ['devolver_sesion_bono_por_reserva', 'DEVOLUCION_BONO'],
    ['devolver_sesion_bono_legado_por_reserva', 'DEVOLUCION_BONO'],
    ['devolver_sesion_bono', 'DEVOLUCION_BONO'],
    ['renovar_bono_idempotente', 'RENOVACION'],
  ];
  for (const [f, tipo] of esperado) {
    const c = cuerpoDe(sql, f);
    assert.match(c, new RegExp(`set_config\\('tentare\\.ledger',\\s*jsonb_build_object\\('tipo', '${tipo}'`), `${f} no etiqueta su movimiento como ${tipo}`);
    // Se limpia justo después: si no, el contexto se pegaría al siguiente UPDATE de la misma transacción.
    assert.match(c, /set_config\('tentare\.ledger', '', true\)/, `${f} no limpia el contexto`);
    assert.ok(c.indexOf("set_config('tentare.ledger', '', true)") > c.indexOf("set_config('tentare.ledger',\n"), `${f}: limpia ANTES de poner`);
  }
  // La devolución ciega se distingue para poder medir cuánto se usa antes de retirarla.
  assert.match(cuerpoDe(sql, 'devolver_sesion_bono'), /'via', 'ciega'/);
});

test('⚠️ consumir_bono_interno: «sin saldo» se mira con `v_saldo is null`, no con `not found` (un PERFORM fija FOUND)', () => {
  const c = cuerpoDe(migracion(), 'consumir_bono_interno');
  const trasElUpdate = c.slice(c.indexOf('returning s.sesiones_restantes into v_saldo'));
  const hasta = trasElUpdate.indexOf("'CONSUMIDA'");
  assert.ok(hasta > 0);
  assert.doesNotMatch(trasElUpdate.slice(0, hasta), /if not found/, '`not found` tras el PERFORM del contexto no ve nunca «0 filas»');
  assert.match(trasElUpdate.slice(0, hasta), /if v_saldo is null then/);
});

test('las funciones del motor conservan SUS guardas (solo ganan el contexto)', () => {
  const sql = migracion();
  const consumir = cuerpoDe(sql, 'consumir_bono_interno');
  for (const guarda of [
    'for update', "raise exception 'SESION_REQUERIDA'", "raise exception 'SUSCRIPCION_NO_ES_DE_LA_SOCIA'",
    "raise exception 'BONO_NO_CUBRE_CLASE'", 's.sesiones_restantes > 0', "'YA_CONSUMIDA'", "'YA_DECIDIDA'", "'NO_OCUPA_PLAZA'",
  ]) assert.ok(consumir.includes(guarda), `consumir_bono_interno perdió «${guarda}»`);

  const porReserva = cuerpoDe(sql, 'devolver_sesion_bono_por_reserva');
  for (const guarda of ['r.bono_devuelto_en is null', 'r.bono_consumo_rastreado is true', 'r.bono_suscripcion_id is not null', 's.sesiones_restantes < p.sesiones', "raise exception 'STUDIO_MISMATCH'", "raise exception 'NO_AUTORIZADO'"]) {
    assert.ok(porReserva.includes(guarda), `devolver_sesion_bono_por_reserva perdió «${guarda}»`);
  }
  assert.ok(cuerpoDe(sql, 'devolver_sesion_bono_legado_por_reserva').includes('r.bono_devuelto_en is null'));
  assert.ok(cuerpoDe(sql, 'devolver_sesion_bono').includes('s.sesiones_restantes < p.sesiones'));
  const renovar = cuerpoDe(sql, 'renovar_bono_idempotente');
  for (const guarda of ['v_aplicada is true', 'for update', 'entrega_aplicada = true']) assert.ok(renovar.includes(guarda), `renovar_bono_idempotente perdió «${guarda}»`);
});

test('el saldo nunca es negativo: CHECK validado, no solo declarado', () => {
  const sql = migracion();
  assert.match(sql, /add constraint suscripciones_sesiones_no_negativas\s+check \(sesiones_restantes is null or sesiones_restantes >= 0\) not valid;/);
  assert.match(sql, /validate constraint suscripciones_sesiones_no_negativas;/);
});

test('la propia migración se verifica por el estado FINAL (RLS, privilegios, triggers, contexto en las cinco funciones, conciliación vacía)', () => {
  const sql = migracion();
  const verificacion = sql.slice(sql.lastIndexOf('do $$'));
  for (const frag of [
    'relrowsecurity', "has_table_privilege('authenticated', 'public.movimientos_derecho', 'INSERT')",
    "has_function_privilege('anon', 'public.ledger_suscripcion_saldo()'::regprocedure, 'EXECUTE')",
    "position('tentare.ledger' in p.prosrc) > 0) <> 5", 'from public.ledger_conciliacion',
  ]) assert.ok(verificacion.includes(frag), `la verificación final no comprueba: ${frag}`);
});

// ── PR-14: revertir_compra_de_clase (migración `…_revertir_compra_de_clase.sql`) ─────────────
// La sexta función que mueve saldo con contexto: devolver el dinero de una clase COMPENSADA retira
// la suscripción que entregó el pago, solo si está intacta. Lo que HACE contra Postgres está en
// `supabase/tests/rls-revertir-compra-de-clase.test.ts`.

function migracionRevertir(): string {
  const dir = join(raiz, 'supabase', 'migrations');
  const nombre = readdirSync(dir).find(n => n.endsWith('_revertir_compra_de_clase.sql'));
  assert.ok(nombre, 'no existe la migración de revertir_compra_de_clase');
  return readFileSync(join(dir, nombre), 'utf8').replace(/^\s*--.*$/gm, '');
}

test('revertir_compra_de_clase: etiqueta su movimiento REVERSION_VENTA y limpia el contexto justo después', () => {
  const c = cuerpoDe(migracionRevertir(), 'revertir_compra_de_clase');
  const pone = c.search(/set_config\('tentare\.ledger', jsonb_build_object\(\s*'tipo', 'REVERSION_VENTA'/);
  assert.ok(pone > 0, 'sin el contexto REVERSION_VENTA, el ledger lo anotaría como AJUSTE_SIN_CONTEXTO');
  const update = c.indexOf('set sesiones_restantes = 0', pone);
  const limpia = c.indexOf("set_config('tentare.ledger', '', true)", pone);
  assert.ok(update > pone && limpia > update, 'el orden es: poner contexto, UPDATE del saldo, limpiar');
});

test('⚠️ revertir_compra_de_clase: «no se actualizó» se mira con la variable del RETURNING, no con `not found`', () => {
  const c = cuerpoDe(migracionRevertir(), 'revertir_compra_de_clase');
  const tras = c.slice(c.indexOf('returning s.sesiones_restantes into v_saldo_nuevo'));
  assert.match(tras, /if v_saldo_nuevo is null then/);
  assert.doesNotMatch(c, /if not found/, 'un PERFORM (el del contexto) también fija FOUND');
});

test('revertir_compra_de_clase: solo retira una suscripción INTACTA y solo actúa sobre un pago COMPENSADA', () => {
  const c = cuerpoDe(migracionRevertir(), 'revertir_compra_de_clase');
  for (const guarda of [
    "if v_pago.estado <> 'COMPENSADA' then", 'for update', 'v_saldo <> v_sesiones_entregadas',
    'rc.entrega_sesiones_despues', "dv.estado in ('DESCARTADA', 'ANULADA_REEMBOLSO_FALLIDO')",
    "m.tipo = 'CONSUMO_BONO'", 'rv.bono_suscripcion_id = v_pago.suscripcion_id',
    'and s.sesiones_restantes = v_saldo', "where pc.id = v_pago.id and pc.estado = 'COMPENSADA'",
    "v_pago.reserva_id like 'res-web-%'", "r.estado in ('LISTA_ESPERA', 'PENDIENTE_APROBACION')",
    'perform public.renumerar_lista_espera(v_res_sesion)', 'if not public.es_llamada_servicio() then',
  ]) assert.ok(c.includes(guarda), `revertir_compra_de_clase perdió «${guarda}»`);
});

test('revertir_compra_de_clase: solo el servidor (los tres pasos y su verificación)', () => {
  const sql = migracionRevertir();
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.revertir_compra_de_clase\\(text, text\\) from ${rol};`), rol);
  }
  assert.match(sql, /grant execute on function public\.revertir_compra_de_clase\(text, text\) to service_role, postgres;/);
  const verificacion = sql.slice(sql.lastIndexOf('do $$'));
  for (const rol of ['anon', 'authenticated', 'service_role']) assert.ok(verificacion.includes(`has_function_privilege('${rol}'`), rol);
  assert.ok(verificacion.includes('REVERSION_VENTA'), 'la verificación comprueba que el ledger admite el tipo');
});
