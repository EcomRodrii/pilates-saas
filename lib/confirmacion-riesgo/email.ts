import { Resend } from 'resend';
import { correoPedirConfirmacion, correoRecordatorioConfirmacion, correoPlazaLiberadaSinConfirmar } from '@/lib/emails/estudio/avisos';
import type { MarcaCorreo } from '@/lib/emails/estudio/plantilla';
import { remitentePorMarca } from '../emails/remitente.ts';

// Emails de "opción 2" del riesgo de plantón (ver lib/confirmacion-riesgo/logica.ts):
// pedir confirmación a quien tiene riesgo alto, y avisar con delicadeza si no
// respondió a tiempo y se liberó su plaza. Sistema de correos del estudio
// (lib/emails/estudio/). Mismo patrón de degradación que sustituciones/
// valoraciones: sin RESEND_API_KEY → { skipped }, nunca rompe el flujo que la llama.

/** La marca ya resuelta por quien llama, más a dónde contesta la alumna. */
interface Marca {
  marca: MarcaCorreo;
  replyTo?: string;
}

type EnvioResultado = { ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string };

async function enviar(to: string, subject: string, html: string, estudioNombre: string, replyTo?: string): Promise<EnvioResultado> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!to) return { ok: false, error: 'Sin destinatario' };
  const resend = new Resend(apiKey);
  try {
    const { data, error } = await resend.emails.send({
      from: remitentePorMarca(estudioNombre || 'Tentare'),
      // Si la alumna contesta «no puedo ir», esa respuesta tiene que llegarle a
      // SU estudio y no al buzón compartido de la plataforma.
      ...(replyTo ? { replyTo } : {}),
      to: [to],
      subject,
      html,
    });
    if (error) { console.error('[confirmacion-riesgo/email]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[confirmacion-riesgo/email]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar' };
  }
}

export async function enviarEmailPedirConfirmacion(params: Marca & {
  to: string; toName: string; claseNombre: string; cuando: string; url: string;
}): Promise<EnvioResultado> {
  const estudio = params.marca.estudioNombre;
  return enviar(params.to, `¿Vienes a ${params.claseNombre}? — ${estudio}`, correoPedirConfirmacion(params), estudio, params.replyTo);
}

export async function enviarEmailRecordatorioConfirmacion(params: Marca & {
  to: string; toName: string; claseNombre: string; cuando: string; url: string;
}): Promise<EnvioResultado> {
  return enviar(params.to, `¿Nos falta tu confirmación? — ${params.claseNombre}`, correoRecordatorioConfirmacion(params), params.marca.estudioNombre, params.replyTo);
}

export async function enviarEmailPlazaLiberada(params: Marca & {
  to: string; toName: string; claseNombre: string; cuando: string; url?: string;
}): Promise<EnvioResultado> {
  const estudio = params.marca.estudioNombre;
  return enviar(params.to, `Hemos liberado tu plaza en ${params.claseNombre} — ${estudio}`, correoPlazaLiberadaSinConfirmar(params), estudio, params.replyTo);
}
