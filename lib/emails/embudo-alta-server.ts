import { Resend } from 'resend';
import { correoEmbudoConfirmadoSinEstudio, correoEmbudoSinConfirmar } from '@/lib/emails/tentare/embudo-alta';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { LEGAL } from '@/lib/legal-info';

// Aviso de la Fase 3 del onboarding (embudo de alta): mismo criterio
// best-effort que el resto de emisores fuera del Notification Engine — quien
// llama a esto (lib/inngest/embudo-alta.ts) no tiene studioId real todavía,
// así que no puede pasar por `publish()` (exige uno).
export async function enviarAvisoEmbudoAlta(params: {
  to: string;
  confirmado: boolean;
  estudioNombre: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };
  if (esDominioReservado(params.to)) return { ok: false, error: 'Email de ejemplo, no una dirección real' };

  const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
  try {
    const html = params.confirmado
      ? correoEmbudoConfirmadoSinEstudio({ estudioNombre: params.estudioNombre, urlLogin: `${base}/login` })
      : correoEmbudoSinConfirmar({ estudioNombre: params.estudioNombre, urlCrearEstudio: `${base}/crear-estudio` });
    const { error } = await new Resend(apiKey).emails.send({
      from: remitentePorMarca('Tentare'),
      to: [params.to],
      subject: params.confirmado ? 'Tu estudio está a un clic de estar listo' : 'Te falta un paso para activar tu estudio',
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
