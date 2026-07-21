import { Resend } from 'resend';
import { render } from '@react-email/render';
import { PedirValoracionEmail } from '@/lib/emails/valoracion-template';

// Email a la alumna tras la clase pidiéndole que la valore, con la plantilla
// premium compartida (lib/emails/layout.tsx). Degrada limpio si Resend no está
// configurado → { skipped } (mismo patrón que sustituciones/email.ts).

export async function enviarEmailPedirValoracion(params: {
  to: string;
  toName: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  claseNombre: string;
  cuando: string;
  instructorNombre: string;
  url: string;
}): Promise<{ ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  const { estudioNombre, claseNombre } = params;
  const html = await render(PedirValoracionEmail(params));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [params.to],
      subject: `¿Qué tal tu clase de ${claseNombre}? — ${estudioNombre}`,
      html,
    });
    if (error) { console.error('[valoraciones/email]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[valoraciones/email]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar' };
  }
}
