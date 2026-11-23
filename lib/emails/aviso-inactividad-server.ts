import { Resend } from 'resend';
import { correoInactividad } from '@/lib/emails/tentare/inactividad';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { LEGAL } from '@/lib/legal-info';
import { nombreAppPorRol } from '@/lib/permisos-reglas';

// Envío del aviso de inactividad (lib/retencion/aviso-inactividad.ts). Va a la PROPIETARIA, así que el
// remitente es el del equipo (`nombreAppPorRol('PROPIETARIO')`), como el resto de correos de Tentare al
// estudio. Nunca lanza: devuelve {ok:false, error} para que el barrido decida qué hacer.
export async function enviarAvisoInactividad(params: {
  to: string;
  estudioNombre: string;
  dias: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };
  try {
    const { asunto, html } = correoInactividad({
      estudioNombre: params.estudioNombre,
      dias: params.dias,
      urlPanel: `${process.env.NEXT_PUBLIC_APP_URL || LEGAL.url}/dashboard`,
    });
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: remitentePorMarca(nombreAppPorRol('PROPIETARIO')),
      to: [params.to],
      replyTo: LEGAL.email,
      subject: asunto,
      html,
    });
    if (error) { console.error('[aviso-inactividad-server]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[aviso-inactividad-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
