import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seguirCreditosAlRecibo, type DependenciasCreditosRecibo } from './creditos-recibo-server.ts';

// `seguirCreditosAlRecibo` no decide qué recibo da créditos: eso es de la base
// (`sincronizar_creditos_renovacion`). Lo que fijan estos tests es el contrato
// de la puerta: qué le pasa a la RPC, cómo lee su respuesta y que NUNCA lanza,
// porque la llaman un cobro y una devolución que no pueden caerse por ella.

type Llamada = { nombre: string; args: Record<string, unknown> };

function fakeAdmin(respuesta: { data?: unknown; error?: { message: string } | null; lanza?: boolean }) {
  const llamadas: Llamada[] = [];
  const admin = {
    rpc(nombre: string, args: Record<string, unknown>) {
      llamadas.push({ nombre, args });
      if (respuesta.lanza) return Promise.reject(new Error('red caída'));
      return Promise.resolve({ data: respuesta.data ?? null, error: respuesta.error ?? null });
    },
  };
  return { admin: admin as never, llamadas };
}

function deps(puedeOtorgar = true) {
  const avisos: unknown[] = [];
  const d: DependenciasCreditosRecibo = {
    puedeOtorgar: async () => puedeOtorgar,
    avisarFallo: e => { avisos.push(e); },
  };
  return { d, avisos };
}

const P = { studioId: 'studio-1', reciboId: 'rec-1' };

test('pide sincronizar ESE recibo de ESE estudio, con el gate del plan', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [{ resultado: 'OTORGADO', socia: 'socia-1', creditos_movidos: 40, saldo_final: 55 }] });
  const r = await seguirCreditosAlRecibo(admin, P, deps().d);
  assert.deepEqual(llamadas, [{
    nombre: 'sincronizar_creditos_renovacion',
    args: { p_studio_id: 'studio-1', p_recibo_id: 'rec-1', p_puede_otorgar: true },
  }]);
  assert.deepEqual(r, { accion: 'OTORGADO', socioId: 'socia-1', creditos: 40, saldo: 55 });
});

test('un plan sin gamificación NO impide llamar: revertir no depende del plan', async () => {
  // Si el estudio bajó de plan entre el cobro y la devolución, los créditos de
  // un cobro devuelto se tienen que quitar igual. Quien frena el OTORGAR es la base.
  const { admin, llamadas } = fakeAdmin({ data: [{ resultado: 'REVERTIDO', socia: 'socia-1', creditos_movidos: 40, saldo_final: 0 }] });
  const r = await seguirCreditosAlRecibo(admin, P, deps(false).d);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].args.p_puede_otorgar, false);
  assert.equal(r?.accion, 'REVERTIDO');
});

test('una respuesta desconocida o vacía se lee como NADA, nunca como otorgado', async () => {
  for (const data of [[], null, [{ resultado: 'OTRA_COSA' }], { resultado: 'NADA', socia: null, creditos_movidos: 0, saldo_final: null }]) {
    const { admin } = fakeAdmin({ data });
    const r = await seguirCreditosAlRecibo(admin, P, deps().d);
    assert.equal(r?.accion, 'NADA', JSON.stringify(data));
    assert.equal(r?.creditos, 0);
  }
});

test('⚠️ un error de la RPC no lanza: devuelve null y avisa', async () => {
  const { admin } = fakeAdmin({ error: { message: 'NO_AUTORIZADO' } });
  const { d, avisos } = deps();
  const r = await seguirCreditosAlRecibo(admin, P, d);
  assert.equal(r, null);
  assert.equal(avisos.length, 1);
});

test('⚠️ una excepción (red, gate) no lanza, ni aunque el aviso también falle', async () => {
  const { admin } = fakeAdmin({ lanza: true });
  const d: DependenciasCreditosRecibo = {
    puedeOtorgar: async () => true,
    avisarFallo: () => { throw new Error('Sentry sin configurar'); },
  };
  assert.equal(await seguirCreditosAlRecibo(admin, P, d), null);

});

test('si no se puede saber el plan, NO otorga pero SÍ llama: una devolución los retira igual', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [{ resultado: 'REVERTIDO', socia: 's', creditos_movidos: 40, saldo_final: 0 }] });
  const gateRoto: DependenciasCreditosRecibo = {
    puedeOtorgar: async () => { throw new Error('studios no responde'); },
    avisarFallo: () => {},
  };
  const r = await seguirCreditosAlRecibo(admin, P, gateRoto);
  assert.equal(llamadas[0]?.args.p_puede_otorgar, false);
  assert.equal(r?.accion, 'REVERTIDO');
});

test('el gate ya evaluado por quien llama no se vuelve a pedir', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [] });
  let pedido = 0;
  const d: DependenciasCreditosRecibo = { puedeOtorgar: async () => { pedido++; return false; }, avisarFallo: () => {} };
  await seguirCreditosAlRecibo(admin, { ...P, puedeOtorgar: true }, d);
  assert.equal(pedido, 0);
  assert.equal(llamadas[0]?.args.p_puede_otorgar, true);
});

test('la ruta del panel exige sesión de staff y puedeMoverDinero, y el estudio sale de la sesión', () => {
  const ruta = fuente('../../app/api/cobros/creditos-recibos/route.ts');
  assert.ok(ruta.includes('verificarSesionStaff(req)'));
  assert.ok(ruta.includes('puedeMoverDinero(sesion.rol)'));
  assert.ok(ruta.includes('studioId: sesion.studioId'), 'nunca del cuerpo de la petición');
  assert.ok(!/body\??\.studioId/.test(ruta));
});

test('el panel ya no da RENOVACION_PLAN por su cuenta: avisa al servidor', () => {
  const panel = fuente('../studio-context.tsx');
  assert.ok(!/'RENOVACION_PLAN'/.test(panel), 'ni RPC directa ni decisión por el concepto en el navegador');
  assert.match(panel, /void reflejarCreditosDeRecibos\(\[reciboId\]\)/, '«marcar cobrado»');
  assert.match(panel, /void reflejarCreditosDeRecibos\(cobradosAhora\.map\(r => r\.id\)\)/, '«cobrar pendientes»');
});

// ── Cada camino que mueve un recibo dentro o fuera de COBRADO la llama ──────
// No se pueden importar (Stripe, Next, cliente admin): se comprueba en el
// código fuente. Si alguien quita una llamada, los créditos dejan de seguir a
// ese camino en silencio — justo el hueco que cerró este cambio.
function fuente(ruta: string): string {
  return readFileSync(new URL(ruta, import.meta.url), 'utf8');
}

test('los caminos de cobro y de devolución piden sincronizar los créditos', () => {
  const caminos: Array<[string, string]> = [
    ['./renovacion-server.ts', 'los tres confirmadores de cobro de servidor'],
    ['./entregar-plan-comprado.ts', 'la compra en la tienda web'],
    ['../pos/venta-servidor.ts', 'la venta del TPV'],
    ['../../app/api/pos/devolucion/route.ts', 'la devolución del TPV'],
    ['./procesar-reembolso.ts', 'el reembolso total y el contracargo perdido'],
    ['../../app/api/stripe/webhook/route.ts', 'el reembolso que falla y devuelve el recibo a COBRADO'],
    ['./marcar-devuelto.ts', '«marcar devuelto»'],
    ['./dunning-server.ts', 'el adeudo SEPA devuelto'],
    ['../../app/api/cobros/creditos-recibos/route.ts', 'los cobros a mano del panel'],
  ];
  for (const [ruta, que] of caminos) {
    assert.match(fuente(ruta), /seguirCreditosAlRecibo|seguirCreditos\b/, `${que} (${ruta}) no sincroniza los créditos`);
  }
});

test('el reembolso sincroniza en las DOS salidas del dinero: reembolso total y contracargo perdido', () => {
  const f = fuente('./procesar-reembolso.ts');
  const reembolso = f.slice(f.indexOf('async function procesarReembolsoDeUnRecibo'), f.indexOf('export async function procesarChargeRefunded'));
  const disputa = f.slice(f.indexOf('export async function procesarDisputeClosed'), f.indexOf('export async function procesarReembolsoVentaPos'));
  const pos = f.slice(f.indexOf('export async function procesarReembolsoVentaPos'));
  assert.match(reembolso, /seguirCreditosAlRecibo\(/);
  assert.match(disputa, /seguirCreditosAlRecibo\(/);
  assert.match(pos, /seguirCreditosAlRecibo\(/, 'reembolso de una venta del TPV por Stripe');
});

// ── La migración: lo que no se puede perder sin que nadie lo note ───────────
const MIGRACION = fuente('../../supabase/migrations/20260917015000_creditos_renovacion_siguen_al_recibo.sql');

test('migración: las funciones nuevas son solo del servidor (revocadas a anon Y authenticated)', () => {
  // `pg_default_acl` da EXECUTE directo a anon/authenticated: revocar PUBLIC no basta.
  for (const firma of [
    'recibo_cobro_vigente(text, text)',
    'recibo_es_renovacion_para_creditos(text, text)',
    'sincronizar_creditos_renovacion(text, text, boolean)',
  ]) {
    const esc = firma.replace(/[()]/g, '\\$&');
    assert.match(MIGRACION, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated;`), firma);
    assert.match(MIGRACION, new RegExp(`grant execute on function public\\.${esc} to service_role;`), firma);
  }
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.sincronizar_creditos_renovacion'));
  assert.match(cuerpo, /if not public\.es_llamada_servicio\(\) then\s+raise exception 'NO_AUTORIZADO'/);
});

test('migración: RENOVACION_PLAN ya no se da por el texto del concepto, ni sin cobrar', () => {
  const otorgar = MIGRACION.slice(
    MIGRACION.indexOf('create or replace function public.otorgar_credito_disparador'),
    MIGRACION.indexOf('create or replace function public.sincronizar_creditos_renovacion'),
  );
  const rama = otorgar.slice(otorgar.indexOf("elsif p_trigger = 'RENOVACION_PLAN'"), otorgar.indexOf("elsif p_trigger = 'PRIMERA_RESERVA'"));
  const codigo = rama.replace(/--.*$/gm, '');
  assert.ok(!/concepto/.test(codigo), 'el concepto es copy: no decide créditos');
  assert.match(rama, /pg_advisory_xact_lock\(hashtextextended\('creditos-renovacion\|'/, 'mismo bloqueo por recibo que la sincronización');
  assert.match(rama, /recibo_cobro_vigente\(p_ref_id, p_studio_id\)/);
  assert.match(rama, /recibo_es_renovacion_para_creditos\(p_ref_id, p_studio_id\)/);
});

test('migración: recompra = mismo plan, no clase suelta, anterior terminado hace ≤60 días', () => {
  const regla = MIGRACION.slice(
    MIGRACION.indexOf('create or replace function public.recibo_es_renovacion_para_creditos'),
    MIGRACION.indexOf('-- ── otorgar_credito_disparador'),
  );
  assert.match(regla, /prev\.plan_id = c\.plan_id/);
  assert.match(regla, /p\.tipo <> 'PUNTUAL'/);
  assert.match(regla, /prev\.fecha_fin >= c\.fecha_inicio - 60/);
  assert.match(regla, /tras_cancelar_cuota is null/);
  // ⚠️ La recompra nunca toca `es_renovacion`: esa marca decide la ENTREGA.
  assert.ok(!/update\s+public\.recibos/i.test(MIGRACION), 'la migración no reescribe recibos');
});

test('migración: la compensación corre DESPUÉS de la caducidad y nunca deja saldo negativo', () => {
  // Los BEFORE triggers van por orden alfabético del nombre.
  assert.ok('member_credits_caducidad' < 'member_credits_deuda');
  assert.match(MIGRACION, /create trigger member_credits_deuda\s+before update on public\.member_credits/);
  assert.match(MIGRACION, /add constraint member_credits_por_compensar_no_negativo check \(creditos_por_compensar >= 0\)/);
  const trigger = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.member_credits_deuda'));
  assert.match(trigger, /greatest\(new\.saldo, 0\)/);
  const revertir = MIGRACION.slice(MIGRACION.indexOf('-- El dinero ya no está.'));
  assert.match(revertir, /v_quita := least\(greatest\(v_saldo, 0\), v_creditos\)/);
});
