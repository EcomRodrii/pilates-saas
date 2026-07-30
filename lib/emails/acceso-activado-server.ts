import { Resend } from 'resend';
import { render } from '@react-email/render';
import { AccesoActivadoEmail } from '@/lib/emails/acceso-activado-template';
import { remitentePorMarca } from '@/lib/emails/remitente';

// Aviso al estudio cuando alguien del equipo activa su acceso
// (app/api/equipo/reclamar). Best-effort como el resto de envíos: la
// vinculación ya está hecha cuando esto corre, así que un email que no sale no
// puede tumbarla.
export async function enviarEmailAccesoActivado(params: {
  to: string;
  nombre: string;
  emailCuenta: string | null;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    const html = await render(AccesoActivadoEmail(params));
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: remitentePorMarca('Tentare Manager'),
      to: [params.to],
      subject: `${params.nombre} ya tiene acceso a ${params.estudioNombre}`,
      html,
    });
    if (error) { console.error('[acceso-activado-server]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[acceso-activado-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
