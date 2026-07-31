import { Resend } from 'resend';
import { render } from '@react-email/render';
import { FalloPagoSaasEmail } from '@/lib/emails/fallo-pago-saas-template';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';

// Aviso a la propietaria del estudio de un fallo de cobro de SU PROPIA
// suscripción a Tentare (`invoice.payment_failed` del webhook de billing —
// distinto del webhook de Connect, que avisa de fallos de cobro a SUS
// socias). Sin esto, el primer fallo era invisible hasta que el estudio se
// suspendía. Best-effort: nunca debe romper el webhook.
export async function enviarEmailFalloPagoSaas(params: {
  to: string;
  estudioNombre: string;
  plan: string;
  proximoIntento?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };
  if (esDominioReservado(params.to)) return { ok: false, error: `Email de ejemplo (${params.to}), no una dirección real` };

  try {
    const html = await render(FalloPagoSaasEmail({
      estudioNombre: params.estudioNombre, plan: params.plan, proximoIntento: params.proximoIntento,
    }));
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [params.to],
      subject: `No hemos podido cobrar tu suscripción — plan ${params.plan}`,
      html,
    });
    if (error) { console.error('[fallo-pago-saas-server]', error); return { ok: false, error: error.message }; }
    return { ok: true };
  } catch (err) {
    console.error('[fallo-pago-saas-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
