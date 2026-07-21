import { Resend } from 'resend';

// Emails de "opción 2" del riesgo de plantón (ver lib/confirmacion-riesgo/logica.ts):
// pedir confirmación a quien tiene riesgo alto, y avisar con delicadeza si no
// respondió a tiempo y se liberó su plaza. Mismo patrón de degradación que
// sustituciones/valoraciones: sin RESEND_API_KEY → { skipped }, nunca rompe el
// flujo que la llama.

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
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

// Se pide confirmación (víspera de clase, ~24h antes). Un solo botón, sin
// vueltas: la validación en las entrevistas del resto del módulo manda que sea
// un toque, no un formulario.
export async function enviarEmailPedirConfirmacion(params: {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string; url: string;
}): Promise<EnvioResultado> {
  const { toName, estudioNombre, claseNombre, cuando, url } = params;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 12px">Hola ${esc(toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px">¿Sigues viniendo a tu clase? Confírmanoslo en un toque:</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 24px">
      <p style="font-size:17px;font-weight:700;margin:0 0 4px">${esc(claseNombre)}</p>
      <p style="font-size:15px;color:#64748b;margin:0">${esc(cuando)}</p>
    </div>
    <a href="${url}" style="display:block;text-align:center;background:#6D28D9;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px;border-radius:12px">
      Sí, voy a venir
    </a>
    <p style="font-size:12px;color:#94a3b8;margin:22px 0 0;text-align:center">
      Si no confirmas, liberaremos tu plaza para que otra persona pueda venir.
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:22px 0 0">${esc(estudioNombre)}</p>
  </div>`;
  return enviar(params.to, `¿Vienes a ${claseNombre}? — ${estudioNombre}`, html);
}

// No respondió a tiempo y se liberó su plaza. Tono informativo, no de castigo:
// el objetivo es que sea fácil volver a reservar, no hacerla sentir mal.
export async function enviarEmailPlazaLiberada(params: {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string;
}): Promise<EnvioResultado> {
  const { toName, estudioNombre, claseNombre, cuando } = params;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 12px">Hola ${esc(toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px">
      No hemos tenido confirmación para tu clase, así que hemos liberado tu plaza para que otra persona en lista de espera pueda venir.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 24px">
      <p style="font-size:17px;font-weight:700;margin:0 0 4px">${esc(claseNombre)}</p>
      <p style="font-size:15px;color:#64748b;margin:0">${esc(cuando)}</p>
    </div>
    <p style="font-size:15px;line-height:1.5;margin:0">¿Te apetece reservar otra clase? Estaremos encantados de tenerte.</p>
    <p style="font-size:13px;color:#94a3b8;margin:22px 0 0">${esc(estudioNombre)}</p>
  </div>`;
  return enviar(params.to, `Hemos liberado tu plaza en ${claseNombre} — ${estudioNombre}`, html);
}
