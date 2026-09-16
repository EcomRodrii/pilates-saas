import { Resend } from 'resend';
import { correoResumenSemanal } from '@/lib/emails/tentare/cuenta';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { LEGAL } from '@/lib/legal-info';
import { nombreAppPorRol } from '@/lib/permisos-reglas';

// Envío del resumen de "semana tranquila" (lib/decision/resumen-semanal-cron.ts).
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
  crecimientoPct?: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    // Sin `resolverMarcaEstudio`: este correo lo firma Tentare, no el estudio,
    // así que ahorra las tres consultas que hacía solo para el logo y el color.
    const html = correoResumenSemanal({
      propietariaNombre: params.propietariaNombre,
      estudioNombre: params.estudioNombre,
      rangoTexto: params.rangoTexto,
      crecimientoPct: params.crecimientoPct,
      urlCentroDeControl: `${process.env.NEXT_PUBLIC_APP_URL || LEGAL.url}/centro-de-control`,
    });
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
