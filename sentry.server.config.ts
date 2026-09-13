import * as Sentry from '@sentry/nextjs';
import { sanearEventoSentry, sanearMigaSentry } from '@/lib/sentry-scrub';

// Sentry (servidor). Se activa solo si hay DSN (NEXT_PUBLIC_SENTRY_DSN); sin él
// es un no-op, así que la app funciona igual mientras no lo configures en Vercel.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // No mandar PII por defecto (emails, nombres de socias). Actívalo a conciencia.
  sendDefaultPii: false,
  // `sendDefaultPii` solo filtra cabeceras/cookies por nombre: lo que el código
  // mete en extra, mensajes o URLs pasa por el saneado común (lib/sentry-scrub.ts).
  beforeSend: sanearEventoSentry,
  beforeSendTransaction: sanearEventoSentry,
  beforeBreadcrumb: sanearMigaSentry,
});
