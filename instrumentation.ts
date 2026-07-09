import * as Sentry from '@sentry/nextjs';

// Carga la config de Sentry del runtime correcto (Node o Edge). Next llama a
// register() una vez al arrancar el servidor.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captura errores de las rutas/Server Components en Sentry.
export const onRequestError = Sentry.captureRequestError;
