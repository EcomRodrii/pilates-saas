import { Resend } from 'resend';
import { render } from '@react-email/render';
import { ReferenciaSolicitudEmail } from '@/lib/emails/referencia-solicitud-template';
import { remitentePorMarca } from '@/lib/emails/remitente';

// Envío del email de solicitud de referencia (app/api/network/referencias).
// Mismo patrón best-effort que invitacion-equipo-server.ts/solicitud-
// disponibilidad-server.ts: si falla, la fila de red_referencias ya se creó
// — el caller decide qué decirle a la profesional, no rompe la petición por
// un email que no salió.
export async function enviarEmailReferenciaSolicitud(params: {
  to: string;
  nombreReferente: string;
  profesionalNombre: string;
  relacion?: string | null;
  url: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    const html = await render(ReferenciaSolicitudEmail(params));
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: remitentePorMarca('Tentare Network'),
      to: [params.to],
      subject: `${params.profesionalNombre} te ha puesto como referencia en Tentare Network`,
      html,
    });
    if (error) { console.error('[referencia-solicitud-server]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[referencia-solicitud-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
