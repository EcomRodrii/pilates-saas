// ─────────────────────────────────────────────────────────────────────────────
// R4 · Emisión de analítica de producto a PostHog (API de captura HTTP, sin SDK).
//
// APAGADO por defecto: sin `POSTHOG_KEY` es un no-op total — mismo patrón que
// stripe-fees / billing-guard. Se enciende poniendo POSTHOG_KEY (y opcionalmente
// POSTHOG_HOST) en Vercel.
//
// RESIDENCIA DE DATOS (GDPR): el host por defecto es la nube EU de PostHog
// (eu.i.posthog.com). Al ser datos de un negocio del sector salud, mantener el
// dato en la UE y firmar el DPA de PostHog es la opción por defecto correcta;
// cambia POSTHOG_HOST solo con conocimiento de causa.
//
// LATENCIA CERO: el envío se encola con `after()` de Next — corre DESPUÉS de que
// la respuesta ya salió, así que no añade ni un ms al webhook/ruta. Solo se puede
// llamar en ámbito de request (webhooks y rutas API); NO desde crons/Inngest
// (ahí `after()` no aplica — ver follow-up en el informe).
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server';
import { construirEvento, type EventoAnalitica } from './analytics-eventos.ts';

const HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';

async function enviar(studioId: string, evento: EventoAnalitica, timestampISO?: string): Promise<void> {
  const key = process.env.POSTHOG_KEY;
  if (!key) return;
  try {
    await fetch(`${HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, ...construirEvento(studioId, evento, timestampISO) }),
      signal: AbortSignal.timeout(2000), // una analítica lenta no puede colgar el webhook
    });
  } catch {
    // Fire-and-forget: la analítica NUNCA rompe un cobro ni un webhook.
  }
}

/**
 * Registra un evento de producto (no-op si POSTHOG_KEY no está). Encola el envío
 * para después de la respuesta. Llamar SOLO en ámbito de request.
 */
export function capturar(studioId: string, evento: EventoAnalitica, timestampISO?: string): void {
  if (!process.env.POSTHOG_KEY || !studioId) return;
  after(() => enviar(studioId, evento, timestampISO));
}

export type { EventoAnalitica };
