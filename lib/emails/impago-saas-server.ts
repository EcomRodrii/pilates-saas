import { Resend } from 'resend';
import { correoImpagoSaas } from '@/lib/emails/tentare/cuenta';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from '@/lib/emails/remitente';

// Los avisos de la recuperación de impagos del SaaS (lib/billing/impagos): lo que el
// estudio paga a Tentare, nunca lo que sus alumnas pagan al estudio. Best-effort: quien
// llama decide qué hacer si no sale (el aviso se «libera» y el siguiente tic lo reintenta).
const ASUNTOS = {
  primero: (plan: string) => `No hemos podido cobrar tu suscripción — plan ${plan}`,
  recordatorio: (plan: string) => `Tu suscripción sigue sin cobrarse — plan ${plan}`,
  restriccion: () => 'Tu cuenta podría restringirse si el pago no se completa',
  recuperado: () => 'Tu suscripción está al día',
} as const;

export type FaseImpago = keyof typeof ASUNTOS;

export async function enviarEmailImpagoSaas(params: {
  to: string;
  fase: FaseImpago;
  estudioNombre: string;
  plan: string;
  importe?: string | null;
  motivo?: string | null;
  proximoIntento?: string | null;
  urlActualizar: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };
  if (esDominioReservado(params.to)) return { ok: false, error: 'Email de ejemplo, no una dirección real' };
  try {
    const html = correoImpagoSaas({
      fase: params.fase, estudioNombre: params.estudioNombre, plan: params.plan, importe: params.importe,
      motivo: params.motivo, proximoIntento: params.proximoIntento, urlActualizar: params.urlActualizar,
    });
    const { error } = await new Resend(apiKey).emails.send({
      from: remitentePorMarca('Tentare'),
      to: [params.to],
      subject: ASUNTOS[params.fase](params.plan),
      html,
    });
    if (error) { console.error('[impago-saas-server]', error); return { ok: false, error: error.message }; }
    return { ok: true };
  } catch (err) {
    console.error('[impago-saas-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
