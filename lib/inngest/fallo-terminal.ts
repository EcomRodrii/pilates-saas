// Auditoría 2026-09-16 (AUT-1): ninguna de las 24 funciones Inngest llevaba
// `onFailure` ni middleware de error. Cuando una agotaba sus reintentos, el
// fallo terminal quedaba solo en el dashboard de Inngest — no a Sentry, no en
// una fila, no en la bandeja única. Si `automatizacionesDispatcher` fallaba su
// tic de las 07:00, ningún estudio recibía ninguna automatización ese día y
// nadie se enteraba (mismo patrón que ya se cerró DENTRO del motor de
// notificaciones, `lib/notifications/engine.ts:10-11`, pero no en la capa de
// Inngest que lo envuelve).
//
// En vez de añadir `onFailure` a las 24 (misma alerta, 24 copias), se usa el
// evento de sistema que Inngest emite SIEMPRE que una función agota
// reintentos, `inngest/function.failed` — un solo punto para las 24 y para
// cualquiera que se añada después. Aditivo y sin riesgo: no toca ninguna
// función existente, solo escucha.
//
// No verificado contra un run real de Inngest (mismo tipo de límite que el
// resto de este módulo en este entorno): la forma de `event.data` sale de la
// documentación de Inngest, no de una ejecución observada, así que se lee de
// forma defensiva y el evento entero se manda a Sentry en `extra` — si algún
// campo cambiara de nombre, la alerta sigue llegando, solo con peor detalle.
import * as Sentry from '@sentry/nextjs';
import { inngest } from '@/lib/inngest/client';

interface EventoFalloFuncion {
  function_id?: unknown;
  run_id?: unknown;
  error?: { name?: unknown; message?: unknown } | unknown;
}

export const alertarFalloTerminalInngest = inngest.createFunction(
  { id: 'alertar-fallo-terminal-inngest', triggers: [{ event: 'inngest/function.failed' }] },
  async ({ event }: { event: { data?: EventoFalloFuncion } }) => {
    const data = (event.data ?? {}) as EventoFalloFuncion;
    const functionId = typeof data.function_id === 'string' ? data.function_id : 'desconocida';
    const error = data.error as { name?: unknown; message?: unknown } | undefined;
    const mensajeError = typeof error?.message === 'string' ? error.message : 'sin mensaje';
    Sentry.captureMessage(`[inngest] función agotó sus reintentos: ${functionId}`, {
      level: 'error',
      tags: { area: 'inngest', function_id: functionId },
      extra: { runId: data.run_id, mensajeError, event },
    });
  },
);
