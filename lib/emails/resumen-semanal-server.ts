import { Resend } from 'resend';
import { render } from '@react-email/render';
import { ResumenSemanalEmail } from '@/lib/emails/resumen-semanal-template';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
import { nombreAppPorRol } from '@/lib/permisos-reglas';

// Envío del resumen de "semana tranquila" (lib/inngest/resumen-semanal.ts).
// Va siempre a la PROPIETARIA (equipo, no una socia), así que el remitente
// usa nombreAppPorRol('PROPIETARIO') = 'Tentare Manager' — mismo criterio que
// invitacion-equipo-server.ts para el resto de emails al equipo del estudio.
// Best-effort: si Resend no está configurado, {skipped:true} sin romper el
// cron (mismo patrón que el resto de *-server.ts).
export async function enviarEmailResumenSemanal(params: {
  to: string;
  propietariaNombre: string;
  studioId: string;
  estudioNombre: string;
  rangoTexto: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    const marcaEstudio = await resolverMarcaEstudio(params.studioId);
    const html = await render(ResumenSemanalEmail({
      propietariaNombre: params.propietariaNombre,
      estudioNombre: params.estudioNombre,
      logoUrl: marcaEstudio.logoUrl,
      colorPrimario: marcaEstudio.colorPrimario,
      rangoTexto: params.rangoTexto,
    }));
    const marca = nombreAppPorRol('PROPIETARIO');
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: remitentePorMarca(marca),
      to: [params.to],
      subject: `${params.estudioNombre}: semana tranquila, sin nada pendiente`,
      html,
    });
    if (error) { console.error('[resumen-semanal-server]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[resumen-semanal-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
