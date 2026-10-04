import { Resend } from 'resend';
import { correoCodigoAcceso } from '@/lib/emails/tentare/cuenta';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { MINUTOS_CODIGO_CORREO } from '@/lib/auth/codigo-correo-reglas';

// El código del segundo paso al entrar al panel (lib/auth/codigo-correo.ts).
// A diferencia del resto de envíos, NO es best-effort: si no sale, la pantalla
// tiene que saberlo para no decir «te lo hemos enviado» y pasar a la app.
// Firma «Tentare» (la marca paraguas del login: el rol aún no importa aquí).
export async function enviarEmailCodigoAcceso(params: { to: string; codigo: string }): Promise<{ ok: boolean; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: remitentePorMarca('Tentare'),
      to: [params.to],
      subject: 'Tu código para entrar a Tentare',
      html: correoCodigoAcceso({ codigo: params.codigo, minutos: MINUTOS_CODIGO_CORREO }),
    });
    // El mensaje de Resend puede llevar la dirección: al log, sin ella.
    if (error) { console.error('[codigo-acceso-server]', error.name); return { ok: false }; }
    return { ok: true };
  } catch (err) {
    console.error('[codigo-acceso-server]', err instanceof Error ? err.name : 'error');
    return { ok: false };
  }
}
