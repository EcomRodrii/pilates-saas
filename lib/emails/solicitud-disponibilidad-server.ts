import { Resend } from 'resend';
import { render } from '@react-email/render';
import { SolicitudDisponibilidadEmail } from '@/lib/emails/solicitud-disponibilidad-template';

// Envío del email de "pedir disponibilidad" (P2-10, app/api/sustituciones/pedir-disponibilidad).
// Mismo patrón best-effort que invitacion-equipo-server.ts: si falla, el
// caller decide qué decirle a la propietaria — no rompe el resto del envío
// masivo por un solo destinatario.
export async function enviarEmailSolicitudDisponibilidad(params: {
  to: string;
  nombre: string;
  propietariaNombre: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  url: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    const html = await render(SolicitudDisponibilidadEmail(params));
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [params.to],
      subject: `${params.propietariaNombre} te pide tu disponibilidad — ${params.estudioNombre}`,
      html,
    });
    if (error) { console.error('[solicitud-disponibilidad-server]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[solicitud-disponibilidad-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
