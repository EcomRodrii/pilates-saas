import * as Sentry from '@sentry/nextjs';

// Sentry (servidor). Se activa solo si hay DSN (NEXT_PUBLIC_SENTRY_DSN); sin él
// es un no-op, así que la app funciona igual mientras no lo configures en Vercel.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // No mandar PII por defecto (emails, nombres de socias). Actívalo a conciencia.
  sendDefaultPii: false,
});
