import { Resend } from 'resend';
import { correoValoracion } from '@/lib/emails/estudio/mensajes';
import type { MarcaCorreo } from '@/lib/emails/estudio/plantilla';
import { remitentePorMarca } from '../emails/remitente.ts';

// Email a la alumna tras la clase pidiéndole que la valore, con el sistema de
// correos del estudio (lib/emails/estudio/). Degrada limpio si Resend no está
// configurado → { skipped } (mismo patrón que sustituciones/email.ts).

export async function enviarEmailPedirValoracion(params: {
  to: string;
  toName: string;
  // Ya resuelta por quien llama, UNA vez por estudio: resolverla aquí sería una
  // tanda de consultas por cada alumna de la misma clase.
  marca: MarcaCorreo;
  claseNombre: string;
  cuando: string;
  instructorNombre: string;
  url: string;
  // Para que la alumna conteste a SU estudio y no al buzón de la plataforma.
  replyTo?: string;
}): Promise<{ ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  const estudioNombre = params.marca.estudioNombre;
  const { claseNombre } = params;
  const html = correoValoracion(params);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: remitentePorMarca(estudioNombre || 'Tentare'),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
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
