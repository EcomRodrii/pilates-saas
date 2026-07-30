import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reclamarWebhookEvent, marcarWebhookProcesado } from './webhook-idempotencia.ts';

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
