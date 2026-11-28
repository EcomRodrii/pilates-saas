import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ESPERA_REPROCESO_WEBHOOK_MS,
  MAX_REINTENTOS_AUTOMATICOS_WEBHOOK,
  reprocesarWebhooksConnect,
  type DependenciasReprocesoWebhook,
  type EventoStripeRecuperado,
  type WebhookConnectPendiente,
} from './webhook-reproceso.ts';

interface Evento extends EventoStripeRecuperado { account: string | null }

function pendiente(overrides: Partial<WebhookConnectPendiente> = {}): WebhookConnectPendiente {
  return {
    id: 'connect:evt_123', tipo: 'charge.refunded', stripe_account_id: 'acct_123', reprocesos: 0,
    ...overrides,
  };
}

function fake(overrides: Partial<DependenciasReprocesoWebhook<Evento>> = {}) {
  const llamadas: string[] = [];
  const estadoPorClave = new Map<string, string>([['connect:evt_123', 'procesando']]);
  const deps: DependenciasReprocesoWebhook<Evento> = {
    listar: async (corte, limite) => {
      llamadas.push(`listar:${corte}:${limite}`);
      return [pendiente()];
    },
    reclamar: async e => { llamadas.push(`reclamar:${e.id}`); return true; },
    incrementarIntento: async id => { llamadas.push(`intento:${id}`); return 1; },
    recuperar: async (id, cuenta) => {
      llamadas.push(`recuperar:${id}:${cuenta}`);
      return { id, type: 'charge.refunded', account: cuenta };
    },
    procesar: async (e, clave) => { llamadas.push(`procesar:${e.id}:${clave}`); estadoPorClave.set(clave, 'completado'); },
    estado: async clave => { llamadas.push(`estado:${clave}`); return estadoPorClave.get(clave) ?? null; },
    fallar: async clave => { llamadas.push(`fallar:${clave}`); estadoPorClave.set(clave, 'fallido'); },
    error: (e, intento, causa) => { llamadas.push(`error:${e.id}:${intento}:${String(causa)}`); },
    ...overrides,
  };
  return { deps, llamadas, estadoPorClave };
}

test('reclama, recupera desde la cuenta Connect y ejecuta el mismo procesador idempotente', async () => {
  const { deps, llamadas } = fake();
  const ahora = new Date('2026-11-28T12:00:00.000Z');
  const resultado = await reprocesarWebhooksConnect(deps, ahora);

  assert.deepEqual(resultado, { encontrados: 1, reclamados: 1, completados: 1, fallidos: 0, omitidos: 0 });
  assert.ok(llamadas.includes(`listar:${new Date(ahora.getTime() - ESPERA_REPROCESO_WEBHOOK_MS).toISOString()}:5`));
  assert.ok(llamadas.includes('recuperar:evt_123:acct_123'));
  assert.ok(llamadas.includes('procesar:evt_123:connect:evt_123'));
  assert.ok(!llamadas.some(x => x.startsWith('fallar:')));
});

test('no reprocesa una fila que otro webhook o cron ya reclamó', async () => {
  const { deps, llamadas } = fake({ reclamar: async () => false });
  const resultado = await reprocesarWebhooksConnect(deps);
  assert.equal(resultado.omitidos, 1);
  assert.equal(resultado.reclamados, 0);
  assert.equal(llamadas.some(x => x.startsWith('recuperar:')), false);
});

test('un fallo recuperado deja el evento fallido y permite el siguiente intento tras la ventana', async () => {
  const { deps, llamadas, estadoPorClave } = fake({
    procesar: async () => { throw new Error('Stripe temporalmente no disponible'); },
  });
  const resultado = await reprocesarWebhooksConnect(deps);
  assert.equal(resultado.fallidos, 1);
  assert.equal(estadoPorClave.get('connect:evt_123'), 'fallido');
  assert.ok(llamadas.some(x => x.startsWith('error:connect:evt_123:1:')));
});

test('un evento que se procesa pero queda incompleto se vuelve a marcar fallido', async () => {
  const { deps, estadoPorClave } = fake({ procesar: async () => {} });
  const resultado = await reprocesarWebhooksConnect(deps);
  assert.equal(resultado.fallidos, 1);
  assert.equal(estadoPorClave.get('connect:evt_123'), 'fallido');
});

test('al alcanzar el límite no vuelve a recuperar el evento de Stripe', async () => {
  const { deps, llamadas } = fake({
    listar: async () => [pendiente({ reprocesos: MAX_REINTENTOS_AUTOMATICOS_WEBHOOK })],
  });
  const resultado = await reprocesarWebhooksConnect(deps);
  assert.equal(resultado.omitidos, 1);
  assert.equal(llamadas.some(x => x.startsWith('recuperar:')), false);
});

test('no acepta un evento recuperado con ID o tipo distinto al reclamado', async () => {
  const { deps, estadoPorClave } = fake({ recuperar: async () => ({ id: 'evt_otra', type: 'charge.refunded', account: null }) });
  const resultado = await reprocesarWebhooksConnect(deps);
  assert.equal(resultado.fallidos, 1);
  assert.equal(estadoPorClave.get('connect:evt_123'), 'fallido');
});

test('si no se puede contabilizar el intento no arriesga un reproceso a ciegas', async () => {
  const { deps, llamadas, estadoPorClave } = fake({ incrementarIntento: async () => null });
  const resultado = await reprocesarWebhooksConnect(deps);
  assert.equal(resultado.fallidos, 1);
  assert.equal(estadoPorClave.get('connect:evt_123'), 'fallido');
  assert.equal(llamadas.some(x => x.startsWith('recuperar:')), false);
});
