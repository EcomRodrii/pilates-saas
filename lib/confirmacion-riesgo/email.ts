import { Resend } from 'resend';
import { render } from '@react-email/render';
import { PedirConfirmacionEmail, RecordatorioConfirmacionEmail, PlazaLiberadaEmail } from '@/lib/emails/confirmacion-riesgo-template';

// Emails de "opción 2" del riesgo de plantón (ver lib/confirmacion-riesgo/logica.ts):
// pedir confirmación a quien tiene riesgo alto, y avisar con delicadeza si no
// respondió a tiempo y se liberó su plaza. Plantilla premium compartida
// (lib/emails/layout.tsx). Mismo patrón de degradación que sustituciones/
// valoraciones: sin RESEND_API_KEY → { skipped }, nunca rompe el flujo que la llama.

interface Marca {
  logoUrl?: string | null;
  colorPrimario?: string | null;
}

type EnvioResultado = { ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string };

async function enviar(to: string, subject: string, html: string): Promise<EnvioResultado> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!to) return { ok: false, error: 'Sin destinatario' };
  const resend = new Resend(apiKey);
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
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
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string; url: string;
}): Promise<EnvioResultado> {
  const html = await render(PedirConfirmacionEmail(params));
  return enviar(params.to, `¿Vienes a ${params.claseNombre}? — ${params.estudioNombre}`, html);
}

export async function enviarEmailRecordatorioConfirmacion(params: Marca & {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string; url: string;
}): Promise<EnvioResultado> {
  const html = await render(RecordatorioConfirmacionEmail(params));
  return enviar(params.to, `¿Nos falta tu confirmación? — ${params.claseNombre}`, html);
}

export async function enviarEmailPlazaLiberada(params: Marca & {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string;
}): Promise<EnvioResultado> {
  const html = await render(PlazaLiberadaEmail(params));
  return enviar(params.to, `Hemos liberado tu plaza en ${params.claseNombre} — ${params.estudioNombre}`, html);
}
