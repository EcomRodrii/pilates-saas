import * as Sentry from '@sentry/nextjs';
import { sanearEventoSentry, sanearMigaSentry } from '@/lib/sentry-scrub';

// Sentry (edge runtime: middleware, edge routes). Igual que el de servidor.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: sanearEventoSentry,
  beforeSendTransaction: sanearEventoSentry,
  beforeBreadcrumb: sanearMigaSentry,
});
