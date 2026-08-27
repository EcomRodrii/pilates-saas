import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reclamarWebhookEvent, marcarWebhookProcesado, claveWebhook } from './webhook-idempotencia.ts';

// Fake admin client que reproduce EXACTAMENTE la semántica SQL de la RPC
// reclamar_webhook_event / completar_webhook_event (migr. 20260730109000):
// UPSERT condicional check-y-marca en una sola "sentencia" (sin liberación
// explícita — la reclamación expira sola). No pega contra Postgres real, pero
// modela el contrato atómico que el wrapper de lib/webhook-idempotencia.ts
// asume, para poder probar el caso de carrera sin una base de datos viva.
function crearAdminFake(nowMs: () => number) {
  const filas = new Map<string, { estado: 'procesando' | 'completado'; reclamadoEnMs: number }>();
  return {
    async rpc(nombre: string, params: Record<string, unknown>) {
      if (nombre === 'reclamar_webhook_event') {
        const id = params.p_event_id as string;
        const expiraMs = (params.p_expira_segundos as number) * 1000;
        const fila = filas.get(id);
        if (!fila) {
          filas.set(id, { estado: 'procesando', reclamadoEnMs: nowMs() });
          return { data: true, error: null };
        }
        const expirada = fila.estado === 'procesando' && fila.reclamadoEnMs < nowMs() - expiraMs;
        if (!expirada) {
          return { data: false, error: null };
        }
        fila.estado = 'procesando';
        fila.reclamadoEnMs = nowMs();
        return { data: true, error: null };
      }
      if (nombre === 'completar_webhook_event') {
        const id = params.p_event_id as string;
        const fila = filas.get(id);
        if (fila && fila.estado === 'procesando') fila.estado = 'completado';
        return { data: null, error: null };
      }
      throw new Error(`rpc no soportada en el fake: ${nombre}`);
    },
  };
}

test('fallo transitorio: sin marcar completado, la reclamación expira y el siguiente intento reprocesa', async () => {
  let ahora = 1_000_000;
  const admin = crearAdminFake(() => ahora);

  const primerIntento = await reclamarWebhookEvent(admin as any, 'evt_1', 'checkout.session.completed', 120);
  assert.equal(primerIntento, true, 'el primer intento debe poder reclamar el evento');
  // El handler falla (5xx) y NUNCA llama a marcarWebhookProcesado.

  const reintentoInmediato = await reclamarWebhookEvent(admin as any, 'evt_1', 'checkout.session.completed', 120);
  assert.equal(reintentoInmediato, false, 'antes de expirar, un reintento inmediato no debe reprocesar (evita duplicar mientras el fallo aún podría estar en curso)');

  ahora += 121_000; // pasan los 120s de expiración
  const reintentoTrasExpirar = await reclamarWebhookEvent(admin as any, 'evt_1', 'checkout.session.completed', 120);
  assert.equal(reintentoTrasExpirar, true, 'pasada la expiración, el reintento de Stripe SÍ debe poder reprocesar el evento fallido');
});

test('entrega concurrente del mismo event.id: solo una gana el procesamiento', async () => {
  const admin = crearAdminFake(() => 2_000_000);

  const [ganaA, ganaB] = await Promise.all([
    reclamarWebhookEvent(admin as any, 'evt_concurrente', 'payment_intent.succeeded', 120),
    reclamarWebhookEvent(admin as any, 'evt_concurrente', 'payment_intent.succeeded', 120),
  ]);

  const ganadores = [ganaA, ganaB].filter(Boolean).length;
  assert.equal(ganadores, 1, 'de dos entregas concurrentes del mismo event.id, exactamente una debe reclamar el procesamiento');
});

test('marcar procesado hace que las siguientes reclamaciones se reconozcan como duplicado', async () => {
  const admin = crearAdminFake(() => 3_000_000);

  const reclamado = await reclamarWebhookEvent(admin as any, 'evt_2', 'checkout.session.completed', 120);
  assert.equal(reclamado, true);

  await marcarWebhookProcesado(admin as any, 'evt_2');

  const duplicado = await reclamarWebhookEvent(admin as any, 'evt_2', 'checkout.session.completed', 120);
  assert.equal(duplicado, false, 'un evento ya completado debe reconocerse como duplicado, aunque no haya pasado el tiempo de expiración');
});

test('fail-open: si la RPC de reclamación falla, se procesa igualmente (no se pierde un pago)', async () => {
  const adminRoto = {
    async rpc() {
      return { data: null, error: { message: 'conexión perdida' } };
    },
  };
  const resultado = await reclamarWebhookEvent(adminRoto as any, 'evt_roto', 'checkout.session.completed', 120);
  assert.equal(resultado, true, 'ante un error de infraestructura, reclamarWebhookEvent debe fallar abierto y dejar procesar');
});

// ─────────────────────────────────────────────────────────────────────────────
// Regresión del cobro perdido del 8-ago-2026 (1 €).
//
// Stripe entregó un `checkout.session.completed` de la compra de un bono al
// destino del SaaS (/api/billing/webhook). Ese handler no tenía nada que hacer
// con él, pero SÍ reclamó el `event.id` en esta tabla compartida y lo marcó
// completado. Cuando el evento llegara al webhook que entrega el bono, lo vería
// como duplicado y no haría nada: la socia pagó y no recibió su bono.
// ─────────────────────────────────────────────────────────────────────────────

test('⚠️ el caso del bug: un ámbito NO puede consumir la reclamación del otro', async () => {
  const admin = crearAdminFake(() => 4_000_000);
  const evento = 'evt_bono_1eur';

  // El webhook del SaaS recibe el evento primero, no es suyo, y lo completa.
  const reclamaBilling = await reclamarWebhookEvent(
    admin as any, claveWebhook('billing', evento), 'checkout.session.completed', 120,
  );
  assert.equal(reclamaBilling, true);
  await marcarWebhookProcesado(admin as any, claveWebhook('billing', evento));

  // El webhook de Connect —el que SÍ entrega el bono— tiene que poder procesarlo.
  const reclamaConnect = await reclamarWebhookEvent(
    admin as any, claveWebhook('connect', evento), 'checkout.session.completed', 120,
  );
  assert.equal(
    reclamaConnect, true,
    'el webhook que entrega el bono debe poder procesar el evento aunque el del SaaS ya lo haya visto',
  );
});

test('dentro del MISMO ámbito, la idempotencia sigue intacta', async () => {
  const admin = crearAdminFake(() => 5_000_000);
  const clave = claveWebhook('connect', 'evt_mismo_ambito');

  assert.equal(await reclamarWebhookEvent(admin as any, clave, 'checkout.session.completed', 120), true);
  await marcarWebhookProcesado(admin as any, clave);
  assert.equal(
    await reclamarWebhookEvent(admin as any, clave, 'checkout.session.completed', 120), false,
    'separar por ámbito no puede abrir la puerta a procesar dos veces el mismo evento en el mismo webhook',
  );
});

test('la clave lleva el ámbito por delante del id del evento', () => {
  assert.equal(claveWebhook('connect', 'evt_1'), 'connect:evt_1');
  assert.equal(claveWebhook('billing', 'evt_1'), 'billing:evt_1');
  assert.notEqual(claveWebhook('connect', 'evt_1'), claveWebhook('billing', 'evt_1'));
});

// Fase E (WhatsApp Embedded Signup, ver WHATSAPP_AUDIT.md): el webhook de
// Meta reutiliza esta MISMA infraestructura de dedup con un ámbito propio —
// mismo motivo que separa 'connect'/'billing': el id de un evento de
// WhatsApp (wamid) vive en un espacio de nombres distinto al de Stripe, y
// aislar por ámbito evita cualquier colisión teórica entre los dos.
test('ámbito "whatsapp": aislado del resto igual que connect/billing', async () => {
  const admin = crearAdminFake(() => 6_000_000);
  const clave = claveWebhook('whatsapp', 'wamid.ABC123:delivered');

  assert.equal(claveWebhook('whatsapp', 'evt_1'), 'whatsapp:evt_1');
  assert.notEqual(claveWebhook('whatsapp', 'evt_1'), claveWebhook('connect', 'evt_1'));

  assert.equal(await reclamarWebhookEvent(admin as any, clave, 'whatsapp_status_delivered', 120), true);
  await marcarWebhookProcesado(admin as any, clave);
  assert.equal(
    await reclamarWebhookEvent(admin as any, clave, 'whatsapp_status_delivered', 120), false,
    'un status ya procesado (mismo wamid, mismo estado) debe reconocerse como duplicado',
  );

  // Mismo wamid, estado DISTINTO (sent → delivered) es un evento real
  // diferente, no un duplicado — la clave incluye el estado a propósito.
  const claveSiguienteEstado = claveWebhook('whatsapp', 'wamid.ABC123:read');
  assert.equal(await reclamarWebhookEvent(admin as any, claveSiguienteEstado, 'whatsapp_status_read', 120), true);
});
