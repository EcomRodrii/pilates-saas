import { Resend } from 'resend';
import { render } from '@react-email/render';
import { ImpagoEmail } from '@/lib/emails/impago-template';

// Envío del email de IMPAGO a la socia desde código de servidor (webhook de Stripe
// y barrido de dunning). Mismo patrón que send-server.ts: si Resend no está
// configurado no falla, devuelve { skipped }. Es best-effort — quien lo llama no
// debe romper el flujo de cobro si el email no sale.
export async function enviarEmailImpago(params: {
  to: string;
  toName: string;
  estudioNombre?: string;
  concepto: string;
  importe: number;
  definitivo: boolean;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    const html = await render(
      ImpagoEmail({
        socioNombre: params.toName,
        estudioNombre: params.estudioNombre,
        concepto: params.concepto,
        importe: params.importe,
        definitivo: params.definitivo,
      }),
    );
    const subject = params.definitivo
      ? `No hemos podido cobrar tu cuota — ${params.concepto}`
      : `Problema con tu pago — ${params.concepto}`;
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [params.to],
      subject,
      html,
    });
    if (error) {
      console.error('[impago-server]', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[impago-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
