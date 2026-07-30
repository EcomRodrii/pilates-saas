import { Resend } from 'resend';
import { render } from '@react-email/render';
import { InvitacionEquipoEmail } from '@/lib/emails/invitacion-equipo-template';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { nombreAppPorRol } from '@/lib/permisos-reglas';
import type { Rol } from '@/lib/types';

// Envío del email de invitación al dar de alta a alguien en el equipo
// (app/api/equipo/route.ts). Antes la ficha se creaba con email pero nadie se
// enteraba salvo de palabra. Best-effort: si falla, el alta ya se hizo — el
// caller no debe romper la respuesta por un email que no salió.
export async function enviarEmailInvitacionEquipo(params: {
  to: string;
  nombre: string;
  propietariaNombre: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  rol: string;
  url: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    const html = await render(InvitacionEquipoEmail(params));
    const marca = nombreAppPorRol((params.rol as Rol) ?? 'INSTRUCTOR');
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: remitentePorMarca(marca),
      to: [params.to],
      subject: `${params.propietariaNombre} te ha invitado a ${params.estudioNombre} en ${marca}`,
      html,
    });
    if (error) { console.error('[invitacion-equipo-server]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[invitacion-equipo-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
