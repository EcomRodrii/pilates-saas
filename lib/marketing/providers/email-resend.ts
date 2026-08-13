import type { Resend } from 'resend';
import { conReintentoResend } from '@/lib/emails/resend-reintentos';
import { remitentePorMarca } from '@/lib/emails/remitente.ts';
import type { EmailProvider, ResultadoEnvioProvider } from './tipos.ts';

// EmailProvider sobre Resend — mismo patrón (reintento + remitente por
// marca + idempotency key) que ya usaban, duplicado, procesarCandidato y
// procesarCandidatoMkt en lib/inngest/automatizaciones.ts. El caller
// garantiza `resend` no nulo (ver el guard `!dry && !resend` en
// procesarEstudioAutomatizaciones) antes de instanciar este provider.
export function resendEmailProvider(resend: Resend): EmailProvider {
  return {
    async enviar({ to, subject, html, studioNombre, idempotencyKey }): Promise<ResultadoEnvioProvider> {
      const { data, error } = await conReintentoResend(() =>
        resend.emails.send(
          { from: remitentePorMarca(studioNombre || 'Tentare'), to: [to], subject, html },
          idempotencyKey ? { idempotencyKey } : undefined,
        )
      );
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: data?.id };
    },
  };
}
