import { Resend } from 'resend';
import { render } from '@react-email/render';
import { EstudioVencidoEmail } from '@/lib/emails/estudio-vencido-template';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { LEGAL } from '@/lib/legal-info';
import { asuntoAvisoEstudioVencido, formatearFechaAviso, purgaEstudiosActiva } from '@/lib/retencion/ciclo-estudios-vencidos';

// Aviso del ciclo de estudios vencidos (30 y 83 días). A diferencia del resto de
// emails best-effort, aquí el resultado MANDA: si no sale, el ciclo no avanza
// (sin aviso entregado a Resend no hay borrado).
export async function enviarAvisoEstudioVencido(params: {
  to: string;
  fase: 'aviso_30' | 'aviso_final';
  estudioNombre: string;
  fechaPurga: Date;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };
  if (esDominioReservado(params.to)) return { ok: false, error: 'Email de ejemplo, no una dirección real' };

  const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
  try {
    const html = await render(EstudioVencidoEmail({
      fase: params.fase,
      estudioNombre: params.estudioNombre,
      fechaPurga: formatearFechaAviso(params.fechaPurga),
      // El texto tiene que decir lo que el motor va a hacer, no lo que el ciclo
      // describe sobre el papel: con el interruptor apagado ese día solo se
      // calcula un informe. Se lee aquí y no se pasa desde el ciclo para que
      // ningún llamante pueda prometer un borrado que no está armado.
      purgaArmada: purgaEstudiosActiva(process.env),
      urlSuscripcion: `${base}/suscripcion`,
      // No `/configuracion?tab=backups`: con la prueba agotada el panel redirige
      // a /suscripcion y ese enlace nunca llegaría a la exportación.
      urlExportar: `${base}/suscripcion#exportar-datos`,
    }));
    const { error } = await new Resend(apiKey).emails.send({
      from: remitentePorMarca('Tentare'),
      to: [params.to],
      subject: asuntoAvisoEstudioVencido(params.fase, params.fechaPurga, purgaEstudiosActiva(process.env)),
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
