import { Resend } from 'resend';

// Email de contacto a una candidata para cubrir una clase. Dos botones grandes:
// ACEPTO / No puedo — que llevan al deep link de aceptación (un tap, sin login).
// Mismo patrón de degradación que send-server.ts: si Resend no está configurado,
// no falla → { skipped }.

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export async function enviarEmailContactoSustituta(params: {
  to: string;
  toName: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string; // texto ya formateado, p.ej. "lunes 20 de julio · 18:00"
  url: string;    // la página de respuesta (ACEPTO / No puedo se pulsan allí)
}): Promise<{ ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  const { toName, estudioNombre, claseNombre, cuando, url } = params;
  // El botón lleva a una PÁGINA (nunca acepta por GET: los prefetchers de correo
  // dispararían la aceptación al abrir el email). Allí pulsa ACEPTO / No puedo.
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 12px">Hola ${esc(toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px">
      ${esc(estudioNombre)} necesita cubrir una clase y has salido como la mejor opción:
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 24px">
      <p style="font-size:17px;font-weight:700;margin:0 0 4px">${esc(claseNombre)}</p>
      <p style="font-size:15px;color:#64748b;margin:0">${esc(cuando)}</p>
    </div>
    <a href="${url}" style="display:block;text-align:center;background:#4f46e5;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px;border-radius:12px">
      Ver la clase y responder
    </a>
    <p style="font-size:12px;color:#94a3b8;margin:22px 0 0;text-align:center">
      Un solo toque, sin instalar nada. Si otra persona la coge antes, te avisamos.
    </p>
  </div>`;

  return enviar(params.to, `¿Puedes cubrir ${claseNombre}? — ${estudioNombre}`, html);
}

// ── Avisos a las alumnas apuntadas ──────────────────────────────────────────

// Se ha confirmado sustituta: la clase sigue en pie (mensaje tranquilizador).
export async function enviarEmailAlumnaClaseCubierta(params: {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string; sustituta: string;
}): Promise<EnvioResultado> {
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 14px">Hola ${esc(params.toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 18px">
      Tu clase <strong>${esc(params.claseNombre)}</strong> del ${esc(params.cuando)} <strong>sigue en pie</strong>.
      La dará <strong>${esc(params.sustituta)}</strong>. No tienes que hacer nada.
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:18px 0 0">${esc(params.estudioNombre)}</p>
  </div>`;
  return enviar(params.to, `Tu clase sigue en pie — ${params.claseNombre}`, html);
}

// No hay sustituta: la clase se cancela (que se entere por ti, no en la puerta).
export async function enviarEmailAlumnaClaseCancelada(params: {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string;
}): Promise<EnvioResultado> {
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 14px">Hola ${esc(params.toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 18px">
      Sentimos avisarte de que tu clase <strong>${esc(params.claseNombre)}</strong> del ${esc(params.cuando)}
      <strong>se cancela</strong>. Disculpa las molestias — te esperamos en la próxima.
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:18px 0 0">${esc(params.estudioNombre)}</p>
  </div>`;
  return enviar(params.to, `Clase cancelada — ${params.claseNombre}`, html);
}

type EnvioResultado = { ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string };

async function enviar(to: string, subject: string, html: string): Promise<EnvioResultado> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!to) return { ok: false, error: 'Sin destinatario' };
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [to], subject, html,
    });
    if (error) { console.error('[sustituciones/email]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[sustituciones/email]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar' };
  }
}
