import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarRenovacionServidor } from './renovacion-server.ts';

// El snapshot de la entrega es lo único que permitirá, cuando se devuelva el
// dinero, saber QUÉ habría que deshacer: `suscripciones` no tiene `updated_at`,
// ni triggers, ni histórico de sesiones.
//
// Lo que estos tests fijan, y que no se puede inferir de ningún otro sitio:
//  · `aplicada: false` cuando se evaluó y NO cambió nada — distinto de "no lo
//    sé", que es la ausencia de columna y aquí no se produce nunca.
//  · el DESPUÉS, no solo el antes: es lo que después permitirá detectar que
//    alguien tocó la suscripción entre la entrega y la devolución.

type Fila = Record<string, unknown>;

/** Supabase de mentira: sirve la suscripción y el plan, y guarda los updates.
 *  `rpcSaldo` es lo que devuelve `renovar_bono_idempotente`: el saldo nuevo, o
 *  null cuando este recibo ya había entregado (reintento). */
function fakeAdmin(opts: { sus: Fila; plan: Fila; rpcSaldo?: number | null; recibo?: Fila }) {
  const updates: Record<string, Fila[]> = { recibos: [], suscripciones: [] };
  const rpcs: Array<{ nombre: string; args: Fila }> = [];
  const api = {
    rpc(nombre: string, args: Fila) {
      rpcs.push({ nombre, args });
      // La RPC recarga la suscripción por dentro, así que se refleja aquí para
      // que el test siga midiendo "¿se tocó la suscripción?".
      if (opts.rpcSaldo != null) updates.suscripciones.push({ sesiones_restantes: opts.rpcSaldo });
      return Promise.resolve({ data: opts.rpcSaldo ?? null, error: null });
    },
    from(tabla: string) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          if (tabla === 'recibos') return Promise.resolve({ data: opts.recibo ?? { suscripcion_id: 'sus-1', es_renovacion: true }, error: null });
          if (tabla === 'suscripciones') return Promise.resolve({ data: opts.sus, error: null });
          if (tabla === 'planes_tarifa') return Promise.resolve({ data: opts.plan, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        update(fila: Fila) { updates[tabla]?.push(fila); return this; },
      };
    },
  };
  return { admin: api as never, updates, rpcs };
}

const BONO = { tipo: 'BONO', sesiones: 10 };
const MENSUAL = { tipo: 'MENSUAL', sesiones: null };
const params = { studioId: 'studio-1', reciboId: 'rec-1' };

/** El snapshot que quedó escrito en el recibo. */
const snapshot = (u: Record<string, Fila[]>) => u.recibos[0];

test('bono agotado: recarga Y deja constancia de que el saldo previo era 0', async () => {
  const { admin, updates, rpcs } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 0, fecha_fin: '2026-09-01', estado: 'EXPIRADA' },
    plan: BONO,
    rpcSaldo: 10, // 0 + 10: desde saldo 0 el resultado es el mismo que siempre
  });
  const r = await aplicarRenovacionServidor(admin, params);
  assert.equal(rpcs[0]?.nombre, 'renovar_bono_idempotente', 'la recarga va por la RPC idempotente');

  assert.equal(r.aplicada, true);
  assert.equal(r.tipo, 'BONO');
  assert.equal(updates.suscripciones.length, 1, 'tiene que recargar de verdad');

  const s = snapshot(updates);
  assert.equal(s.entrega_aplicada, true);
  assert.equal(s.entrega_sesiones_antes, 0);
  assert.equal(s.entrega_sesiones_despues, 10);
  // El estado previo se guarda porque la renovación lo pisa a ACTIVA sin leerlo:
  // sin esto no se podría restaurar.
  assert.equal(s.entrega_estado_antes, 'EXPIRADA');
  // La rama de bono NO toca fecha_fin: antes y después deben coincidir, o la
  // comprobación de interferencia daría un falso positivo.
  assert.equal(s.entrega_fecha_fin_antes, '2026-09-01');
  assert.equal(s.entrega_fecha_fin_despues, '2026-09-01');
});

test('I-6 · bono con saldo: AHORA sí entrega, sumando en vez de no hacer nada', async () => {
  // Antes esto devolvía `aplicada: false` sin tocar nada: el dinero cobrado y el
  // servicio sin entregar, registrado en una columna que no mira ninguna alerta.
  // El guard `sesiones_restantes !== 0` confundía "ya lo recargué" con "todavía
  // no lo había agotado".
  const { admin, updates, rpcs } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 3, fecha_fin: null, estado: 'ACTIVA' },
    plan: BONO,
    rpcSaldo: 13, // 3 + 10: no pierde las que le quedaban
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, true);
  assert.equal(rpcs[0]?.args.p_sesiones, 10);
  assert.equal(updates.suscripciones.length, 1, 'tiene que entregar lo comprado');
  assert.equal(snapshot(updates).entrega_aplicada, true);
  assert.equal(snapshot(updates).entrega_sesiones_antes, 3);
  assert.equal(snapshot(updates).entrega_sesiones_despues, 13, 'suma, no reemplaza: 3 + 10');
});

test('I-6 · reintento del mismo recibo: la RPC dice null y no se pisa el snapshot bueno', async () => {
  // La idempotencia ya no la da el saldo, la da el recibo. Un segundo webhook
  // sobre el mismo recibo no entrega otra vez.
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 13, fecha_fin: null, estado: 'ACTIVA' },
    plan: BONO,
    rpcSaldo: null, // ya había entregado
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, false);
  assert.equal(updates.suscripciones.length, 0, 'no debe recargar dos veces');
  assert.equal(updates.recibos.length, 0, 'ni reescribir el snapshot de la entrega buena');
});

test('mensual: extiende la fecha y guarda la de antes, que si no se pierde', async () => {
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: '2026-01-15', estado: 'EXPIRADA' },
    plan: MENSUAL,
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, true);
  assert.equal(r.tipo, 'MENSUAL');
  const s = snapshot(updates);
  assert.equal(s.entrega_fecha_fin_antes, '2026-01-15');
  assert.ok(s.entrega_fecha_fin_despues, 'la fecha nueva tiene que quedar guardada');
  assert.notEqual(s.entrega_fecha_fin_despues, s.entrega_fecha_fin_antes);
  assert.equal(s.entrega_estado_antes, 'EXPIRADA');
});

test('mensual ya extendido: no vuelve a extender, y lo deja escrito', async () => {
  const lejos = new Date();
  lejos.setFullYear(lejos.getFullYear() + 1);
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: lejos.toISOString().slice(0, 10), estado: 'ACTIVA' },
    plan: MENSUAL,
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, false, 'el guard de idempotencia sigue vivo');
  assert.equal(updates.suscripciones.length, 0);
  assert.equal(snapshot(updates).entrega_aplicada, false);
});

// ── B1/B1b (revisión de D-6): idempotencia anclada al RECIBO ────────────────

test('⚠️ B1: un recibo con snapshot ya escrito NO se reescribe ni se toca la suscripción', async () => {
  // La reparación muda del webhook corre en CADA cobro con tarjeta: sin este
  // guard, el no-op MENSUAL pisaba el snapshot bueno (aplicada true→false con
  // el "antes" ya renovado) y toda devolución futura salía OMITIDA_SIN_ENTREGA.
  const { admin, updates } = fakeAdmin({
    recibo: { suscripcion_id: 'sus-1', entrega_tipo: 'MENSUAL', entrega_aplicada: true },
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: '2026-01-15', estado: 'ACTIVA' },
    plan: MENSUAL,
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, true, 'refleja la decisión ya tomada de ESTE recibo');
  assert.equal(r.tipo, 'MENSUAL');
  assert.equal(updates.recibos.length, 0, 'el snapshot bueno no se pisa');
  assert.equal(updates.suscripciones.length, 0, 'B1b: una reentrega tardía no re-extiende fecha_fin de regalo');
});

test('B1: con snapshot previo de no-op, tampoco se re-evalúa (aplicada=false se conserva)', async () => {
  const { admin, updates } = fakeAdmin({
    recibo: { suscripcion_id: 'sus-1', entrega_tipo: 'MENSUAL', entrega_aplicada: false },
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: '2026-01-15', estado: 'EXPIRADA' },
    plan: MENSUAL,
  });
  const r = await aplicarRenovacionServidor(admin, params);
  assert.equal(r.aplicada, false);
  assert.equal(updates.recibos.length, 0);
  assert.equal(updates.suscripciones.length, 0);
});

test('B1: un BONO con snapshot ni siquiera llama a la RPC', async () => {
  const { admin, rpcs } = fakeAdmin({
    recibo: { suscripcion_id: 'sus-1', entrega_tipo: 'BONO', entrega_aplicada: true },
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 3, fecha_fin: null, estado: 'ACTIVA' },
    plan: BONO,
    rpcSaldo: 13,
  });
  const r = await aplicarRenovacionServidor(admin, params);
  assert.equal(r.aplicada, true);
  assert.equal(rpcs.length, 0, 'la RPC ya tiene su candado, pero no hace falta ni llegar a ella');
});

test('B1: un snapshot de otra familia (ALTA_WEB) también corta, sin mentir el tipo', async () => {
  const { admin, updates } = fakeAdmin({
    recibo: { suscripcion_id: 'sus-1', entrega_tipo: 'ALTA_WEB', entrega_aplicada: true },
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: '2026-01-15', estado: 'ACTIVA' },
    plan: MENSUAL,
  });
  const r = await aplicarRenovacionServidor(admin, params);
  assert.equal(r.aplicada, true);
  assert.equal(r.tipo, 'NINGUNA', 'ALTA_WEB no cabe en el union: se degrada honesto, nunca se inventa');
  assert.equal(updates.recibos.length, 0);
  assert.equal(updates.suscripciones.length, 0);
});

test('recibo sin suscripción (una penalización): NINGUNA, no en blanco', async () => {
  // Distinguir "no aplicaba" de "no se llegó a mirar" es lo que evita que
  // después se proponga revertir un cobro que no entregó ningún servicio.
  const api = {
    from() {
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: { suscripcion_id: null }, error: null }); },
        update(fila: Fila) { capturado.push(fila); return this; },
      };
    },
  };
  const capturado: Fila[] = [];
  const r = await aplicarRenovacionServidor(api as never, params);

  assert.equal(r.tipo, 'NINGUNA');
  assert.equal(r.aplicada, false);
  assert.equal(capturado[0].entrega_tipo, 'NINGUNA');
  assert.equal(capturado[0].entrega_aplicada, false);
});

// ── Venta inicial vs renovación ──────────────────────────────────────────────

test('⚠️ cobrar la PRIMERA venta de un bono NO regala otra tanda de sesiones', async () => {
  // Recepción asigna un «Bono 10» desde la ficha: `assignPlan` crea la
  // suscripción YA con sus 10 sesiones y un recibo PENDIENTE. Pulsar «Cobrar
  // online» entraba aquí, `renovar_bono_idempotente` SUMA, y la socia acababa
  // con 20 sesiones habiendo pagado una vez.
  //
  // La idempotencia de la RPC es por RECIBO, así que no lo frenaba: para ese
  // recibo era la primera entrega.
  const { admin, updates, rpcs } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 10, fecha_fin: '2026-11-05', estado: 'ACTIVA' },
    plan: BONO,
    rpcSaldo: 20, // lo que habría pasado: 10 + 10
    recibo: { suscripcion_id: 'sus-1', es_renovacion: false },
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(rpcs.length, 0, 'no puede ni llamar a la recarga');
  assert.equal(updates.suscripciones.length, 0, 'la suscripción no se toca');
  assert.equal(r.aplicada, false);
  assert.equal(r.tipo, 'NINGUNA');
});

test('una venta inicial de CLASE SUELTA tampoco duplica', async () => {
  // Mismo camino: serían dos clases por el precio de una.
  const { admin, rpcs } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 1, fecha_fin: null, estado: 'ACTIVA' },
    plan: { tipo: 'PUNTUAL', sesiones: 1 },
    rpcSaldo: 2,
    recibo: { suscripcion_id: 'sus-1', es_renovacion: false },
  });
  const r = await aplicarRenovacionServidor(admin, params);
  assert.equal(rpcs.length, 0);
  assert.equal(r.aplicada, false);
});

test('una venta inicial de MENSUAL no extiende el ciclo por cobrarse', async () => {
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: '2026-10-06', estado: 'ACTIVA' },
    plan: MENSUAL,
    recibo: { suscripcion_id: 'sus-1', es_renovacion: false },
  });
  const r = await aplicarRenovacionServidor(admin, params);
  assert.equal(updates.suscripciones.length, 0);
  assert.equal(r.aplicada, false);
});

test('una renovación de verdad SIGUE recargando, aunque queden sesiones vivas', async () => {
  // Esto es lo que no se puede romper al arreglar lo de arriba: renovar por
  // adelantado con saldo > 0 es legítimo, y el guard viejo
  // (`sesiones_restantes !== 0`) se quitó en I-6 justo porque cobraba sin
  // entregar. La distinción es QUÉ ES el recibo, no cuánto saldo queda.
  const { admin, updates, rpcs } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 2, fecha_fin: '2026-10-01', estado: 'ACTIVA' },
    plan: BONO,
    rpcSaldo: 12, // 2 + 10: no pierde lo que le quedaba
    recibo: { suscripcion_id: 'sus-1', es_renovacion: true },
  });
  const r = await aplicarRenovacionServidor(admin, params);
  assert.equal(rpcs[0]?.nombre, 'renovar_bono_idempotente');
  assert.equal(r.aplicada, true);
  assert.equal(updates.suscripciones.length, 1);
});
