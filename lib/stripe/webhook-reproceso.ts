export const MAX_WEBHOOKS_POR_REPROCESO = 5;
export const MAX_REINTENTOS_AUTOMATICOS_WEBHOOK = 5;
export const ESPERA_REPROCESO_WEBHOOK_MS = 15 * 60_000;
export const MAX_REPROCESOS_AUTOMATICOS_WEBHOOK = 5;

export interface WebhookConnectPendiente {
  id: string;
  tipo: string | null;
  stripe_account_id: string | null;
  reprocesos: number;
}

export interface EventoStripeRecuperado {
  id: string;
  type: string;
}

export interface DependenciasReprocesoWebhook<TEvento extends EventoStripeRecuperado> {
  listar(corteIso: string, limite: number): Promise<WebhookConnectPendiente[]>;
  reclamar(evento: WebhookConnectPendiente): Promise<boolean>;
  incrementarIntento(eventId: string): Promise<number | null>;
  recuperar(eventId: string, cuentaStripe: string | null): Promise<TEvento>;
  procesar(evento: TEvento, clave: string): Promise<void>;
  estado(clave: string): Promise<string | null>;
  fallar(clave: string): Promise<void>;
  error(evento: WebhookConnectPendiente, intento: number, causa: unknown): void;
}

export interface ResumenReprocesoWebhook {
  encontrados: number;
  reclamados: number;
  completados: number;
  fallidos: number;
  omitidos: number;
}

/**
 * Reintenta solo eventos Connect antiguos, de uno en uno y con un máximo
 * global de cinco intentos automáticos por evento. La operación y el guard de
 * idempotencia siguen siendo los del webhook original.
 */
export async function reprocesarWebhooksConnect<TEvento extends EventoStripeRecuperado>(
  deps: DependenciasReprocesoWebhook<TEvento>,
  ahora: Date = new Date(),
): Promise<ResumenReprocesoWebhook> {
  const corte = new Date(ahora.getTime() - ESPERA_REPROCESO_WEBHOOK_MS).toISOString();
  const eventos = await deps.listar(corte, MAX_WEBHOOKS_POR_REPROCESO);
  const resumen: ResumenReprocesoWebhook = {
    encontrados: eventos.length, reclamados: 0, completados: 0, fallidos: 0, omitidos: 0,
  };

  for (const evento of eventos) {
    if (evento.reprocesos >= MAX_REINTENTOS_AUTOMATICOS_WEBHOOK) {
      resumen.omitidos++;
      continue;
    }
    if (!await deps.reclamar(evento)) {
      resumen.omitidos++;
      continue;
    }
    resumen.reclamados++;

    const intento = await deps.incrementarIntento(evento.id);
    if (intento === null || intento > MAX_REINTENTOS_AUTOMATICOS_WEBHOOK) {
      await deps.fallar(evento.id);
      resumen.fallidos++;
      deps.error(evento, intento ?? evento.reprocesos, new Error('No se pudo contar el intento de reproceso'));
      continue;
    }

    try {
      const stripeEventId = evento.id.slice('connect:'.length);
      const recuperado = await deps.recuperar(stripeEventId, evento.stripe_account_id);
      if (recuperado.id !== stripeEventId || (evento.tipo && recuperado.type !== evento.tipo)) {
        throw new Error('El evento recuperado de Stripe no coincide con el registro reclamado');
      }

      await deps.procesar(recuperado, evento.id);
      if (await deps.estado(evento.id) === 'completado') {
        resumen.completados++;
      } else {
        await deps.fallar(evento.id);
        resumen.fallidos++;
        deps.error(evento, intento, new Error('El procesamiento terminó sin completar el evento'));
      }
    } catch (causa) {
      await deps.fallar(evento.id);
      resumen.fallidos++;
      deps.error(evento, intento, causa);
    }
  }

  return resumen;
}
