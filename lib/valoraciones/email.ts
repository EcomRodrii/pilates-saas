import { Resend } from 'resend';

// Email a la alumna tras la clase pidiéndole que la valore. Un botón → la página
// pública de valoración (deep link firmado, sin login). Degrada limpio si Resend
// no está configurado → { skipped } (mismo patrón que sustituciones/email.ts).

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export async function enviarEmailPedirValoracion(params: {
  to: string;
  toName: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
  instructorNombre: string;
  url: string;
}): Promise<{ ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  const { toName, estudioNombre, claseNombre, cuando, instructorNombre, url } = params;
  const conQuien = instructorNombre ? ` con ${esc(instructorNombre)}` : '';
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 12px">Hola ${esc(toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px">
      ¿Qué tal tu clase${conQuien}? Tu opinión ayuda a ${esc(estudioNombre)} a cuidar cada clase. Es un toque, 10 segundos:
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 24px">
      <p style="font-size:17px;font-weight:700;margin:0 0 4px">${esc(claseNombre)}</p>
      <p style="font-size:15px;color:#64748b;margin:0">${esc(cuando)}</p>
    </div>
    <a href="${url}" style="display:block;text-align:center;background:#6D28D9;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px;border-radius:12px">
      ⭐ Valorar la clase
    </a>
    <p style="font-size:12px;color:#94a3b8;margin:22px 0 0;text-align:center">
      Sin instalar nada. Solo tú y tu estudio veis esto.
    </p>
  </div>`;

  const apiKeyResend = new Resend(apiKey);
  try {
    const { data, error } = await apiKeyResend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [params.to],
      subject: `¿Qué tal tu clase de ${claseNombre}? — ${estudioNombre}`,
      html,
    });
    if (error) { console.error('[valoraciones/email]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[valoraciones/email]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar' };
  }
}
