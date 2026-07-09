import * as Sentry from '@sentry/nextjs';

// Sentry (edge runtime: middleware, edge routes). Igual que el de servidor.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
