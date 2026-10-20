import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia: devoluciones de compra, cancelación de canjes y borrado de
// recompensas. No prueba que el SQL funcione (eso se ejecutó en vivo con un
// bloque DO que termina en RAISE: ver el PR); impide que se deshagan, sin que
// nadie lo note, las decisiones que cierran cada agujero.
//
// Se busca la migración por CONTENIDO y no por nombre: al aplicarla, este repo
// la renombra al sello real de aplicación (tentare-os.md, «Migraciones»).
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const DIR = join(RAIZ, 'supabase/migrations');
const fichero = readdirSync(DIR).filter(n => n.endsWith('.sql'))
  .find(n => readFileSync(join(DIR, n), 'utf8').includes('function public.sincronizar_creditos_compra'));
if (!fichero) throw new Error('no hay ninguna migración que defina sincronizar_creditos_compra');
const SQL = readFileSync(join(DIR, fichero), 'utf8');
const SIN_COMENTARIOS = SQL.replace(/^\s*--.*$/gm, '');

function cuerpo(nombre: string): string {
  const i = SIN_COMENTARIOS.indexOf(`function public.${nombre}`);
  assert.ok(i >= 0, `la migración no define ${nombre}`);
  const fin = SIN_COMENTARIOS.indexOf('$function$;', SIN_COMENTARIOS.indexOf('$function$', i) + 10);
  return SIN_COMENTARIOS.slice(i, fin);
}
const fuente = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

test('retirar_creditos_compra: idempotente por compra, REVERSION en negativo, marca SIEMPRE escrita', () => {
  const f = cuerpo('retirar_creditos_compra');
  assert.match(f, /pg_advisory_xact_lock\(hashtextextended\('creditos-compra\|'/, 'un bloqueo por compra');
  assert.match(f, /if exists \(select 1 from public\.credit_transactions ct where ct\.id = v_marca\) then\s+return 0/,
    'si ya hay apunte de devolución, no hace nada');
  assert.match(f, /'REVERSION', -v_retirar/, 'tipo REVERSION y creditos negativo (antes CANJE y positivo)');
  assert.ok(!/'CANJE', v_retirar/.test(f), 'el apunte de devolución no vuelve a ser CANJE positivo');
  // La marca se escribe también con 0 retirado: sin ella una segunda llamada,
  // con saldo ya nuevo, retiraría créditos que no son de esta compra.
  assert.ok(!/if v_retirar > 0 then\s+insert/.test(f), 'el apunte no depende de haber retirado algo');
  assert.match(f.slice(f.indexOf('insert into public.credit_transactions')), /on conflict \(id\) do nothing/);
});

test('retirar_creditos_compra: saldo nunca negativo, sin deuda inventada, no borra la marca de la concesión', () => {
  const f = cuerpo('retirar_creditos_compra');
  assert.match(f, /least\(v_creditos, greatest\(coalesce\(v_saldo, 0\), 0\)\)/);
  assert.ok(!/creditos_por_compensar/.test(f), 'DECISIÓN DEL FUNDADOR pendiente: no se crea deuda');
  assert.ok(!/delete\s+from\s+public\.reward_actions/i.test(f),
    'borrar la marca permitiría que un reintento de la concesión vuelva a regalar los créditos de una venta devuelta');
  assert.match(f, /total_ganado = greatest\(0, mc\.total_ganado - v_retirar\)/, 'baja solo lo retirado: saldo = ganado - canjeado se mantiene');
  assert.match(f, /if not public\.es_llamada_servicio\(\) then\s+raise exception 'NO_AUTORIZADO'/);
});

test('sincronizar_creditos_compra mira el ESTADO de la venta/recibo y retira por venta', () => {
  const f = cuerpo('sincronizar_creditos_compra');
  assert.match(f, /rc\.estado = 'DEVUELTO'/);
  assert.match(f, /v\.devuelta_en is not null/);
  assert.match(f, /v\.anulada_en is not null/);
  assert.match(f, /public\.retirar_creditos_compra\(p_studio_id, v\.socio_id, v\.id\)/);
  assert.match(f, /vp\.studio_id = p_studio_id/, 'filtra por estudio');
  assert.match(f, /if not public\.es_llamada_servicio\(\) then\s+raise exception 'NO_AUTORIZADO'/);
});

test('F2: eliminar una recompensa NO borra canjes (FK SET NULL + nombre guardado ANTES del borrado)', () => {
  assert.match(SIN_COMENTARIOS, /foreign key \(catalog_item_id\) references public\.reward_catalog\(id\) on delete set null/);
  assert.ok(!/on delete cascade/i.test(SIN_COMENTARIOS), 'la migración no introduce ningún CASCADE');
  assert.match(SIN_COMENTARIOS, /before delete\s+on public\.reward_catalog/, 'el nombre se guarda ANTES de que la FK ponga el id a NULL');
  const t = cuerpo('reward_catalog_conserva_canjes');
  assert.match(t, /coalesce\(r\.recompensa_nombre, old\.nombre\)/);
  assert.ok(!/delete\s+from/i.test(t), 'el disparador no borra nada');
});

test('F5/F7/F13: cancelar con saldo caducado devuelve créditos vivos, deja apunte y guarda quién/cuándo/por qué', () => {
  const f = cuerpo('cancelar_canje_con_motivo');
  assert.match(f, /cancelado_en = now\(\)/);
  assert.match(f, /cancelado_por = coalesce\(auth\.uid\(\)::text, 'servicio'\)/);
  assert.match(f, /cancelado_motivo = left\(nullif\(trim\(p_motivo\), ''\), 200\)/);
  assert.match(f, /v_caduca < v_hoy/, 'detecta el saldo ya caducado');
  assert.match(f, /caduca_el = case when v_caducado then public\.caduca_creditos\(p_studio_id\)/, 'la devolución nace con fecha de hoy');
  assert.match(f, /'CADUCIDAD', -v_muerto/, 'lo descartado deja apunte');
  assert.match(f, /total_caducado = mc\.total_caducado \+ v_muerto/, 'y contador');
  assert.match(f, /'ctx-dev-' \|\| p_redemption_id/, 'apunte de devolución determinista: idempotente por construcción');
  assert.match(f, /for update/, 'el canje se bloquea: dos cancelaciones a la vez no devuelven dos veces');
  assert.match(f, /if v_estado is distinct from 'PENDIENTE' then/);
});

test('F7: la caducidad deja apunte y contador, y NO cambia cuándo caduca ni a quién', () => {
  const f = cuerpo('member_credits_caducidad');
  assert.match(f, /new\.total_caducado := coalesce\(old\.total_caducado, 0\) \+ old\.saldo/);
  assert.match(f, /'CADUCIDAD', -old\.saldo/);
  assert.match(f, /old\.caduca_el is not null and old\.caduca_el < public\.hoy_estudio\(\)/, 'misma condición que antes');
  assert.match(f, /new\.saldo := new\.saldo - old\.saldo/, 'mismo descarte que antes');
  assert.match(SIN_COMENTARIOS, /'GANANCIA', 'CANJE', 'REVERSION', 'COMPENSACION', 'CADUCIDAD'/);
});

test('F8: el canje de clase gratis es UNA transacción con el canje bloqueado', () => {
  const f = cuerpo('entregar_canje_clase_gratis');
  assert.match(f, /from public\.reward_redemptions r[\s\S]*for update/);
  assert.match(f, /if v_estado is distinct from 'PENDIENTE' then\s+return 'NO_PENDIENTE'/);
  assert.match(f, /public\.crear_recuperacion\(/);
  assert.match(f, /if v_res = 'TOPE' then\s+perform public\.cancelar_canje_con_motivo/);
  assert.match(f, /set estado = 'ENTREGADO'/);
  assert.match(f, /if not public\.es_llamada_servicio\(\) then\s+raise exception 'NO_AUTORIZADO'/);
});

test('grants: las nuevas solo para service_role; cancelar también para authenticated; anon nunca', () => {
  for (const firma of [
    'retirar_creditos_compra\\(text, text, text\\)',
    'sincronizar_creditos_compra\\(text, text\\)',
    'entregar_canje_clase_gratis\\(text, text, text, text\\)',
  ]) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${firma} from public, anon, authenticated;`), firma);
    assert.match(SQL, new RegExp(`grant execute on function public\\.${firma} to service_role;`), firma);
  }
  for (const firma of ['cancelar_canje_con_motivo\\(text, text, text\\)', 'cancelar_canje\\(text, text\\)']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${firma} from public, anon;`), firma);
    assert.match(SQL, new RegExp(`grant execute on function public\\.${firma} to authenticated, service_role;`), firma);
  }
});

test('la migración es aditiva: no borra filas ni toca saldos ni el libro existente', () => {
  const fueraDeFunciones = SIN_COMENTARIOS.replace(/\$function\$[\s\S]*?\$function\$/g, '');
  assert.ok(!/^\s*delete\s+from\s+/im.test(fueraDeFunciones), 'ningún DELETE fuera de funciones');
  assert.ok(!/^\s*(update|truncate)\s+/im.test(fueraDeFunciones), 'ningún UPDATE/TRUNCATE de datos al aplicarla');
  assert.ok(!/drop\s+(table|column)/i.test(SIN_COMENTARIOS));
});

test('no se tocan las políticas ni los grants de tabla (eso es de la otra tanda)', () => {
  assert.ok(!/create policy|drop policy/i.test(SIN_COMENTARIOS));
  assert.ok(!/grant (insert|update|delete|select)[^;]* on (table )?public\./i.test(SIN_COMENTARIOS));
  for (const fn of ['ajustar_stock', 'ajustar_creditos', 'canjear_recompensa', 'entregar_canje\\(', 'generar_codigo_canje']) {
    assert.ok(!new RegExp(`(create or replace function|alter function)\\s+public\\.${fn}`, 'i').test(SIN_COMENTARIOS), fn);
  }
});

// ── Código ──────────────────────────────────────────────────────────────────

test('el canje del portal: clave de idempotencia, resultado de cada paso comprobado, sin el mensaje falso', () => {
  const admin = fuente('lib/db/supabase-data-admin.ts');
  const c = admin.slice(admin.indexOf('export async function canjearRecompensaPublica'), admin.indexOf('// Otorga créditos server-side'));
  assert.match(c, /idCanjeDeClave\(/);
  assert.match(c, /esViolacionUnica\(canjeErr\)/);
  assert.match(c, /rpc\('entregar_canje_clase_gratis'/);
  assert.ok(!/rpc\('crear_recuperacion'/.test(c), 'la clase gratis ya no son tres llamadas sueltas');
  assert.ok(!/from\('reward_redemptions'\)\s*\.update/.test(c), 'el ENTREGADO lo pone la RPC, no un UPDATE sin comprobar');
  assert.match(c, /rpc\('cancelar_canje_con_motivo'/);
  assert.match(c, /cancelErr \|\| fila\?\.estado !== 'CANCELADO'/, 'el resultado de cancelar se comprueba');
  assert.ok(!/No se te han descontado créditos/.test(c), 'ese mensaje era falso si cancelar fallaba');
});

test('la ruta pública acepta la clave y la valida; la pantalla la manda y bloquea el doble toque', () => {
  const ruta = fuente('app/api/public/canje/route.ts');
  assert.match(ruta, /claveCanjeValida\(body\.idempotencyKey\)/);
  assert.match(ruta, /idempotencyKey: body\.idempotencyKey/);
  const cliente = fuente('lib/student/gamificacion-datos.ts');
  assert.match(cliente, /idempotencyKey/);
  assert.match(cliente, /canjesEnVuelo/);
  const panel = fuente('lib/studio-context.tsx');
  assert.match(panel, /canjesEnCurso/);
  assert.ok(!/setDbError\(\{ msg, key: Date\.now\(\) \}\);\s+return;\s+\}\s+\/\/ La UI se aplica sobre lo YA confirmado/.test(panel),
    'el canje del panel ya no es fire-and-forget: devuelve el error real');
});

test('el panel cancela por la RPC con motivo', () => {
  assert.match(fuente('lib/supabase-data.ts'), /rpc\('cancelar_canje_con_motivo'/);
});

test('el texto de «Meses que duran» no promete una retroactividad que no hay', () => {
  const t = fuente('components/configuracion/creditos.tsx');
  assert.match(t, /Cambiarlo no toca las fechas que ya tienen/);
  assert.match(t, /Quitarlo no recupera los créditos que ya hayan caducado/);
});

test('si el dinero vuelve (reembolso que falla) los créditos retirados VUELVEN, y cada ciclo tiene marca propia', () => {
  const r = cuerpo('restituir_creditos_compra');
  assert.match(r, /if not public\.es_llamada_servicio\(\) then\s+raise exception 'NO_AUTORIZADO'/);
  assert.match(r, /pg_advisory_xact_lock\(hashtextextended\('creditos-compra\|'/, 'mismo bloqueo por compra que retirar');
  assert.match(r, /'GANANCIA', v_ret/);
  assert.match(r, /'ct-posrest-' \|\| v_h \|\| '-' \|\| \(v_ciclo \+ 1\)/);
  assert.match(cuerpo('retirar_creditos_compra'), /'ct-posdev-' \|\| v_h \|\| case when v_ciclo > 0/, 'la marca de retirar cambia tras restituir');
  assert.match(cuerpo('sincronizar_creditos_compra'), /public\.restituir_creditos_compra\(/);
  assert.match(SQL, /revoke all on function public\.restituir_creditos_compra\(text, text, text\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function public\.restituir_creditos_compra\(text, text, text\) to service_role;/);
});

test('la repetición de un canje de clase gratis que quedó PENDIENTE la concede, no responde éxito en falso', () => {
  const admin = fuente('lib/db/supabase-data-admin.ts');
  const c = admin.slice(admin.indexOf('const repeticion = async'), admin.indexOf('const yaHecho = await repeticion()'));
  assert.match(c, /data\.estado === 'PENDIENTE'/);
  assert.match(c, /rpc\('entregar_canje_clase_gratis'/);
});
